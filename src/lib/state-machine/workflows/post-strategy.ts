/**
 * Post Only Workflow Strategy
 *
 * Simple workflow: Login → Publish Posts → Done
 * No warmup, no profile setup - just sign in and post content.
 *
 * The main state machine handles:
 * - INIT → START_ENV → CONFIRM_ENV_RUNNING → INSTALL_IG →
 *   CONFIRM_IG_INSTALLED → LOGIN → POLL_LOGIN_TASK
 *
 * This strategy handles:
 * - PUBLISH_POST_1 → POLL_POST_1_TASK → PUBLISH_POST_2 → POLL_POST_2_TASK → DONE
 */

import { GeeLarkAPIError } from '@/lib/geelark/client';
import { WorkflowStrategy, WorkflowContext, StateHandler } from './types';
import { PhoneJob, PhoneState, RetryableState } from '../types';
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

// Total steps for progress tracking:
// START_ENV, CONFIRM_ENV, INSTALL_IG, CONFIRM_IG, LOGIN, POLL_LOGIN, POST_1, POLL_POST_1, POST_2, POLL_POST_2
const POST_TOTAL_STEPS = 10;

// Minimum timeout for publish tasks (15 minutes) - videos can take a long time to upload/process
const PUBLISH_TASK_TIMEOUT_SECONDS = 900;

// Time to wait after starting Instagram app before publishing
const APP_LAUNCH_DELAY_MS = 3000;

export class PostOnlyStrategy implements WorkflowStrategy {
  readonly name = 'post';
  readonly displayName = 'Post Only';
  readonly description = 'Login and publish posts (no warmup)';

  /**
   * Instagram post workflow requires login via instagramLogin RPA task
   */
  requiresLogin(): boolean {
    return true;
  }

  /**
   * Get the first state after login completes
   */
  getPostLoginState(job: PhoneJob): PhoneState {
    // Check if there are posts to publish
    if (job.account?.posts && job.account.posts.length > 0) {
      return 'PUBLISH_POST_1';
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
      case 'PUBLISH_POST_1':
        return () => this.handlePublishPost(context, 0);
      case 'POLL_POST_1_TASK':
        return () => this.handlePollPostTask(context, 0);
      case 'PUBLISH_POST_2':
        return () => this.handlePublishPost(context, 1);
      case 'POLL_POST_2_TASK':
        return () => this.handlePollPostTask(context, 1);
      default:
        return null;
    }
  }

  /**
   * Get total steps for progress tracking
   */
  getTotalSteps(): number {
    return POST_TOTAL_STEPS;
  }

  /**
   * Get retryable states for post workflow
   */
  getRetryableStates(): RetryableState[] {
    return ['PUBLISH_POST_1', 'PUBLISH_POST_2'];
  }

  // ==================== State Handlers ====================

  /**
   * Ensure Instagram app is in foreground before publishing
   *
   * Sometimes after login the app exits to home screen, so we need to
   * bring it back to foreground before attempting to publish.
   */
  private async ensureInstagramRunning(ctx: WorkflowContext): Promise<void> {
    ctx.log('info', 'Ensuring Instagram is in foreground...');

    try {
      const response = await ctx.client.startApp(ctx.job.envId, {
        appVersionId: ctx.config.igAppVersionId,
      });

      if (response.code === GEELARK_ERROR_CODES.SUCCESS) {
        ctx.log('debug', 'Instagram app started successfully');
      } else {
        // Non-fatal - the app might already be running
        ctx.log('debug', `startApp returned code ${response.code}: ${response.msg}`);
      }
    } catch (error) {
      // Non-fatal error - log and continue
      const errorMsg = error instanceof Error ? error.message : String(error);
      ctx.log('warn', `Could not start Instagram app: ${errorMsg}`);
    }

    // Wait for app to come to foreground
    await ctx.sleepWithAbort(APP_LAUNCH_DELAY_MS);
  }

