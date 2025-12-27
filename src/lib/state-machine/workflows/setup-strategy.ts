import { GeeLarkAPIError } from '@/lib/geelark/client';
import { GEELARK_ERROR_CODES, isTaskSuccess } from '@/lib/geelark/types';
import {
  PhoneJob,
  PhoneState,
  RetryableState,
  SetupData,
  SETUP_TOTAL_STEPS,
} from '../types';
import { WorkflowStrategy, WorkflowContext, StateHandler } from './types';

/**
 * Custom error for phone not running (42002)
 */
class PhoneNotRunningError extends Error {
  constructor(public envId: string) {
    super(`Phone ${envId} is not running, needs restart`);
    this.name = 'PhoneNotRunningError';
  }
}

/**
 * Custom error for missing flow configuration
 */
class MissingFlowError extends Error {
  constructor(public flowName: string) {
    super(`Missing flow ID for ${flowName}. Please configure the task flow.`);
    this.name = 'MissingFlowError';
  }
}

/**
 * Setup workflow strategy
 *
 * Flow: WARMUP → SET_PROFILE_PICTURE → SET_BIO → SETUP_POST_1 → SETUP_POST_2 →
 *       CREATE_STORY_HIGHLIGHT → SET_PRIVATE → ENABLE_2FA → DONE
 *
 * Per SOP Section 4.1: "Immediately After Account Creation" perform
 * "12-20 minutes of continuous human-like activity" before any profile changes.
 * This simulates real human behavior - browse first, then update profile.
 *
 * Each profile step is optional and will be skipped if:
 * - The data is not provided in the account's setup configuration
 * - The corresponding flow ID is not configured
 *
 * Always-run steps: WARMUP, SET_PRIVATE, ENABLE_2FA
 */
export class SetupStrategy implements WorkflowStrategy {
  /**
   * Instagram setup workflow requires login via instagramLogin RPA task
   */
  requiresLogin(): boolean {
    return true;
  }

  /**
   * Get the first state after login completes
   *
   * Per SOP: Start with warmup to humanize the account before profile setup
   */
  getPostLoginState(_job: PhoneJob): PhoneState {
    // Per SOP 4.1: Warmup immediately after account creation (login)
    return 'WARMUP';
  }

  /**
   * Get the handler for a setup workflow state
   */
  getStateHandler(
    state: PhoneState,
    context: WorkflowContext
  ): StateHandler | null {
    switch (state) {
      // Warmup states (per SOP 4.1 - humanize before profile setup)
      case 'WARMUP':
        return () => this.handleWarmup(context);
      case 'POLL_WARMUP_TASK':
        return () => this.handlePollWarmupTask(context);
      // Profile setup states
      case 'SET_PROFILE_PICTURE':
        return () => this.handleSetProfilePicture(context);
      case 'POLL_PROFILE_PICTURE_TASK':
        return () => this.handlePollProfilePictureTask(context);
      case 'SET_BIO':
        return () => this.handleSetBio(context);
      case 'POLL_BIO_TASK':
        return () => this.handlePollBioTask(context);
      case 'SETUP_POST_1':
        return () => this.handleSetupPost(context, 0);
      case 'POLL_SETUP_POST_1_TASK':
        return () => this.handlePollSetupPostTask(context, 0);
      case 'SETUP_POST_2':
        return () => this.handleSetupPost(context, 1);
      case 'POLL_SETUP_POST_2_TASK':
        return () => this.handlePollSetupPostTask(context, 1);
      case 'CREATE_STORY_HIGHLIGHT':
        return () => this.handleCreateStoryHighlight(context);
      case 'POLL_STORY_HIGHLIGHT_TASK':
        return () => this.handlePollStoryHighlightTask(context);
      case 'SET_PRIVATE':
        return () => this.handleSetPrivate(context);
      case 'POLL_SET_PRIVATE_TASK':
        return () => this.handlePollSetPrivateTask(context);
      case 'ENABLE_2FA':
        return () => this.handleEnable2FA(context);
      case 'POLL_2FA_TASK':
        return () => this.handlePoll2FATask(context);
      default:
        return null;
    }
  }

