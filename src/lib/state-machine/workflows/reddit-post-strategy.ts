/**
 * Reddit Post Workflow Strategy
 *
 * Simple workflow: Login → Reddit Warmup (optional) → Publish Posts → Done
 * Publishes image or video posts to specified subreddits.
 *
 * The main state machine handles:
 * - INIT → START_ENV → CONFIRM_ENV_RUNNING → INSTALL_APP →
 *   CONFIRM_APP_INSTALLED → LOGIN → POLL_LOGIN_TASK
 *
 * This strategy handles:
 * - REDDIT_WARMUP → POLL_REDDIT_WARMUP_TASK (optional)
 * - REDDIT_POST → POLL_REDDIT_POST_TASK → DONE
 */

import { GeeLarkAPIError } from '@/lib/geelark/client';
import { WorkflowStrategy, WorkflowContext, StateHandler } from './types';
import {
  PhoneJob,
  PhoneState,
  RetryableState,
  REDDIT_POST_TOTAL_STEPS,
  RedditPostContent,
} from '../types';
import { validateMediaUrls, formatValidationErrors } from '@/lib/utils/media-validation';

/**
 * Error thrown when a phone is not running and needs restart
 */
class PhoneNotRunningError extends Error {
  constructor(public envId: string) {
    super(`Phone ${envId} is not running, needs restart`);
    this.name = 'PhoneNotRunningError';
  }
}

// GeeLark API response codes
const GEELARK_ERROR_CODES = {
  SUCCESS: 0,
  ENV_NOT_RUNNING: 42002,
};

// Task timeouts
const WARMUP_TASK_TIMEOUT_SECONDS = 600; // 10 minutes
const POST_TASK_TIMEOUT_SECONDS = 900; // 15 minutes for video uploads

export class RedditPostStrategy implements WorkflowStrategy {
  readonly name = 'reddit_post';
  readonly displayName = 'Reddit Post';
  readonly description = 'Publish image or video posts to subreddits';

  /**
   * Track current post index for multi-post publishing
   */
  private postIndex: Map<string, number> = new Map();

  /**
   * Reddit workflows require login via custom RPA task flow
   * Must configure a Reddit login flow in Advanced Settings
   */
  requiresLogin(): boolean {
    return true;
  }

  /**
   * Get the first state after login completes
   */
  getPostLoginState(job: PhoneJob): PhoneState {
    // Check if warmup is enabled for this account
    if (job.account?.flags.runWarmup) {
      return 'REDDIT_WARMUP';
    }

    // Check if there are posts to publish
    if (job.account?.redditPosts && job.account.redditPosts.length > 0) {
      this.postIndex.set(job.envId, 0);
      return 'REDDIT_POST';
    }

    // No posts - go directly to done
    return 'DONE';
  }

  /**
   * Get handler for workflow-specific states
   */
  getStateHandler(
    state: PhoneState,
    context: WorkflowContext
  ): StateHandler | null {
    switch (state) {
      case 'REDDIT_WARMUP':
        return () => this.handleRedditWarmup(context);
      case 'POLL_REDDIT_WARMUP_TASK':
        return () => this.handlePollRedditWarmupTask(context);
      case 'REDDIT_POST':
        return () => this.handleRedditPost(context);
      case 'POLL_REDDIT_POST_TASK':
        return () => this.handlePollRedditPostTask(context);
      default:
        return null;
    }
  }

  /**
   * Get total steps for progress tracking
   */
  getTotalSteps(): number {
    return REDDIT_POST_TOTAL_STEPS;
  }

  /**
   * Get retryable states for Reddit post workflow
   */
  getRetryableStates(): RetryableState[] {
    return ['REDDIT_WARMUP', 'REDDIT_POST'];
  }

  // ==================== State Handlers ====================

  /**
   * REDDIT_WARMUP: Start Reddit warmup task
   */
  private async handleRedditWarmup(ctx: WorkflowContext): Promise<void> {
    await ctx.withRetry('REDDIT_WARMUP', async () => {
      const keyword = ctx.job.account?.flags.redditWarmupKeyword;
      const username = ctx.job.account?.username || 'unknown';

      ctx.log('info', `Starting Reddit warmup${keyword ? ` with keyword: ${keyword}` : ''}`);

      const response = await ctx.client.redditWarmup(ctx.job.envId, {
        keyword,
        name: `Reddit Warmup for ${username}`,
      });

      if (response.code === GEELARK_ERROR_CODES.SUCCESS) {
        ctx.job.tasks.redditWarmupTaskId = response.data.taskId;
        ctx.transitionTo('POLL_REDDIT_WARMUP_TASK');
        ctx.log('info', `Reddit warmup task started: ${response.data.taskId}`);
        return;
      }

      if (response.code === GEELARK_ERROR_CODES.ENV_NOT_RUNNING) {
        throw new PhoneNotRunningError(ctx.job.envId);
      }

      throw new GeeLarkAPIError('redditWarmup', response.code, response.msg);
    });
  }

