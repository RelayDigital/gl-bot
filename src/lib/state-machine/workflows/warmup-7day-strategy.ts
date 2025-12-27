import { GeeLarkAPIError } from '@/lib/geelark/client';
import { GEELARK_ERROR_CODES, isTaskSuccess, TaskFlow } from '@/lib/geelark/types';
import {
  PhoneJob,
  PhoneState,
  RetryableState,
  WorkflowType,
  WARMUP_TOTAL_STEPS,
} from '../types';
import { WorkflowStrategy, WorkflowContext, StateHandler } from './types';

/**
 * Search patterns for auto-detecting warmup day task flows
 * Each day has multiple patterns to match against flow titles (case-insensitive)
 */
const WARMUP_DAY_PATTERNS: Record<number, string[]> = {
  1: ['day 1', 'day1', 'first impressions', 'warmup 1', 'warmup1'],
  2: ['day 2', 'day2', 'building signals', 'warmup 2', 'warmup2'],
  3: ['day 3', 'day3', 'deeper engagement', 'warmup 3', 'warmup3'],
  4: ['day 4', 'day4', 'exploration', 'warmup 4', 'warmup4'],
  5: ['day 5', 'day5', 'credibility building', 'warmup 5', 'warmup5'],
  6: ['day 6', 'day6', 'increased activity', 'warmup 6', 'warmup6'],
  7: ['day 7', 'day7', 'trust layering', 'warmup 7', 'warmup7'],
};

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
 * 7-Day Instagram Warmup Strategy
 *
 * This strategy handles the 7-day warmup SOP for new Instagram accounts.
 * Each day runs a specific custom RPA flow that performs actions defined in the SOP.
 *
 * Day 1: Passive browsing (scroll feed, search hashtags, watch reels - no likes/follows)
 * Day 2: Story posting and light following (post story, follow by keyword, watch videos)
 * Day 3: Highlights, likes, and first feed post (add highlight, like ~30%, follow)
 * Day 4: Channel interaction (highlight, story, follow channels, watch stories)
 * Day 5: Hashtag engagement (hashtag search & likes, repost content)
 * Day 6: Increased posting and following (post to feed, active following)
 * Day 7: Final trust layering (follow suggested, upload avatar, unfollow random)
 *
 * Flow: RUN_WARMUP_DAY → POLL_WARMUP_DAY_TASK → DONE
 */
export class Warmup7DayStrategy implements WorkflowStrategy {
  private day: number;

  constructor(day: number) {
    if (day < 1 || day > 7) {
      throw new Error(`Invalid warmup day: ${day}. Must be 1-7.`);
    }
    this.day = day;
  }

  /**
   * Instagram warmup requires login via instagramLogin RPA task
   */
  requiresLogin(): boolean {
    return true;
  }

  /**
   * Get the first state after login completes
   * Goes directly to the warmup day task
   */
  getPostLoginState(_job: PhoneJob): PhoneState {
    return 'WARMUP';
  }

  /**
   * Get the handler for warmup day workflow states
   */
  getStateHandler(
    state: PhoneState,
    context: WorkflowContext
  ): StateHandler | null {
    switch (state) {
      case 'WARMUP':
        return () => this.handleWarmupDay(context);
      case 'POLL_WARMUP_TASK':
        return () => this.handlePollWarmupDayTask(context);
      default:
        return null;
    }
  }

  /**
   * Get total steps for 7-day warmup workflow
   */
  getTotalSteps(): number {
    return WARMUP_TOTAL_STEPS;
  }

  /**
   * Get retryable states for 7-day warmup workflow
   */
  getRetryableStates(): RetryableState[] {
    return ['WARMUP'];
  }

  /**
   * Get the flow ID key for this day
   */
  private getFlowIdKey(): string {
    return `warmupDay${this.day}`;
  }

  /**
   * Find a matching task flow for this warmup day
   * Searches flow titles for patterns like "Day 1", "First Impressions", etc.
   */
  private findMatchingFlow(taskFlows: TaskFlow[]): TaskFlow | null {
    const patterns = WARMUP_DAY_PATTERNS[this.day];
    if (!patterns) return null;

    for (const flow of taskFlows) {
      const titleLower = flow.title.toLowerCase();
      for (const pattern of patterns) {
        if (titleLower.includes(pattern)) {
          return flow;
        }
      }
    }
    return null;
  }