  /**
   * Get total steps for setup workflow
   */
  getTotalSteps(): number {
    return SETUP_TOTAL_STEPS;
  }

  /**
   * Get retryable states for setup workflow
   */
  getRetryableStates(): RetryableState[] {
    return [
      'SET_PROFILE_PICTURE',
      'SET_BIO',
      'SETUP_POST_1',
      'SETUP_POST_2',
      'CREATE_STORY_HIGHLIGHT',
      'SET_PRIVATE',
      'ENABLE_2FA',
    ];
  }

  // ==================== Helper Methods ====================

  /**
   * Get the next setup state to transition to
   *
   * Skips states where data/flow is not configured
   */
  private getNextSetupState(
    job: PhoneJob,
    fromState: PhoneState
  ): PhoneState {
    const setup = job.account?.setup;
    const stateOrder: PhoneState[] = [
      'SET_PROFILE_PICTURE',
      'SET_BIO',
      'SETUP_POST_1',
      'SETUP_POST_2',
      'CREATE_STORY_HIGHLIGHT',
      'SET_PRIVATE',
      'ENABLE_2FA',
    ];

    // Find the index of the current state
    const startIndex = stateOrder.indexOf(fromState);
    if (startIndex === -1) return 'DONE';

    // Check each state from the starting point
    for (let i = startIndex; i < stateOrder.length; i++) {
      const state = stateOrder[i];

      // Check if we should execute this state
      if (this.shouldExecuteState(job, state, setup)) {
        return state;
      }
    }

    return 'DONE';
  }

  /**
   * Check if a state should be executed based on available data
   */
  private shouldExecuteState(
    job: PhoneJob,
    state: PhoneState,
    setup: SetupData | undefined
  ): boolean {
    switch (state) {
      case 'SET_PROFILE_PICTURE':
        return !!setup?.profilePictureUrl;
      case 'SET_BIO':
        return !!setup?.bio;
      case 'SETUP_POST_1':
        return !!setup?.post1;
      case 'SETUP_POST_2':
        return !!setup?.post2;
      case 'CREATE_STORY_HIGHLIGHT':
        return !!setup?.highlightTitle;
      case 'SET_PRIVATE':
        // Always run SET_PRIVATE
        return true;
      case 'ENABLE_2FA':
        // Always run ENABLE_2FA
        return true;
      default:
        return false;
    }
  }

  /**
   * Get the state after a poll state completes
   */
  private getStateAfterPoll(pollState: PhoneState): PhoneState {
    const pollToNextMap: Partial<Record<PhoneState, PhoneState>> = {
      POLL_PROFILE_PICTURE_TASK: 'SET_BIO',
      POLL_BIO_TASK: 'SETUP_POST_1',
      POLL_SETUP_POST_1_TASK: 'SETUP_POST_2',
      POLL_SETUP_POST_2_TASK: 'CREATE_STORY_HIGHLIGHT',
      POLL_STORY_HIGHLIGHT_TASK: 'SET_PRIVATE',
      POLL_SET_PRIVATE_TASK: 'ENABLE_2FA',
      POLL_2FA_TASK: 'DONE',
    };
    return pollToNextMap[pollState] || 'DONE';
  }

  // ==================== State Handlers ====================

  /**
   * WARMUP: Execute Instagram warmup RPA task
   *
   * Per SOP 4.1: "12-20 minutes of continuous human-like activity"
   * This humanizes the account before making profile changes.
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
      // Per SOP: 12-20 minutes of activity, browseVideo controls duration
      const browseVideo = ctx.job.account?.flags.warmupBrowseVideo ?? 5;

      const response = await ctx.client.instagramWarmup(ctx.job.envId, {
        browseVideo,
        name: `Setup warmup for ${ctx.job.account?.username || ctx.job.envId}`,
      });

      if (response.code === GEELARK_ERROR_CODES.SUCCESS) {
        ctx.job.tasks.warmupTaskId = response.data.taskId;
        ctx.log('info', `Setup warmup task started: ${response.data.taskId}`);
        ctx.transitionTo('POLL_WARMUP_TASK');
        return;
      }

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
   * After warmup completes, proceed to profile setup
   */
  private async handlePollWarmupTask(ctx: WorkflowContext): Promise<void> {
    const taskId = ctx.job.tasks.warmupTaskId!;
    const result = await ctx.pollTaskWithScreenshots(taskId, 'warmup', 'Setup Warmup Progress');

    if (isTaskSuccess(result.status)) {
      ctx.log('info', 'Setup warmup completed, proceeding to profile setup');
      await ctx.takeScreenshot('After Setup Warmup');

      // Proceed to profile setup
      const nextState = this.getNextSetupState(ctx.job, 'SET_PROFILE_PICTURE');
      ctx.transitionTo(nextState);
    } else {
      ctx.log(
        'warn',
        `Setup warmup failed (status ${result.status}): ${result.failDesc || 'unknown'}`
      );
      ctx.job.tasks.warmupTaskId = null;
      ctx.transitionTo('WARMUP');
    }
  }

