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
import {
  generateUsernames,
  getNextUsername,
  isUsernameExistsError,
} from '@/lib/utils/username-generator';

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
 * Custom workflow strategy
 *
 * Allows any combination of steps selected by the user:
 * RENAME_USERNAME → EDIT_DISPLAY_NAME → SET_PROFILE_PICTURE → SET_BIO → SETUP_POST_1/2 → CREATE_STORY_HIGHLIGHT → SET_PRIVATE → ENABLE_2FA → DONE
 *
 * Steps are skipped if the corresponding flow is not configured.
 */
export class CustomStrategy implements WorkflowStrategy {
  /**
   * Instagram custom workflow requires login via instagramLogin RPA task
   */
  requiresLogin(): boolean {
    return true;
  }

  /**
   * Get the first state after login completes
   * Custom workflow starts with whatever steps are configured
   */
  getPostLoginState(job: PhoneJob): PhoneState {
    return this.getNextCustomState(job, 'RENAME_USERNAME');
  }

  /**
   * Get the handler for a custom workflow state
   */
  getStateHandler(
    state: PhoneState,
    context: WorkflowContext
  ): StateHandler | null {
    switch (state) {
      // Rename Username
      case 'RENAME_USERNAME':
        return () => this.handleRenameUsername(context);
      case 'POLL_RENAME_USERNAME_TASK':
        return () => this.handlePollRenameUsernameTask(context);
      // Edit Display Name
      case 'EDIT_DISPLAY_NAME':
        return () => this.handleEditDisplayName(context);
      case 'POLL_EDIT_DISPLAY_NAME_TASK':
        return () => this.handlePollEditDisplayNameTask(context);
      // Profile Picture
      case 'SET_PROFILE_PICTURE':
        return () => this.handleSetProfilePicture(context);
      case 'POLL_PROFILE_PICTURE_TASK':
        return () => this.handlePollProfilePictureTask(context);
      // Bio
      case 'SET_BIO':
        return () => this.handleSetBio(context);
      case 'POLL_BIO_TASK':
        return () => this.handlePollBioTask(context);
      // Posts
      case 'SETUP_POST_1':
        return () => this.handleSetupPost1(context);
      case 'POLL_SETUP_POST_1_TASK':
        return () => this.handlePollSetupPost1Task(context);
      case 'SETUP_POST_2':
        return () => this.handleSetupPost2(context);
      case 'POLL_SETUP_POST_2_TASK':
        return () => this.handlePollSetupPost2Task(context);
      // Story Highlight
      case 'CREATE_STORY_HIGHLIGHT':
        return () => this.handleCreateStoryHighlight(context);
      case 'POLL_STORY_HIGHLIGHT_TASK':
        return () => this.handlePollStoryHighlightTask(context);
      // Private
      case 'SET_PRIVATE':
        return () => this.handleSetPrivate(context);
      case 'POLL_SET_PRIVATE_TASK':
        return () => this.handlePollSetPrivateTask(context);
      // 2FA
      case 'ENABLE_2FA':
        return () => this.handleEnable2FA(context);
      case 'POLL_2FA_TASK':
        return () => this.handlePoll2FATask(context);
      default:
        return null;
    }
  }

  /**
   * Get total steps for custom workflow
   */
  getTotalSteps(): number {
    return SETUP_TOTAL_STEPS; // Use same as setup for now
  }

