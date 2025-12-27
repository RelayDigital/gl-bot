import { GeeLarkAPIError } from '@/lib/geelark/client';
import { GEELARK_ERROR_CODES, isTaskSuccess } from '@/lib/geelark/types';
import {
  PhoneJob,
  PhoneState,
  RetryableState,
  WARMUP_TOTAL_STEPS,
  WarmupProtocolConfig,
  DEFAULT_WARMUP_PROTOCOL,
} from '../types';
import { WorkflowStrategy, WorkflowContext, StateHandler } from './types';
import { validateMediaUrls, formatValidationErrors } from '@/lib/utils/media-validation';

// Minimum timeout for publish tasks (15 minutes) - videos can take a long time to upload/process
const PUBLISH_TASK_TIMEOUT_SECONDS = 900;

// Time to wait after starting Instagram app before publishing
const APP_LAUNCH_DELAY_MS = 3000;

/**
 * Custom error for phone not running (42002)
 * This triggers a restart of the phone
 */
class PhoneNotRunningError extends Error {
  constructor(public envId: string) {
    super(`Phone ${envId} is not running, needs restart`);
    this.name = 'PhoneNotRunningError';
  }
}

/**
 * Get a random integer within a range (inclusive)
 */
function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Get the warmup protocol from context, falling back to defaults
 */
function getProtocol(ctx: WorkflowContext): WarmupProtocolConfig {
  return ctx.config.warmupProtocol ?? DEFAULT_WARMUP_PROTOCOL;
}

/**
 * Warmup workflow strategy
 *
 * Flow: WARMUP → POLL_WARMUP_TASK → PUBLISH_POST_1 → POLL_POST_1_TASK →
 *       PUBLISH_POST_2 → POLL_POST_2_TASK → DONE
 *
 * Steps can be skipped:
 * - If warmup is disabled, skip directly to posts or DONE
 * - If no posts configured, skip to DONE after warmup
 */
export class WarmupStrategy implements WorkflowStrategy {
  /**
   * Instagram warmup requires login via instagramLogin RPA task
   */
  requiresLogin(): boolean {
    return true;
  }

  /**
   * Get the first state after login completes
   *
   * Checks if warmup is enabled for this account:
   * - If warmup enabled (default), go to WARMUP
   * - If warmup disabled and has posts, go to PUBLISH_POST_1
   * - If warmup disabled and no posts, go to DONE
   */
  getPostLoginState(job: PhoneJob): PhoneState {
    const warmupEnabled = job.account?.flags.runWarmup !== false;

    if (warmupEnabled) {
      return 'WARMUP';
    }

    // Warmup disabled - check for posts
    if (job.account?.posts && job.account.posts.length > 0) {
      return 'PUBLISH_POST_1';
    }

    return 'DONE';
  }

