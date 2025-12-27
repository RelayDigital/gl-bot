/**
 * Reddit Warmup Workflow Strategy
 *
 * Simple workflow: Login → Reddit Warmup → Done
 * Browses Reddit content to warm up the account.
 *
 * The main state machine handles:
 * - INIT → START_ENV → CONFIRM_ENV_RUNNING → INSTALL_APP →
 *   CONFIRM_APP_INSTALLED → LOGIN → POLL_LOGIN_TASK
 *
 * This strategy handles:
 * - REDDIT_WARMUP → POLL_REDDIT_WARMUP_TASK → DONE
 */

import { GeeLarkAPIError } from '@/lib/geelark/client';
import { WorkflowStrategy, WorkflowContext, StateHandler } from './types';
import { PhoneJob, PhoneState, RetryableState, REDDIT_WARMUP_TOTAL_STEPS } from '../types';

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

// Warmup task timeout (10 minutes)
const WARMUP_TASK_TIMEOUT_SECONDS = 600;

export class RedditWarmupStrategy implements WorkflowStrategy {
  readonly name = 'reddit_warmup';
  readonly displayName = 'Reddit Warmup';
  readonly description = 'Browse and engage with content to warm up account';

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
  getPostLoginState(_job: PhoneJob): PhoneState {
    return 'REDDIT_WARMUP';
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
      default:
        return null;
    }
  }

  /**
   * Get total steps for progress tracking
   */
  getTotalSteps(): number {
    return REDDIT_WARMUP_TOTAL_STEPS;
  }

  /**
   * Get retryable states for Reddit warmup workflow
   */
  getRetryableStates(): RetryableState[] {
    return ['REDDIT_WARMUP'];
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

      // Phone not running - trigger restart
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
      ctx.log('warn', 'No Reddit warmup task ID found, skipping to done');
      ctx.transitionTo('DONE');
      return;
    }

    const result = await ctx.pollTask(taskId, 'warmup', WARMUP_TASK_TIMEOUT_SECONDS);

    // Status: 3 = success, 4 = failed
    if (result.status === 3) {
      ctx.log('info', 'Reddit warmup completed successfully');
      ctx.transitionTo('DONE');
      return;
    }

    if (result.status === 4) {
      throw new Error(`Reddit warmup failed: ${result.failDesc || 'Unknown error'}`);
    }

    // Still in progress - pollTask handles this internally
  }
}