  /**
   * SET_PROFILE_PICTURE: Set the account's profile picture
   */
  private async handleSetProfilePicture(ctx: WorkflowContext): Promise<void> {
    const setup = ctx.job.account?.setup;

    // Skip if no profile picture URL
    if (!setup?.profilePictureUrl) {
      ctx.log('info', 'No profile picture configured, skipping');
      const nextState = this.getNextSetupState(ctx.job, 'SET_BIO');
      ctx.transitionTo(nextState);
      return;
    }

    const flowId = ctx.config.setupFlowIds?.setProfilePicture;
    if (!flowId) {
      throw new MissingFlowError('Set Profile Picture');
    }

    await ctx.withRetry('SET_PROFILE_PICTURE', async () => {
      const response = await ctx.client.createCustomTask(
        ctx.job.envId,
        flowId,
        {
          name: `Set Profile Picture for ${ctx.job.account!.username}`,
          paramMap: {
            image: setup.profilePictureUrl,
          },
        }
      );

      if (response.code === GEELARK_ERROR_CODES.SUCCESS) {
        ctx.job.tasks.profilePictureTaskId = response.data.taskId;
        ctx.log('info', `Set profile picture task started: ${response.data.taskId}`);
        ctx.transitionTo('POLL_PROFILE_PICTURE_TASK');
        return;
      }

      if (response.code === GEELARK_ERROR_CODES.ENV_NOT_RUNNING) {
        throw new PhoneNotRunningError(ctx.job.envId);
      }

      throw new GeeLarkAPIError(
        'createCustomTask (setProfilePicture)',
        response.code,
        response.msg
      );
    });
  }

  /**
   * POLL_PROFILE_PICTURE_TASK: Wait for profile picture task to complete
   */
  private async handlePollProfilePictureTask(
    ctx: WorkflowContext
  ): Promise<void> {
    const taskId = ctx.job.tasks.profilePictureTaskId!;
    const result = await ctx.pollTask(taskId, 'setup');

    if (isTaskSuccess(result.status)) {
      ctx.log('info', 'Profile picture set successfully');
      await ctx.takeScreenshot('After Profile Picture');

      const nextState = this.getNextSetupState(ctx.job, 'SET_BIO');
      ctx.transitionTo(nextState);
    } else {
      ctx.log(
        'warn',
        `Set profile picture failed (status ${result.status}): ${result.failDesc || 'unknown'}`
      );
      ctx.job.tasks.profilePictureTaskId = null;
      ctx.transitionTo('SET_PROFILE_PICTURE');
    }
  }

  /**
   * SET_BIO: Set the account's bio
   */
  private async handleSetBio(ctx: WorkflowContext): Promise<void> {
    const setup = ctx.job.account?.setup;

    // Skip if no bio
    if (!setup?.bio) {
      ctx.log('info', 'No bio configured, skipping');
      const nextState = this.getNextSetupState(ctx.job, 'SETUP_POST_1');
      ctx.transitionTo(nextState);
      return;
    }

    const flowId = ctx.config.setupFlowIds?.setBio;
    if (!flowId) {
      throw new MissingFlowError('Set Bio');
    }

    await ctx.withRetry('SET_BIO', async () => {
      const response = await ctx.client.createCustomTask(
        ctx.job.envId,
        flowId,
        {
          name: `Set Bio for ${ctx.job.account!.username}`,
          paramMap: {
            bio: setup.bio,
          },
        }
      );

      if (response.code === GEELARK_ERROR_CODES.SUCCESS) {
        ctx.job.tasks.bioTaskId = response.data.taskId;
        ctx.log('info', `Set bio task started: ${response.data.taskId}`);
        ctx.transitionTo('POLL_BIO_TASK');
        return;
      }

      if (response.code === GEELARK_ERROR_CODES.ENV_NOT_RUNNING) {
        throw new PhoneNotRunningError(ctx.job.envId);
      }

      throw new GeeLarkAPIError(
        'createCustomTask (setBio)',
        response.code,
        response.msg
      );
    });
  }