  /**
   * Get the handler for a warmup workflow state
   */
  getStateHandler(
    state: PhoneState,
    context: WorkflowContext
  ): StateHandler | null {
    switch (state) {
      case 'WARMUP':
        return () => this.handleWarmup(context);
      case 'POLL_WARMUP_TASK':
        return () => this.handlePollWarmupTask(context);
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
   * Get total steps for warmup workflow
   */
  getTotalSteps(): number {
    return WARMUP_TOTAL_STEPS;
  }

  /**
   * Get retryable states for warmup workflow
   */
  getRetryableStates(): RetryableState[] {
    return ['WARMUP', 'PUBLISH_POST_1', 'PUBLISH_POST_2'];
  }

  // ==================== State Handlers ====================

  /**
   * WARMUP: Execute Instagram warmup RPA task
   *
   * Uses the warmup protocol configuration to determine engagement levels.
   * The selectedDay in the protocol determines which settings to use:
   * - day0: Initial setup after account creation
   * - day1_2: Light warmup phase
   * - day3_7: Full activity phase
   *
   * Note: The built-in GeeLark instagramWarmup API only supports browseVideo
   * parameter. For more granular control over likes/follows, use custom task flows.
   *
   * Note: If warmup task was already started during login verification,
   * we skip starting a new one and go directly to polling.
   */
  private async handleWarmup(ctx: WorkflowContext): Promise<void> {
    // Check if warmup task was already started during login verification
    if (ctx.job.tasks.warmupTaskId) {
      ctx.log(
        'info',
        `Using existing warmup task from verification: ${ctx.job.tasks.warmupTaskId}`
      );
      ctx.transitionTo('POLL_WARMUP_TASK');
      return;
    }

    await ctx.withRetry('WARMUP', async () => {
      const protocol = getProtocol(ctx);
      const selectedDay = protocol.selectedDay;

      // Use account-specific browseVideo if set, otherwise calculate from protocol
      let browseVideo = ctx.job.account?.flags.warmupBrowseVideo;

      if (browseVideo === undefined) {
        // Calculate browseVideo based on selected day's scroll duration
        let scrollMinutes: number;

        switch (selectedDay) {
          case 'day0':
            scrollMinutes = randomInRange(
              protocol.day0.scrollMinutes.min,
              protocol.day0.scrollMinutes.max
            );
            ctx.log('info', `Warmup protocol: Day 0 (After Creation)`);
            ctx.log('debug', `  Wait: ${protocol.day0.waitMinutes.min}-${protocol.day0.waitMinutes.max} min`);
            ctx.log('debug', `  Profile photo: ${protocol.day0.addProfilePhoto ? 'Yes' : 'No'}`);
            ctx.log('debug', `  Bio: ${protocol.day0.addBio ? 'Yes' : 'No'}`);
            ctx.log('debug', `  Follows: ${protocol.day0.followCount.min}-${protocol.day0.followCount.max}`);
            ctx.log('debug', `  Scroll: ${protocol.day0.scrollMinutes.min}-${protocol.day0.scrollMinutes.max} min`);
            break;

          case 'day3_7':
            // Day 3-7 uses higher engagement, estimate ~5 min scroll
            scrollMinutes = 5;
            ctx.log('info', `Warmup protocol: Day 3-7 (Full Activity)`);
            ctx.log('debug', `  Post photo: ${protocol.day3_7.postPhoto ? 'Yes' : 'No'}`);
            ctx.log('debug', `  Max follows/day: ${protocol.day3_7.maxFollowsPerDay}`);
            ctx.log('debug', `  Max likes/day: ${protocol.day3_7.maxLikesPerDay}`);
            break;

          case 'day1_2':
          default:
            scrollMinutes = randomInRange(
              protocol.day1_2.scrollMinutes.min,
              protocol.day1_2.scrollMinutes.max
            );
            ctx.log('info', `Warmup protocol: Day 1-2 (Light Warmup)`);
            ctx.log('debug', `  Scroll: ${protocol.day1_2.scrollMinutes.min}-${protocol.day1_2.scrollMinutes.max} min`);
            ctx.log('debug', `  Likes: ${protocol.day1_2.likeCount.min}-${protocol.day1_2.likeCount.max}`);
            ctx.log('debug', `  Follows: ${protocol.day1_2.followCount.min}-${protocol.day1_2.followCount.max}`);
            break;
        }

        browseVideo = scrollMinutes; // ~1 video per minute
      }

      ctx.log('info', `Using browseVideo=${browseVideo} (based on scroll duration)`);

      const response = await ctx.client.instagramWarmup(ctx.job.envId, {
        browseVideo,
      });

      if (response.code === GEELARK_ERROR_CODES.SUCCESS) {
        ctx.job.tasks.warmupTaskId = response.data.taskId;
        ctx.log('info', `Warmup task started: ${response.data.taskId}`);
        ctx.transitionTo('POLL_WARMUP_TASK');
        return;
      }

      // Phone not running - trigger restart
      if (response.code === GEELARK_ERROR_CODES.ENV_NOT_RUNNING) {
        throw new PhoneNotRunningError(ctx.job.envId);
      }

      throw new GeeLarkAPIError(
        'instagramWarmup',
        response.code,
        response.msg
      );
    });
  }

  /**
   * POLL_WARMUP_TASK: Wait for warmup task to complete
   *
   * Uses extended timeout (10 minutes) since warmup involves
   * ~5 minutes of manual engagement (likes, follows, comments)
   *
   * Takes periodic screenshots during warmup to show progress
   */
  private async handlePollWarmupTask(ctx: WorkflowContext): Promise<void> {
    const taskId = ctx.job.tasks.warmupTaskId!;
    const result = await ctx.pollTaskWithScreenshots(taskId, 'warmup', 'Warmup Progress');

    if (isTaskSuccess(result.status)) {
      ctx.log('info', 'Warmup task completed successfully');

      // Capture final screenshot after warmup
      await ctx.takeScreenshot('After Warmup');

      // Check if there are posts to publish
      if (ctx.job.account?.posts && ctx.job.account.posts.length > 0) {
        ctx.transitionTo('PUBLISH_POST_1');
      } else {
        ctx.log('info', 'No posts to publish, workflow complete');
        ctx.transitionTo('DONE');
      }
    } else {
      // Task failed - log the error and retry by going back to WARMUP
      ctx.log(
        'warn',
        `Warmup task failed (status ${result.status}): ${result.failDesc || 'unknown'}`
      );

      // Clear the task ID so we create a new task
      ctx.job.tasks.warmupTaskId = null;

      // Go back to WARMUP to retry
      ctx.transitionTo('WARMUP');
    }
  }

  /**
   * Ensure Instagram app is in foreground before publishing
   *
   * Sometimes after warmup the app exits to home screen, so we need to
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

    const result = await ctx.pollTask(taskId, 'publish', PUBLISH_TASK_TIMEOUT_SECONDS);

    if (isTaskSuccess(result.status)) {
      ctx.log('info', `Post ${postIndex + 1} published successfully`);

      // Capture screenshot after post
      await ctx.takeScreenshot(`After Post ${postIndex + 1}`);

      if (postIndex === 0) {
        const posts = ctx.job.account?.posts || [];
        if (posts.length > 1) {
          ctx.transitionTo('PUBLISH_POST_2');
        } else {
          ctx.log('info', 'All posts published, workflow complete');
          ctx.transitionTo('DONE');
        }
      } else {
        ctx.log('info', 'All posts published, workflow complete');
        ctx.transitionTo('DONE');
      }
    } else {
      // Task failed - log the error and retry
      ctx.log(
        'warn',
        `Post ${postIndex + 1} publish failed (status ${result.status}): ${result.failDesc || 'unknown'}`
      );

      // Clear the task ID so we create a new task
      if (postIndex === 0) {
        ctx.job.tasks.post1TaskId = null;
        ctx.transitionTo('PUBLISH_POST_1');
      } else {
        ctx.job.tasks.post2TaskId = null;
        ctx.transitionTo('PUBLISH_POST_2');
      }
    }
  }
}
