import { GeeLarkAPIError } from '@/lib/geelark/client';
import { GEELARK_ERROR_CODES, isTaskSuccess } from '@/lib/geelark/types';
import {
  PhoneJob,
  PhoneState,
  RetryableState,
  SetupData,
  SISTER_TOTAL_STEPS,
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
 * Sister Account workflow strategy
 *
 * Flow: RENAME_USERNAME → EDIT_DISPLAY_NAME → SET_PROFILE_PICTURE → SET_BIO → DONE
 *
 * This workflow is for transforming existing accounts into "sister" accounts:
 * - Renames the username
 * - Edits the display name
 * - Sets a new profile picture
 * - Sets a new bio
 *
 * No posts, privacy settings, or 2FA - those are handled separately if needed.
 */
export class SisterStrategy implements WorkflowStrategy {
  /**
   * Instagram sister account workflow requires login via instagramLogin RPA task
   */
  requiresLogin(): boolean {
    return true;
  }

  /**
   * Get the first state after login completes
   *
   * Sister workflow starts with renaming the username
   */
  getPostLoginState(job: PhoneJob): PhoneState {
    const setup = job.account?.setup;
    const nextState = this.getNextSisterState(job, 'RENAME_USERNAME');

    // Log what data is available for debugging
    console.log(`[Sister] getPostLoginState for ${job.serialName}:`, {
      hasSetup: !!setup,
      newUsername: setup?.newUsername || '(not set)',
      newDisplayName: setup?.newDisplayName || '(not set)',
      profilePictureUrl: setup?.profilePictureUrl ? '(set)' : '(not set)',
      bio: setup?.bio ? '(set)' : '(not set)',
      nextState,
    });

    return nextState;
  }

  /**
   * Get the handler for a sister workflow state
   */
  getStateHandler(
    state: PhoneState,
    context: WorkflowContext
  ): StateHandler | null {
    switch (state) {
      case 'RENAME_USERNAME':
        return () => this.handleRenameUsername(context);
      case 'POLL_RENAME_USERNAME_TASK':
        return () => this.handlePollRenameUsernameTask(context);
      case 'EDIT_DISPLAY_NAME':
        return () => this.handleEditDisplayName(context);
      case 'POLL_EDIT_DISPLAY_NAME_TASK':
        return () => this.handlePollEditDisplayNameTask(context);
      case 'SET_PROFILE_PICTURE':
        return () => this.handleSetProfilePicture(context);
      case 'POLL_PROFILE_PICTURE_TASK':
        return () => this.handlePollProfilePictureTask(context);
      case 'SET_BIO':
        return () => this.handleSetBio(context);
      case 'POLL_BIO_TASK':
        return () => this.handlePollBioTask(context);
      default:
        return null;
    }
  }

  /**
   * Get total steps for sister workflow
   */
  getTotalSteps(): number {
    return SISTER_TOTAL_STEPS;
  }

  /**
   * Get retryable states for sister workflow
   */
  getRetryableStates(): RetryableState[] {
    return ['RENAME_USERNAME', 'EDIT_DISPLAY_NAME', 'SET_PROFILE_PICTURE', 'SET_BIO'];
  }

  // ==================== Helper Methods ====================

  /**
   * Get the next sister state to transition to
   *
   * Skips states where data/flow is not configured
   */
  private getNextSisterState(
    job: PhoneJob,
    fromState: PhoneState
  ): PhoneState {
    const setup = job.account?.setup;
    const stateOrder: PhoneState[] = [
      'RENAME_USERNAME',
      'EDIT_DISPLAY_NAME',
      'SET_PROFILE_PICTURE',
      'SET_BIO',
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
    _job: PhoneJob,
    state: PhoneState,
    setup: SetupData | undefined
  ): boolean {
    switch (state) {
      case 'RENAME_USERNAME':
        return !!setup?.newUsername;
      case 'EDIT_DISPLAY_NAME':
        return !!setup?.newDisplayName;
      case 'SET_PROFILE_PICTURE':
        return !!setup?.profilePictureUrl;
      case 'SET_BIO':
        return !!setup?.bio;
      default:
        return false;
    }
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

    // Skip if no new username AND no display name to generate from
    if (!setup?.newUsername && !setup?.newDisplayName) {
      ctx.log('info', 'No new username configured, skipping');
      const nextState = this.getNextSisterState(ctx.job, 'EDIT_DISPLAY_NAME');
      ctx.transitionTo(nextState);
      return;
    }

    const flowId = ctx.config.setupFlowIds?.renameUsername;
    if (!flowId) {
      throw new MissingFlowError('Rename Username');
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
  private async handlePollRenameUsernameTask(
    ctx: WorkflowContext
  ): Promise<void> {
    const taskId = ctx.job.tasks.renameUsernameTaskId!;
    const result = await ctx.pollTask(taskId, 'setup');

    if (isTaskSuccess(result.status)) {
      const currentUsername = ctx.job.usernameGeneration?.currentUsername;
      ctx.log('info', `Username renamed successfully to: ${currentUsername}`);
      await ctx.takeScreenshot('After Username Rename');

      // Clear username generation state
      ctx.job.usernameGeneration = undefined;

      const nextState = this.getNextSisterState(ctx.job, 'EDIT_DISPLAY_NAME');
      ctx.transitionTo(nextState);
    } else {
      const failDesc = result.failDesc || 'unknown';
      ctx.log(
        'warn',
        `Rename username failed (status ${result.status}): ${failDesc}`
      );

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

    // Skip if no new display name
    if (!setup?.newDisplayName) {
      ctx.log('info', 'No new display name configured, skipping');
      const nextState = this.getNextSisterState(ctx.job, 'SET_PROFILE_PICTURE');
      ctx.transitionTo(nextState);
      return;
    }

    const flowId = ctx.config.setupFlowIds?.editDisplayName;
    if (!flowId) {
      throw new MissingFlowError('Edit Display Name');
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

  /**
   * POLL_EDIT_DISPLAY_NAME_TASK: Wait for edit display name task to complete
   */
  private async handlePollEditDisplayNameTask(
    ctx: WorkflowContext
  ): Promise<void> {
    const taskId = ctx.job.tasks.editDisplayNameTaskId!;
    const result = await ctx.pollTask(taskId, 'setup');

    if (isTaskSuccess(result.status)) {
      ctx.log('info', 'Display name edited successfully');
      await ctx.takeScreenshot('After Display Name Edit');

      const nextState = this.getNextSisterState(ctx.job, 'SET_PROFILE_PICTURE');
      ctx.transitionTo(nextState);
    } else {
      ctx.log(
        'warn',
        `Edit display name failed (status ${result.status}): ${result.failDesc || 'unknown'}`
      );
      ctx.job.tasks.editDisplayNameTaskId = null;
      ctx.transitionTo('EDIT_DISPLAY_NAME');
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
      const nextState = this.getNextSisterState(ctx.job, 'SET_BIO');
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

      const nextState = this.getNextSisterState(ctx.job, 'SET_BIO');
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
      ctx.transitionTo('DONE');
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
      ctx.log('info', 'Sister account workflow complete');
      ctx.transitionTo('DONE');
    } else {
      ctx.log(
        'warn',
        `Set bio failed (status ${result.status}): ${result.failDesc || 'unknown'}`
      );
      ctx.job.tasks.bioTaskId = null;
      ctx.transitionTo('SET_BIO');
    }
  }
}