  /**
   * POLL_BIO_TASK: Wait for bio task to complete
   */
  private async handlePollBioTask(ctx: WorkflowContext): Promise<void> {
    const taskId = ctx.job.tasks.bioTaskId!;
    const result = await ctx.pollTask(taskId, 'setup');

    if (isTaskSuccess(result.status)) {
      ctx.log('info', 'Bio set successfully');
      await ctx.takeScreenshot('After Bio');

      const nextState = this.getNextSetupState(ctx.job, 'SETUP_POST_1');
      ctx.transitionTo(nextState);
    } else {
      ctx.log(
        'warn',
        `Set bio failed (status ${result.status}): ${result.failDesc || 'unknown'}`
      );
      ctx.job.tasks.bioTaskId = null;
      ctx.transitionTo('SET_BIO');
    }
  }

  /**
   * SETUP_POST: Create a post during setup
   */
  private async handleSetupPost(
    ctx: WorkflowContext,
    postIndex: number
  ): Promise<void> {
    const setup = ctx.job.account?.setup;
    const post = postIndex === 0 ? setup?.post1 : setup?.post2;

    // Skip if no post
    if (!post) {
      const stateToSkipTo = postIndex === 0 ? 'SETUP_POST_2' : 'CREATE_STORY_HIGHLIGHT';
      ctx.log('info', `No post ${postIndex + 1} configured, skipping`);
      const nextState = this.getNextSetupState(ctx.job, stateToSkipTo);
      ctx.transitionTo(nextState);
      return;
    }

    const flowId = ctx.config.setupFlowIds?.createPost;
    if (!flowId) {
      throw new MissingFlowError('Create Post');
    }

    const stateName = postIndex === 0 ? 'SETUP_POST_1' : 'SETUP_POST_2';

    await ctx.withRetry(stateName, async () => {
      const response = await ctx.client.createCustomTask(
        ctx.job.envId,
        flowId,
        {
          name: `Create Post ${postIndex + 1} for ${ctx.job.account!.username}`,
          paramMap: {
            description: post.description,
            mediaUrls: post.mediaUrls,
            mediaType: post.type,
          },
        }
      );

      if (response.code === GEELARK_ERROR_CODES.SUCCESS) {
        if (postIndex === 0) {
          ctx.job.tasks.setupPost1TaskId = response.data.taskId;
          ctx.transitionTo('POLL_SETUP_POST_1_TASK');
        } else {
          ctx.job.tasks.setupPost2TaskId = response.data.taskId;
          ctx.transitionTo('POLL_SETUP_POST_2_TASK');
        }
        ctx.log('info', `Create post ${postIndex + 1} task started: ${response.data.taskId}`);
        return;
      }

      if (response.code === GEELARK_ERROR_CODES.ENV_NOT_RUNNING) {
        throw new PhoneNotRunningError(ctx.job.envId);
      }

      throw new GeeLarkAPIError(
        'createCustomTask (createPost)',
        response.code,
        response.msg
      );
    });
  }