  /**
   * POLL_REDDIT_WARMUP_TASK: Wait for Reddit warmup task to complete
   */
  private async handlePollRedditWarmupTask(ctx: WorkflowContext): Promise<void> {
    const taskId = ctx.job.tasks.redditWarmupTaskId;

    if (!taskId) {
      ctx.log('warn', 'No Reddit warmup task ID found, moving to post');
      this.transitionToPostOrDone(ctx);
      return;
    }

    const result = await ctx.pollTask(taskId, 'warmup', WARMUP_TASK_TIMEOUT_SECONDS);

    if (result.status === 3) {
      ctx.log('info', 'Reddit warmup completed successfully');
      this.transitionToPostOrDone(ctx);
      return;
    }

    if (result.status === 4) {
      // Warmup failed but we can still try to post
      ctx.log('warn', `Reddit warmup failed: ${result.failDesc || 'Unknown error'}, continuing to post`);
      this.transitionToPostOrDone(ctx);
      return;
    }
  }

  /**
   * Helper to transition to REDDIT_POST or DONE based on available posts
   */
  private transitionToPostOrDone(ctx: WorkflowContext): void {
    const posts = ctx.job.account?.redditPosts || [];
    if (posts.length > 0) {
      this.postIndex.set(ctx.job.envId, 0);
      ctx.transitionTo('REDDIT_POST');
    } else {
      ctx.transitionTo('DONE');
    }
  }

  /**
   * REDDIT_POST: Publish a post to Reddit
   */
  private async handleRedditPost(ctx: WorkflowContext): Promise<void> {
    const posts = ctx.job.account?.redditPosts || [];
    const currentIndex = this.postIndex.get(ctx.job.envId) || 0;
    const post = posts[currentIndex];

    if (!post) {
      ctx.log('info', 'No more posts to publish');
      ctx.transitionTo('DONE');
      return;
    }

    await ctx.withRetry('REDDIT_POST', async () => {
      await this.publishRedditPost(ctx, post, currentIndex);
    });
  }

  /**
   * Publish a single Reddit post
   */
  private async publishRedditPost(
    ctx: WorkflowContext,
    post: RedditPostContent,
    postIndex: number
  ): Promise<void> {
    const username = ctx.job.account?.username || 'unknown';

    ctx.log(
      'info',
      `Publishing Reddit ${post.type} post ${postIndex + 1} to r/${post.community}: "${post.title.substring(0, 50)}..."`
    );

    // Validate media URLs
    if (post.mediaUrls.length > 0) {
      ctx.log('debug', 'Validating media URLs...');
      const validation = await validateMediaUrls(post.mediaUrls);

      if (!validation.allValid) {
        const errorMsg = formatValidationErrors(validation.invalidUrls);
        ctx.log('error', `Media validation failed:\n${errorMsg}`);
        throw new Error(
          `Media URLs not accessible - files may have been deleted or URLs are incorrect. ${errorMsg}`
        );
      }
      ctx.log('debug', `All ${post.mediaUrls.length} media URL(s) validated successfully`);
    }

    let response;

    if (post.type === 'video') {
      response = await ctx.client.redditPublishVideo(
        ctx.job.envId,
        post.title,
        post.community,
        post.mediaUrls,
        {
          description: post.description,
          name: `Reddit Post ${postIndex + 1} for ${username}`,
        }
      );
    } else {
      response = await ctx.client.redditPublishImage(
        ctx.job.envId,
        post.title,
        post.community,
        post.mediaUrls,
        {
          description: post.description,
          name: `Reddit Post ${postIndex + 1} for ${username}`,
        }
      );
    }

    if (response.code === GEELARK_ERROR_CODES.SUCCESS) {
      ctx.job.tasks.redditPostTaskId = response.data.taskId;
      ctx.transitionTo('POLL_REDDIT_POST_TASK');
      ctx.log('info', `Reddit post task started: ${response.data.taskId}`);
      return;
    }

    if (response.code === GEELARK_ERROR_CODES.ENV_NOT_RUNNING) {
      throw new PhoneNotRunningError(ctx.job.envId);
    }

    throw new GeeLarkAPIError(
      post.type === 'video' ? 'redditPublishVideo' : 'redditPublishImage',
      response.code,
      response.msg
    );
  }

  /**
   * POLL_REDDIT_POST_TASK: Wait for Reddit post task to complete
   */
  private async handlePollRedditPostTask(ctx: WorkflowContext): Promise<void> {
    const taskId = ctx.job.tasks.redditPostTaskId;

    if (!taskId) {
      ctx.log('warn', 'No Reddit post task ID found');
      this.advanceToNextPostOrDone(ctx);
      return;
    }

    const result = await ctx.pollTask(taskId, 'publish', POST_TASK_TIMEOUT_SECONDS);

    if (result.status === 3) {
      const currentIndex = this.postIndex.get(ctx.job.envId) || 0;
      ctx.log('info', `Reddit post ${currentIndex + 1} published successfully`);
      this.advanceToNextPostOrDone(ctx);
      return;
    }

    if (result.status === 4) {
      throw new Error(`Reddit post failed: ${result.failDesc || 'Unknown error'}`);
    }
  }

  /**
   * Advance to next post or complete
   */
  private advanceToNextPostOrDone(ctx: WorkflowContext): void {
    const posts = ctx.job.account?.redditPosts || [];
    const currentIndex = this.postIndex.get(ctx.job.envId) || 0;
    const nextIndex = currentIndex + 1;

    if (nextIndex < posts.length) {
      this.postIndex.set(ctx.job.envId, nextIndex);
      ctx.transitionTo('REDDIT_POST');
    } else {
      this.postIndex.delete(ctx.job.envId);
      ctx.transitionTo('DONE');
    }
  }
}