  /**
   * PUBLISH_POST: Publish a post (video or images)
   */
  private async handlePublishPost(
    ctx: WorkflowContext,
    postIndex: number
  ): Promise<void> {
    // Ensure Instagram is in foreground before first post
    if (postIndex === 0) {
      await this.ensureInstagramRunning(ctx);
    }

    const posts = ctx.job.account?.posts || [];
    const post = posts[postIndex];

    // If no post at this index, skip to next state or DONE
    if (!post) {
      if (postIndex === 0) {
        ctx.log('info', 'No posts to publish');
        ctx.transitionTo('DONE');
      } else {
        ctx.log('info', 'No second post to publish');
        ctx.transitionTo('DONE');
      }
      return;
    }

    const stateName = postIndex === 0 ? 'PUBLISH_POST_1' : 'PUBLISH_POST_2';

    await ctx.withRetry(stateName, async () => {
      let response;

      // Debug: Log exactly what's being sent to the API
      ctx.log('info', `Publishing post ${postIndex + 1}: type=${post.type}, description="${post.description.substring(0, 50)}...", mediaUrls=${JSON.stringify(post.mediaUrls)}`);

      // Validate media URLs are accessible before publishing
      if (post.mediaUrls.length > 0) {
        ctx.log('debug', 'Validating media URLs...');
        const validation = await validateMediaUrls(post.mediaUrls);

        if (!validation.allValid) {
          const errorMsg = formatValidationErrors(validation.invalidUrls);
          ctx.log('error', `Media validation failed:\n${errorMsg}`);
          throw new Error(`Media URLs not accessible - files may have been deleted or URLs are incorrect. ${errorMsg}`);
        }
        ctx.log('debug', `All ${post.mediaUrls.length} media URL(s) validated successfully`);
      }

      if (post.type === 'video') {
        response = await ctx.client.instagramPublishReelsVideo(
          ctx.job.envId,
          post.description,
          post.mediaUrls,
          { name: `Post ${postIndex + 1} for ${ctx.job.account!.username}` }
        );
      } else {
        response = await ctx.client.instagramPublishReelsImages(
          ctx.job.envId,
          post.description,
          post.mediaUrls,
          { name: `Post ${postIndex + 1} for ${ctx.job.account!.username}` }
        );
      }

      if (response.code === GEELARK_ERROR_CODES.SUCCESS) {
        // Store task ID
        if (postIndex === 0) {
          ctx.job.tasks.post1TaskId = response.data.taskId;
          ctx.transitionTo('POLL_POST_1_TASK');
        } else {
          ctx.job.tasks.post2TaskId = response.data.taskId;
          ctx.transitionTo('POLL_POST_2_TASK');
        }
        ctx.log(
          'info',
          `Post ${postIndex + 1} publish task started: ${response.data.taskId}`
        );
        return;
      }

      // Phone not running - trigger restart
      if (response.code === GEELARK_ERROR_CODES.ENV_NOT_RUNNING) {
        throw new PhoneNotRunningError(ctx.job.envId);
      }

      throw new GeeLarkAPIError(
        post.type === 'video'
          ? 'instagramPublishReelsVideo'
          : 'instagramPublishReelsImages',
        response.code,
        response.msg
      );
    });
  }

  /**
   * POLL_POST_TASK: Wait for post publish task to complete
   */
  private async handlePollPostTask(
    ctx: WorkflowContext,
    postIndex: number
  ): Promise<void> {
    const taskId =
      postIndex === 0 ? ctx.job.tasks.post1TaskId : ctx.job.tasks.post2TaskId;

    if (!taskId) {
      // No task to poll, move on
      if (postIndex === 0) {
        const posts = ctx.job.account?.posts || [];
        if (posts.length > 1) {
          ctx.transitionTo('PUBLISH_POST_2');
        } else {
          ctx.transitionTo('DONE');
        }
      } else {
        ctx.transitionTo('DONE');
      }
      return;
    }

    // Use the context's pollTask method with extended timeout for video uploads
    const result = await ctx.pollTask(taskId, 'publish', PUBLISH_TASK_TIMEOUT_SECONDS);

    // Status: 3 = success, 4 = failed
    if (result.status === 3) {
      ctx.log('info', `Post ${postIndex + 1} published successfully`);

      if (postIndex === 0) {
        const posts = ctx.job.account?.posts || [];
        if (posts.length > 1) {
          ctx.transitionTo('PUBLISH_POST_2');
        } else {
          ctx.transitionTo('DONE');
        }
      } else {
        ctx.transitionTo('DONE');
      }
      return;
    }

    if (result.status === 4) {
      throw new Error(
        `Post ${postIndex + 1} publish failed: ${result.failDesc || 'Unknown error'}`
      );
    }

    // Still in progress - pollTask handles this internally
  }
}