  /**
   * POLL_SETUP_POST_TASK: Wait for post creation task to complete
   */
  private async handlePollSetupPostTask(
    ctx: WorkflowContext,
    postIndex: number
  ): Promise<void> {
    const taskId =
      postIndex === 0
        ? ctx.job.tasks.setupPost1TaskId
        : ctx.job.tasks.setupPost2TaskId;

    if (!taskId) {
      const nextSetupState = postIndex === 0 ? 'SETUP_POST_2' : 'CREATE_STORY_HIGHLIGHT';
      const nextState = this.getNextSetupState(ctx.job, nextSetupState);
      ctx.transitionTo(nextState);
      return;
    }

    const result = await ctx.pollTask(taskId, 'setup');

    if (isTaskSuccess(result.status)) {
      ctx.log('info', `Post ${postIndex + 1} created successfully`);
      await ctx.takeScreenshot(`After Setup Post ${postIndex + 1}`);

      const nextSetupState = postIndex === 0 ? 'SETUP_POST_2' : 'CREATE_STORY_HIGHLIGHT';
      const nextState = this.getNextSetupState(ctx.job, nextSetupState);
      ctx.transitionTo(nextState);
    } else {
      ctx.log(
        'warn',
        `Create post ${postIndex + 1} failed (status ${result.status}): ${result.failDesc || 'unknown'}`
      );
      if (postIndex === 0) {
        ctx.job.tasks.setupPost1TaskId = null;
        ctx.transitionTo('SETUP_POST_1');
      } else {
        ctx.job.tasks.setupPost2TaskId = null;
        ctx.transitionTo('SETUP_POST_2');
      }
    }
  }

  /**
   * CREATE_STORY_HIGHLIGHT: Create a story highlight
   */
  private async handleCreateStoryHighlight(ctx: WorkflowContext): Promise<void> {
    const setup = ctx.job.account?.setup;

    // Skip if no highlight title
    if (!setup?.highlightTitle) {
      ctx.log('info', 'No story highlight configured, skipping');
      const nextState = this.getNextSetupState(ctx.job, 'SET_PRIVATE');
      ctx.transitionTo(nextState);
      return;
    }

    const flowId = ctx.config.setupFlowIds?.createStoryHighlight;
    if (!flowId) {
      throw new MissingFlowError('Create Story Highlight');
    }

    await ctx.withRetry('CREATE_STORY_HIGHLIGHT', async () => {
      const paramMap: Record<string, unknown> = {
        highlightTitle: setup.highlightTitle,
      };
      if (setup.highlightCoverUrl) {
        paramMap.highlightCoverUrl = setup.highlightCoverUrl;
      }

      const response = await ctx.client.createCustomTask(
        ctx.job.envId,
        flowId,
        {
          name: `Create Story Highlight for ${ctx.job.account!.username}`,
          paramMap,
        }
      );

      if (response.code === GEELARK_ERROR_CODES.SUCCESS) {
        ctx.job.tasks.storyHighlightTaskId = response.data.taskId;
        ctx.log('info', `Create story highlight task started: ${response.data.taskId}`);
        ctx.transitionTo('POLL_STORY_HIGHLIGHT_TASK');
        return;
      }

      if (response.code === GEELARK_ERROR_CODES.ENV_NOT_RUNNING) {
        throw new PhoneNotRunningError(ctx.job.envId);
      }

      throw new GeeLarkAPIError(
        'createCustomTask (createStoryHighlight)',
        response.code,
        response.msg
      );
    });
  }

  /**
   * POLL_STORY_HIGHLIGHT_TASK: Wait for story highlight task to complete
   */
  private async handlePollStoryHighlightTask(ctx: WorkflowContext): Promise<void> {
    const taskId = ctx.job.tasks.storyHighlightTaskId!;
    const result = await ctx.pollTask(taskId, 'setup');

    if (isTaskSuccess(result.status)) {
      ctx.log('info', 'Story highlight created successfully');
      await ctx.takeScreenshot('After Story Highlight');

      const nextState = this.getNextSetupState(ctx.job, 'SET_PRIVATE');
      ctx.transitionTo(nextState);
    } else {
      ctx.log(
        'warn',
        `Create story highlight failed (status ${result.status}): ${result.failDesc || 'unknown'}`
      );
      ctx.job.tasks.storyHighlightTaskId = null;
      ctx.transitionTo('CREATE_STORY_HIGHLIGHT');
    }
  }