  /**
   * WARMUP: Execute the warmup day RPA task
   */
  private async handleWarmupDay(ctx: WorkflowContext): Promise<void> {
    // Check if warmup task was already started
    if (ctx.job.tasks.warmupTaskId) {
      ctx.log(
        'info',
        `Using existing Day ${this.day} warmup task: ${ctx.job.tasks.warmupTaskId}`
      );
      ctx.transitionTo('POLL_WARMUP_TASK');
      return;
    }

    // First, try to get flow ID from manual config (backward compatibility)
    const flowIdKey = this.getFlowIdKey();
    let flowId = (ctx.config.setupFlowIds as Record<string, string | undefined>)?.[flowIdKey];
    let flowTitle = `Day ${this.day} Warmup`;

    // If no manual config, auto-detect from available task flows
    if (!flowId) {
      ctx.log('info', `Searching for Day ${this.day} warmup task flow...`);

      try {
        const taskFlows = await ctx.client.listAllTaskFlows();
        const matchedFlow = this.findMatchingFlow(taskFlows);

        if (matchedFlow) {
          flowId = matchedFlow.id;
          flowTitle = matchedFlow.title;
          ctx.log('info', `Found matching flow: "${flowTitle}" (${flowId})`);
        } else {
          // Log available flows for debugging
          const availableTitles = taskFlows.map(f => f.title).join(', ');
          ctx.log('error', `No matching task flow found for Day ${this.day}. Available flows: ${availableTitles || 'none'}`);
          ctx.log('error', `Please upload a task flow with "Day ${this.day}" or related keywords in the title.`);
          ctx.transitionTo('DONE');
          return;
        }
      } catch (err) {
        ctx.log('error', `Failed to fetch task flows: ${err instanceof Error ? err.message : String(err)}`);
        ctx.transitionTo('DONE');
        return;
      }
    }

    await ctx.withRetry('WARMUP', async () => {
      ctx.log('info', `Starting ${flowTitle}...`);

      const paramMap = this.getParamsForDay(ctx);
      ctx.log('debug', `Task params: ${JSON.stringify(paramMap)}`);

      const response = await ctx.client.createCustomTask(
        ctx.job.envId,
        flowId!,
        {
          name: `${flowTitle} for ${ctx.job.account?.username || 'unknown'}`,
          paramMap,
        }
      );

      ctx.log('debug', `API response: code=${response.code}, msg=${response.msg}`);

      if (response.code === GEELARK_ERROR_CODES.SUCCESS) {
        ctx.job.tasks.warmupTaskId = response.data.taskId;
        ctx.log('info', `${flowTitle} task started: ${response.data.taskId}`);
        ctx.transitionTo('POLL_WARMUP_TASK');
        return;
      }

      if (response.code === GEELARK_ERROR_CODES.ENV_NOT_RUNNING) {
        throw new PhoneNotRunningError(ctx.job.envId);
      }

      throw new GeeLarkAPIError(
        `createCustomTask (warmupDay${this.day})`,
        response.code,
        response.msg
      );
    });
  }

  /**
   * Get parameters for the warmup day flow
   *
   * Matches the actual flow parameters from GeeLark:
   * - Day 1: No params needed
   * - Day 2: storyFile, followKeyword
   * - Day 3: storyFile, highlightName
   * - Day 4: storyFile, keyword
   * - Day 5: storyFile, keyword
   * - Day 6: mediaFiles
   * - Day 7: mediaFiles
   *
   * Note: storyFile and mediaFiles require URLs to uploaded media.
   * If not provided, the flow may still run but skip media-related actions.
   */
  private getParamsForDay(ctx: WorkflowContext): Record<string, unknown> {
    const account = ctx.job.account;
    const accountType = account?.flags?.accountType;

    // Check if account has setup data with media URLs
    const setup = account?.setup;
    const profilePicUrl = setup?.profilePictureUrl || '';
    const post1MediaUrls = setup?.post1?.mediaUrls || [];

    // Use profile pic or first post media as storyFile if available
    const storyFile = profilePicUrl || (post1MediaUrls.length > 0 ? post1MediaUrls[0] : '');
    const mediaFiles = post1MediaUrls.length > 0 ? post1MediaUrls : [];

    switch (this.day) {
      case 1:
        // Day 1: View-only - NO params needed
        return {};

      case 2:
        // Day 2: Story and Following
        // Params: storyFile (optional), followKeyword
        return {
          ...(storyFile ? { storyFile } : {}),
          followKeyword: accountType === 'reels' ? 'entertainment' : 'podcast',
        };

      case 3:
        // Day 3: Highlights and Likes
        // Params: storyFile (optional), highlightName
        return {
          ...(storyFile ? { storyFile } : {}),
          highlightName: String(Math.floor(Math.random() * 100)),
        };

      case 4:
        // Day 4: Channel Interaction
        // Params: storyFile (optional), keyword
        return {
          ...(storyFile ? { storyFile } : {}),
          keyword: 'entertainment',
        };

      case 5:
        // Day 5: Hashtag Engagement
        // Params: storyFile (optional), keyword
        return {
          ...(storyFile ? { storyFile } : {}),
          keyword: 'rest and fit',
        };

      case 6:
        // Day 6: Increased Activity
        // Params: mediaFiles (optional)
        return mediaFiles.length > 0 ? { mediaFiles } : {};

      case 7:
        // Day 7: Trust Layering
        // Params: mediaFiles (optional)
        return mediaFiles.length > 0 ? { mediaFiles } : {};

      default:
        return {};
    }
  }

  /**
   * POLL_WARMUP_TASK: Wait for warmup day task to complete
   */
  private async handlePollWarmupDayTask(ctx: WorkflowContext): Promise<void> {
    const taskId = ctx.job.tasks.warmupTaskId!;
    const result = await ctx.pollTaskWithScreenshots(taskId, 'warmup', `Day ${this.day} Warmup`);

    if (isTaskSuccess(result.status)) {
      ctx.log('info', `Day ${this.day} warmup completed successfully`);
      await ctx.takeScreenshot(`After Day ${this.day} Warmup`);
      ctx.transitionTo('DONE');
    } else {
      ctx.log(
        'warn',
        `Day ${this.day} warmup failed (status ${result.status}): ${result.failDesc || 'unknown'}`
      );

      // Clear task ID and retry
      ctx.job.tasks.warmupTaskId = null;
      ctx.transitionTo('WARMUP');
    }
  }
}

/**
 * Factory function to create a 7-day warmup strategy for a specific day
 */
export function createWarmup7DayStrategy(workflowType: WorkflowType): WorkflowStrategy {
  const dayMatch = workflowType.match(/^warmup_day(\d)$/);
  if (!dayMatch) {
    throw new Error(`Invalid 7-day warmup workflow type: ${workflowType}`);
  }

  const day = parseInt(dayMatch[1], 10);
  return new Warmup7DayStrategy(day);
}