  /**
   * Get retryable states for custom workflow
   */
  getRetryableStates(): RetryableState[] {
    return [
      'RENAME_USERNAME',
      'EDIT_DISPLAY_NAME',
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
   * Get the next custom workflow state to transition to
   * Skips states where the flow is not configured
   */
  private getNextCustomState(
    job: PhoneJob,
    fromState: PhoneState
  ): PhoneState {
    const setup = job.account?.setup;
    const config = (job as any)._workflowConfig; // Access config from job context
    const flowIds = config?.setupFlowIds;

    // Define the order of states and their flow requirements
    const stateOrder: { state: PhoneState; hasFlow: () => boolean }[] = [
      { state: 'RENAME_USERNAME', hasFlow: () => !!flowIds?.renameUsername && !!setup?.newUsername },
      { state: 'EDIT_DISPLAY_NAME', hasFlow: () => !!flowIds?.editDisplayName && !!setup?.newDisplayName },
      { state: 'SET_PROFILE_PICTURE', hasFlow: () => !!flowIds?.setProfilePicture && !!setup?.profilePictureUrl },
      { state: 'SET_BIO', hasFlow: () => !!flowIds?.setBio && !!setup?.bio },
      { state: 'SETUP_POST_1', hasFlow: () => !!flowIds?.createPost && !!setup?.post1 },
      { state: 'SETUP_POST_2', hasFlow: () => !!flowIds?.createPost && !!setup?.post2 },
      { state: 'CREATE_STORY_HIGHLIGHT', hasFlow: () => !!flowIds?.createStoryHighlight && !!setup?.highlightTitle },
      { state: 'SET_PRIVATE', hasFlow: () => !!flowIds?.setPrivate },
      { state: 'ENABLE_2FA', hasFlow: () => !!flowIds?.enable2FA },
    ];

    // Find the index of the current state
    const startIndex = stateOrder.findIndex(s => s.state === fromState);
    if (startIndex === -1) return 'DONE';

    // Check each state from the starting point
    for (let i = startIndex; i < stateOrder.length; i++) {
      const { state, hasFlow } = stateOrder[i];
      if (hasFlow()) {
        return state;
      }
    }

    return 'DONE';
  }

  /**
   * Helper to get next state from context
   */
  private getNextStateFromContext(ctx: WorkflowContext, fromState: PhoneState): PhoneState {
    const setup = ctx.job.account?.setup;
    const flowIds = ctx.config.setupFlowIds;

    const stateOrder: { state: PhoneState; hasFlow: () => boolean }[] = [
      { state: 'RENAME_USERNAME', hasFlow: () => !!flowIds?.renameUsername && !!setup?.newUsername },
      { state: 'EDIT_DISPLAY_NAME', hasFlow: () => !!flowIds?.editDisplayName && !!setup?.newDisplayName },
      { state: 'SET_PROFILE_PICTURE', hasFlow: () => !!flowIds?.setProfilePicture && !!setup?.profilePictureUrl },
      { state: 'SET_BIO', hasFlow: () => !!flowIds?.setBio && !!setup?.bio },
      { state: 'SETUP_POST_1', hasFlow: () => !!flowIds?.createPost && !!setup?.post1 },
      { state: 'SETUP_POST_2', hasFlow: () => !!flowIds?.createPost && !!setup?.post2 },
      { state: 'CREATE_STORY_HIGHLIGHT', hasFlow: () => !!flowIds?.createStoryHighlight && !!setup?.highlightTitle },
      { state: 'SET_PRIVATE', hasFlow: () => !!flowIds?.setPrivate },
      { state: 'ENABLE_2FA', hasFlow: () => !!flowIds?.enable2FA },
    ];

    const startIndex = stateOrder.findIndex(s => s.state === fromState);
    if (startIndex === -1) return 'DONE';

    for (let i = startIndex; i < stateOrder.length; i++) {
      if (stateOrder[i].hasFlow()) {
        return stateOrder[i].state;
      }
    }

    return 'DONE';
  }

  // ==================== State Handlers ====================

  /**
   * Initialize username generation state if needed
   * Generates alternative usernames based on display name for smart retries
   */
  private initUsernameGeneration(ctx: WorkflowContext): void {
    const setup = ctx.job.account?.setup;

    // Already initialized
    if (ctx.job.usernameGeneration) return;

    // Generate alternatives based on display name
    const displayName = setup?.newDisplayName || '';
    const generatedUsernames = displayName
      ? generateUsernames(displayName, 30)
      : [];

    ctx.job.usernameGeneration = {
      generatedUsernames,
      attemptedUsernames: [],
      currentUsername: null,
      originalUsername: setup?.newUsername || null,
    };

    if (generatedUsernames.length > 0) {
      ctx.log('info', `Generated ${generatedUsernames.length} alternative usernames from display name`);
    }
  }

  /**
   * Get the next username to try
   * First tries the original username, then generated alternatives
   */
  private getNextUsernameToTry(ctx: WorkflowContext): string | null {
    const state = ctx.job.usernameGeneration;
    if (!state) return null;

    const attempted = new Set(state.attemptedUsernames);

    // First, try the original username if not attempted
    if (state.originalUsername && !attempted.has(state.originalUsername)) {
      return state.originalUsername;
    }

    // Then try generated alternatives
    return getNextUsername(state.generatedUsernames, attempted);
  }

  /**
   * Mark a username as attempted
   */
  private markUsernameAttempted(ctx: WorkflowContext, username: string): void {
    if (ctx.job.usernameGeneration) {
      ctx.job.usernameGeneration.attemptedUsernames.push(username);
      ctx.job.usernameGeneration.currentUsername = username;
    }
  }

  /**
   * RENAME_USERNAME: Rename the account's username
   * Supports smart retry with generated usernames when original is taken
   */
  private async handleRenameUsername(ctx: WorkflowContext): Promise<void> {
    const setup = ctx.job.account?.setup;
    const flowId = ctx.config.setupFlowIds?.renameUsername;

    // Skip if no flow configured
    if (!flowId) {
      ctx.log('info', 'Rename username flow not configured, skipping');
      const nextState = this.getNextStateFromContext(ctx, 'EDIT_DISPLAY_NAME');
      ctx.transitionTo(nextState);
      return;
    }

    // Skip if no new username AND no display name to generate from
    if (!setup?.newUsername && !setup?.newDisplayName) {
      ctx.log('info', 'No new username configured, skipping');
      const nextState = this.getNextStateFromContext(ctx, 'EDIT_DISPLAY_NAME');
      ctx.transitionTo(nextState);
      return;
    }

    // Initialize username generation state
    this.initUsernameGeneration(ctx);

    // Get the next username to try
    const usernameToTry = this.getNextUsernameToTry(ctx);

    if (!usernameToTry) {
      // Exhausted all options
      ctx.log('error', 'All username alternatives exhausted, cannot rename username');
      ctx.transitionToFailed('All username alternatives have been tried and rejected');
      return;
    }

    // Mark this username as being attempted
    this.markUsernameAttempted(ctx, usernameToTry);

    const attemptCount = ctx.job.usernameGeneration?.attemptedUsernames.length || 1;
    ctx.log('info', `Attempting username: ${usernameToTry} (attempt ${attemptCount})`);

    await ctx.withRetry('RENAME_USERNAME', async () => {
      const response = await ctx.client.createCustomTask(
        ctx.job.envId,
        flowId,
        {
          name: `Rename username for ${ctx.job.account!.username}`,
          paramMap: {
            username: usernameToTry,
          },
        }
      );

      if (response.code === GEELARK_ERROR_CODES.SUCCESS) {
        ctx.job.tasks.renameUsernameTaskId = response.data.taskId;
        ctx.log('info', `Rename username task started: ${response.data.taskId}`);
        ctx.transitionTo('POLL_RENAME_USERNAME_TASK');
        return;
      }

      if (response.code === GEELARK_ERROR_CODES.ENV_NOT_RUNNING) {
        throw new PhoneNotRunningError(ctx.job.envId);
      }

      throw new GeeLarkAPIError(
        'createCustomTask (renameUsername)',
        response.code,
        response.msg
      );
    });
  }

  /**
   * POLL_RENAME_USERNAME_TASK: Wait for rename task to complete
   * Handles smart retry when username is taken
   */
  private async handlePollRenameUsernameTask(ctx: WorkflowContext): Promise<void> {
    const taskId = ctx.job.tasks.renameUsernameTaskId!;
    const result = await ctx.pollTask(taskId, 'setup');

    if (isTaskSuccess(result.status)) {
      const currentUsername = ctx.job.usernameGeneration?.currentUsername;
      ctx.log('info', `Username renamed successfully to: ${currentUsername}`);
      await ctx.takeScreenshot('After Username Rename');

      // Clear username generation state
      ctx.job.usernameGeneration = undefined;

      const nextState = this.getNextStateFromContext(ctx, 'EDIT_DISPLAY_NAME');
      ctx.transitionTo(nextState);
    } else {
      const failDesc = result.failDesc || 'unknown';
      ctx.log('warn', `Rename username failed (status ${result.status}): ${failDesc}`);

      // Check if this is a "username already exists" error
      if (isUsernameExistsError(failDesc)) {
        const currentUsername = ctx.job.usernameGeneration?.currentUsername;
        ctx.log('info', `Username "${currentUsername}" is taken, trying alternative...`);

        // Check if we have more alternatives to try
        const nextUsername = this.getNextUsernameToTry(ctx);
        if (nextUsername) {
          ctx.job.tasks.renameUsernameTaskId = null;
          ctx.transitionTo('RENAME_USERNAME');
          return;
        } else {
          // No more alternatives
          ctx.log('error', 'All username alternatives exhausted');
          ctx.transitionToFailed('All username alternatives have been tried and rejected');
          return;
        }
      }

      // For other errors, use standard retry logic
      ctx.job.tasks.renameUsernameTaskId = null;
      ctx.transitionTo('RENAME_USERNAME');
    }
  }

  /**
   * EDIT_DISPLAY_NAME: Edit the account's display name
   */
  private async handleEditDisplayName(ctx: WorkflowContext): Promise<void> {
    const setup = ctx.job.account?.setup;
    const flowId = ctx.config.setupFlowIds?.editDisplayName;

    if (!flowId || !setup?.newDisplayName) {
      ctx.log('info', 'Edit display name not configured, skipping');
      const nextState = this.getNextStateFromContext(ctx, 'SET_PROFILE_PICTURE');
      ctx.transitionTo(nextState);
      return;
    }

    await ctx.withRetry('EDIT_DISPLAY_NAME', async () => {
      const response = await ctx.client.createCustomTask(
        ctx.job.envId,
        flowId,
        {
          name: `Edit display name for ${ctx.job.account!.username}`,
          paramMap: {
            name: setup.newDisplayName,
          },
        }
      );

      if (response.code === GEELARK_ERROR_CODES.SUCCESS) {
        ctx.job.tasks.editDisplayNameTaskId = response.data.taskId;
        ctx.log('info', `Edit display name task started: ${response.data.taskId}`);
        ctx.transitionTo('POLL_EDIT_DISPLAY_NAME_TASK');
        return;
      }

      if (response.code === GEELARK_ERROR_CODES.ENV_NOT_RUNNING) {
        throw new PhoneNotRunningError(ctx.job.envId);
      }

      throw new GeeLarkAPIError(
        'createCustomTask (editDisplayName)',
        response.code,
        response.msg
      );
    });
  }

  private async handlePollEditDisplayNameTask(ctx: WorkflowContext): Promise<void> {
    const taskId = ctx.job.tasks.editDisplayNameTaskId!;
    const result = await ctx.pollTask(taskId, 'setup');

    if (isTaskSuccess(result.status)) {
      ctx.log('info', 'Display name edited successfully');
      await ctx.takeScreenshot('After Display Name Edit');
      const nextState = this.getNextStateFromContext(ctx, 'SET_PROFILE_PICTURE');
      ctx.transitionTo(nextState);
    } else {
      ctx.log('warn', `Edit display name failed (status ${result.status}): ${result.failDesc || 'unknown'}`);
      ctx.job.tasks.editDisplayNameTaskId = null;
      ctx.transitionTo('EDIT_DISPLAY_NAME');
    }
  }

  /**
   * SET_PROFILE_PICTURE: Set the account's profile picture
   */
  private async handleSetProfilePicture(ctx: WorkflowContext): Promise<void> {
    const setup = ctx.job.account?.setup;
    const flowId = ctx.config.setupFlowIds?.setProfilePicture;

    if (!flowId || !setup?.profilePictureUrl) {
      ctx.log('info', 'Profile picture not configured, skipping');
      const nextState = this.getNextStateFromContext(ctx, 'SET_BIO');
      ctx.transitionTo(nextState);
      return;
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

  private async handlePollProfilePictureTask(ctx: WorkflowContext): Promise<void> {
    const taskId = ctx.job.tasks.profilePictureTaskId!;
    const result = await ctx.pollTask(taskId, 'setup');

    if (isTaskSuccess(result.status)) {
      ctx.log('info', 'Profile picture set successfully');
      await ctx.takeScreenshot('After Profile Picture');
      const nextState = this.getNextStateFromContext(ctx, 'SET_BIO');
      ctx.transitionTo(nextState);
    } else {
      ctx.log('warn', `Set profile picture failed (status ${result.status}): ${result.failDesc || 'unknown'}`);
      ctx.job.tasks.profilePictureTaskId = null;
      ctx.transitionTo('SET_PROFILE_PICTURE');
    }
  }

  /**
   * SET_BIO: Set the account's bio
   */
  private async handleSetBio(ctx: WorkflowContext): Promise<void> {
    const setup = ctx.job.account?.setup;
    const flowId = ctx.config.setupFlowIds?.setBio;

    if (!flowId || !setup?.bio) {
      ctx.log('info', 'Bio not configured, skipping');
      const nextState = this.getNextStateFromContext(ctx, 'SETUP_POST_1');
      ctx.transitionTo(nextState);
      return;
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

  private async handlePollBioTask(ctx: WorkflowContext): Promise<void> {
    const taskId = ctx.job.tasks.bioTaskId!;
    const result = await ctx.pollTask(taskId, 'setup');

    if (isTaskSuccess(result.status)) {
      ctx.log('info', 'Bio set successfully');
      await ctx.takeScreenshot('After Bio');
      const nextState = this.getNextStateFromContext(ctx, 'SETUP_POST_1');
      ctx.transitionTo(nextState);
    } else {
      ctx.log('warn', `Set bio failed (status ${result.status}): ${result.failDesc || 'unknown'}`);
      ctx.job.tasks.bioTaskId = null;
      ctx.transitionTo('SET_BIO');
    }
  }

  /**
   * SETUP_POST_1: Create first post
   */
  private async handleSetupPost1(ctx: WorkflowContext): Promise<void> {
    const setup = ctx.job.account?.setup;
    const flowId = ctx.config.setupFlowIds?.createPost;

    if (!flowId || !setup?.post1) {
      ctx.log('info', 'Post 1 not configured, skipping');
      const nextState = this.getNextStateFromContext(ctx, 'SETUP_POST_2');
      ctx.transitionTo(nextState);
      return;
    }

    await ctx.withRetry('SETUP_POST_1', async () => {
      const response = await ctx.client.createCustomTask(
        ctx.job.envId,
        flowId,
        {
          name: `Create Post 1 for ${ctx.job.account!.username}`,
          paramMap: {
            description: setup.post1!.description,
            mediaUrls: setup.post1!.mediaUrls.join(','),
            type: setup.post1!.type,
          },
        }
      );

      if (response.code === GEELARK_ERROR_CODES.SUCCESS) {
        ctx.job.tasks.setupPost1TaskId = response.data.taskId;
        ctx.log('info', `Create post 1 task started: ${response.data.taskId}`);
        ctx.transitionTo('POLL_SETUP_POST_1_TASK');
        return;
      }

      if (response.code === GEELARK_ERROR_CODES.ENV_NOT_RUNNING) {
        throw new PhoneNotRunningError(ctx.job.envId);
      }

      throw new GeeLarkAPIError(
        'createCustomTask (createPost1)',
        response.code,
        response.msg
      );
    });
  }

  private async handlePollSetupPost1Task(ctx: WorkflowContext): Promise<void> {
    const taskId = ctx.job.tasks.setupPost1TaskId!;
    const result = await ctx.pollTask(taskId, 'setup');

    if (isTaskSuccess(result.status)) {
      ctx.log('info', 'Post 1 created successfully');
      await ctx.takeScreenshot('After Post 1');
      const nextState = this.getNextStateFromContext(ctx, 'SETUP_POST_2');
      ctx.transitionTo(nextState);
    } else {
      ctx.log('warn', `Create post 1 failed (status ${result.status}): ${result.failDesc || 'unknown'}`);
      ctx.job.tasks.setupPost1TaskId = null;
      ctx.transitionTo('SETUP_POST_1');
    }
  }

  /**
   * SETUP_POST_2: Create second post
   */
  private async handleSetupPost2(ctx: WorkflowContext): Promise<void> {
    const setup = ctx.job.account?.setup;
    const flowId = ctx.config.setupFlowIds?.createPost;

    if (!flowId || !setup?.post2) {
      ctx.log('info', 'Post 2 not configured, skipping');
      const nextState = this.getNextStateFromContext(ctx, 'CREATE_STORY_HIGHLIGHT');
      ctx.transitionTo(nextState);
      return;
    }

    await ctx.withRetry('SETUP_POST_2', async () => {
      const response = await ctx.client.createCustomTask(
        ctx.job.envId,
        flowId,
        {
          name: `Create Post 2 for ${ctx.job.account!.username}`,
          paramMap: {
            description: setup.post2!.description,
            mediaUrls: setup.post2!.mediaUrls.join(','),
            type: setup.post2!.type,
          },
        }
      );

      if (response.code === GEELARK_ERROR_CODES.SUCCESS) {
        ctx.job.tasks.setupPost2TaskId = response.data.taskId;
        ctx.log('info', `Create post 2 task started: ${response.data.taskId}`);
        ctx.transitionTo('POLL_SETUP_POST_2_TASK');
        return;
      }

      if (response.code === GEELARK_ERROR_CODES.ENV_NOT_RUNNING) {
        throw new PhoneNotRunningError(ctx.job.envId);
      }

      throw new GeeLarkAPIError(
        'createCustomTask (createPost2)',
        response.code,
        response.msg
      );
    });
  }

  private async handlePollSetupPost2Task(ctx: WorkflowContext): Promise<void> {
    const taskId = ctx.job.tasks.setupPost2TaskId!;
    const result = await ctx.pollTask(taskId, 'setup');

    if (isTaskSuccess(result.status)) {
      ctx.log('info', 'Post 2 created successfully');
      await ctx.takeScreenshot('After Post 2');
      const nextState = this.getNextStateFromContext(ctx, 'CREATE_STORY_HIGHLIGHT');
      ctx.transitionTo(nextState);
    } else {
      ctx.log('warn', `Create post 2 failed (status ${result.status}): ${result.failDesc || 'unknown'}`);
      ctx.job.tasks.setupPost2TaskId = null;
      ctx.transitionTo('SETUP_POST_2');
    }
  }

  /**
   * CREATE_STORY_HIGHLIGHT: Create story highlight
   */
  private async handleCreateStoryHighlight(ctx: WorkflowContext): Promise<void> {
    const setup = ctx.job.account?.setup;
    const flowId = ctx.config.setupFlowIds?.createStoryHighlight;

    if (!flowId || !setup?.highlightTitle) {
      ctx.log('info', 'Story highlight not configured, skipping');
      const nextState = this.getNextStateFromContext(ctx, 'SET_PRIVATE');
      ctx.transitionTo(nextState);
      return;
    }

    await ctx.withRetry('CREATE_STORY_HIGHLIGHT', async () => {
      const response = await ctx.client.createCustomTask(
        ctx.job.envId,
        flowId,
        {
          name: `Create Story Highlight for ${ctx.job.account!.username}`,
          paramMap: {
            title: setup.highlightTitle,
            coverUrl: setup.highlightCoverUrl || '',
          },
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

  private async handlePollStoryHighlightTask(ctx: WorkflowContext): Promise<void> {
    const taskId = ctx.job.tasks.storyHighlightTaskId!;
    const result = await ctx.pollTask(taskId, 'setup');

    if (isTaskSuccess(result.status)) {
      ctx.log('info', 'Story highlight created successfully');
      await ctx.takeScreenshot('After Story Highlight');
      const nextState = this.getNextStateFromContext(ctx, 'SET_PRIVATE');
      ctx.transitionTo(nextState);
    } else {
      ctx.log('warn', `Create story highlight failed (status ${result.status}): ${result.failDesc || 'unknown'}`);
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
      ctx.log('info', 'Set private not configured, skipping');
      const nextState = this.getNextStateFromContext(ctx, 'ENABLE_2FA');
      ctx.transitionTo(nextState);
      return;
    }

    await ctx.withRetry('SET_PRIVATE', async () => {
      const response = await ctx.client.createCustomTask(
        ctx.job.envId,
        flowId,
        {
          name: `Set Private for ${ctx.job.account!.username}`,
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

  private async handlePollSetPrivateTask(ctx: WorkflowContext): Promise<void> {
    const taskId = ctx.job.tasks.setPrivateTaskId!;
    const result = await ctx.pollTask(taskId, 'setup');

    if (isTaskSuccess(result.status)) {
      ctx.log('info', 'Account set to private successfully');
      await ctx.takeScreenshot('After Set Private');
      const nextState = this.getNextStateFromContext(ctx, 'ENABLE_2FA');
      ctx.transitionTo(nextState);
    } else {
      ctx.log('warn', `Set private failed (status ${result.status}): ${result.failDesc || 'unknown'}`);
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
      ctx.log('info', '2FA not configured, skipping');
      ctx.log('info', 'Custom workflow complete');
      ctx.transitionTo('DONE');
      return;
    }

    await ctx.withRetry('ENABLE_2FA', async () => {
      const response = await ctx.client.createCustomTask(
        ctx.job.envId,
        flowId,
        {
          name: `Enable 2FA for ${ctx.job.account!.username}`,
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

  private async handlePoll2FATask(ctx: WorkflowContext): Promise<void> {
    const taskId = ctx.job.tasks.enable2FATaskId!;
    const result = await ctx.pollTask(taskId, 'setup');

    if (isTaskSuccess(result.status)) {
      ctx.log('info', '2FA enabled successfully');
      await ctx.takeScreenshot('After Enable 2FA');
      ctx.log('info', 'Custom workflow complete');
      ctx.transitionTo('DONE');
    } else {
      ctx.log('warn', `Enable 2FA failed (status ${result.status}): ${result.failDesc || 'unknown'}`);
      ctx.job.tasks.enable2FATaskId = null;
      ctx.transitionTo('ENABLE_2FA');
    }
  }
}