  /**
   * SET_PRIVATE: Set account to private
   */
  private async handleSetPrivate(ctx: WorkflowContext): Promise<void> {
    const flowId = ctx.config.setupFlowIds?.setPrivate;
    if (!flowId) {
      throw new MissingFlowError('Set Private');
    }

    await ctx.withRetry('SET_PRIVATE', async () => {
      const response = await ctx.client.createCustomTask(
        ctx.job.envId,
        flowId,
        {
          name: `Set Private for ${ctx.job.account!.username}`,
          paramMap: {},
        }
      );

      if (response.code === GEELARK_ERROR_CODES.SUCCESS) {
        ctx.job.tasks.setPrivateTaskId = response.data.taskId;
        ctx.log('info', `Set private task started: ${response.data.taskId}`);
        ctx.transitionTo('POLL_SET_PRIVATE_TASK');
        return;
      }

      if (response.code === GEELARK_ERROR_CODES.ENV_NOT_RUNNING) {
        throw new PhoneNotRunningError(ctx.job.envId);
      }

      throw new GeeLarkAPIError(
        'createCustomTask (setPrivate)',
        response.code,
        response.msg
      );
    });
  }

  /**
   * POLL_SET_PRIVATE_TASK: Wait for set private task to complete
   */
  private async handlePollSetPrivateTask(ctx: WorkflowContext): Promise<void> {
    const taskId = ctx.job.tasks.setPrivateTaskId!;
    const result = await ctx.pollTask(taskId, 'setup');

    if (isTaskSuccess(result.status)) {
      ctx.log('info', 'Account set to private successfully');
      await ctx.takeScreenshot('After Set Private');

      ctx.transitionTo('ENABLE_2FA');
    } else {
      ctx.log(
        'warn',
        `Set private failed (status ${result.status}): ${result.failDesc || 'unknown'}`
      );
      ctx.job.tasks.setPrivateTaskId = null;
      ctx.transitionTo('SET_PRIVATE');
    }
  }

  /**
   * ENABLE_2FA: Enable two-factor authentication
   */
  private async handleEnable2FA(ctx: WorkflowContext): Promise<void> {
    const flowId = ctx.config.setupFlowIds?.enable2FA;
    if (!flowId) {
      throw new MissingFlowError('Enable 2FA');
    }

    await ctx.withRetry('ENABLE_2FA', async () => {
      // The 2FA flow may need account credentials for the authenticator setup
      const paramMap: Record<string, unknown> = {
        account: ctx.job.account!.username,
        password: ctx.job.account!.password,
      };

      // Add 2FA secret if available (for TOTP-based setup)
      if (ctx.job.account?.twoFactorSecret) {
        paramMap.auth = ctx.job.account.twoFactorSecret;
      }

      // Add current date for any date-based parameters
      paramMap.PubDate = new Date().toISOString().split('T')[0];

      const response = await ctx.client.createCustomTask(
        ctx.job.envId,
        flowId,
        {
          name: `Enable 2FA for ${ctx.job.account!.username}`,
          paramMap,
        }
      );

      if (response.code === GEELARK_ERROR_CODES.SUCCESS) {
        ctx.job.tasks.enable2FATaskId = response.data.taskId;
        ctx.log('info', `Enable 2FA task started: ${response.data.taskId}`);
        ctx.transitionTo('POLL_2FA_TASK');
        return;
      }

      if (response.code === GEELARK_ERROR_CODES.ENV_NOT_RUNNING) {
        throw new PhoneNotRunningError(ctx.job.envId);
      }

      throw new GeeLarkAPIError(
        'createCustomTask (enable2FA)',
        response.code,
        response.msg
      );
    });
  }

  /**
   * POLL_2FA_TASK: Wait for 2FA task to complete
   */
  private async handlePoll2FATask(ctx: WorkflowContext): Promise<void> {
    const taskId = ctx.job.tasks.enable2FATaskId!;
    const result = await ctx.pollTask(taskId, 'setup');

    if (isTaskSuccess(result.status)) {
      ctx.log('info', '2FA enabled successfully');
      await ctx.takeScreenshot('After 2FA');
      ctx.log('info', 'Setup workflow complete');
      ctx.transitionTo('DONE');
    } else {
      ctx.log(
        'warn',
        `Enable 2FA failed (status ${result.status}): ${result.failDesc || 'unknown'}`
      );
      ctx.job.tasks.enable2FATaskId = null;
      ctx.transitionTo('ENABLE_2FA');
    }
  }
}
