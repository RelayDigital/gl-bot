import { WorkflowType } from '../types';
import { WorkflowStrategy } from './types';
import { WarmupStrategy } from './warmup-strategy';
import { SetupStrategy } from './setup-strategy';
import { SisterStrategy } from './sister-strategy';
import { CustomStrategy } from './custom-strategy';
import { PostOnlyStrategy } from './post-strategy';
import { RedditWarmupStrategy } from './reddit-warmup-strategy';
import { RedditPostStrategy } from './reddit-post-strategy';

/**
 * Registry of workflow strategies by type
 */
const strategies: Record<WorkflowType, WorkflowStrategy> = {
  // Instagram workflows
  warmup: new WarmupStrategy(),
  setup: new SetupStrategy(),
  sister: new SisterStrategy(),
  custom: new CustomStrategy(),
  post: new PostOnlyStrategy(),
  // Reddit workflows
  reddit_warmup: new RedditWarmupStrategy(),
  reddit_post: new RedditPostStrategy(),
};

/**
 * Get the workflow strategy for a given workflow type
 *
 * @param workflowType - The type of workflow to get strategy for
 * @returns The workflow strategy instance
 */
export function getWorkflowStrategy(workflowType: WorkflowType): WorkflowStrategy {
  const strategy = strategies[workflowType];
  if (!strategy) {
    throw new Error(`Unknown workflow type: ${workflowType}`);
  }
  return strategy;
}

// Re-export types for convenience
export type { WorkflowStrategy, WorkflowContext } from './types';
