import { GeeLarkClient } from '@/lib/geelark/client';
import {
  PhoneJob,
  PhoneState,
  WorkflowConfig,
  RetryableState,
} from '../types';

/**
 * Context provided to workflow strategies
 *
 * Contains all the dependencies needed for state handlers to execute.
 * This allows strategies to be decoupled from the main state machine
 * while still having access to necessary functionality.
 */
export interface WorkflowContext {
  /** The current phone job with state and data */
  job: PhoneJob;

  /** Workflow configuration including credentials, limits, timeouts */
  config: WorkflowConfig;

  /** GeeLark API client for making API calls */
  client: GeeLarkClient;

  /** Transition to a new state */
  transitionTo: (nextState: PhoneState) => void;

  /** Transition to failed state with error message */
  transitionToFailed: (error: string) => Promise<void>;

  /** Log a message at the specified level */
  log: (level: 'info' | 'warn' | 'error' | 'debug', message: string) => void;

  /** Emit a phone update event */
  emitUpdate: () => void;

  /** Sleep with abort support */
  sleepWithAbort: (ms: number) => Promise<void>;

  /**
   * Poll a task until terminal state
   *
   * @param taskId - The task ID to poll
   * @param taskType - Type of task for UI display
   * @param timeoutSeconds - Optional timeout override
   */
  pollTask: (
    taskId: string,
    taskType: 'login' | 'warmup' | 'publish' | 'setup',
    timeoutSeconds?: number
  ) => Promise<{ status: number; failDesc?: string }>;

  /**
   * Poll a task with periodic screenshots (for long-running tasks)
   *
   * @param taskId - The task ID to poll
   * @param taskType - Type of task for UI display
   * @param stepLabel - Label prefix for screenshots
   */
  pollTaskWithScreenshots: (
    taskId: string,
    taskType: 'login' | 'warmup' | 'publish' | 'setup',
    stepLabel: string
  ) => Promise<{ status: number; failDesc?: string }>;

  /**
   * Take a screenshot at the current workflow step
   *
   * @param stepName - Human-readable step name for the screenshot
   */
  takeScreenshot: (stepName: string) => Promise<boolean>;

  /** Check if the state machine has been aborted */
  isAborted: () => boolean;

  /**
   * Execute an operation with retry and exponential backoff
   *
   * @param stateName - The state being retried (for attempt tracking)
   * @param operation - The async operation to execute
   */
  withRetry: (
    stateName: RetryableState,
    operation: () => Promise<void>
  ) => Promise<void>;
}

/**
 * Workflow strategy interface
 *
 * Each workflow type (Warmup, Setup) implements this interface to define
 * its specific behavior after the shared login phase completes.
 *
 * Shared states (IDLE → LOGIN → POLL_LOGIN_TASK) are handled by the main
 * state machine. Workflow-specific states are delegated to the strategy.
 */
export interface WorkflowStrategy {
  /**
   * Whether this workflow requires the automated login step
   *
   * Instagram workflows return true (use instagramLogin RPA task).
   * Reddit workflows return false (accounts are pre-logged in).
   *
   * When false, the machine skips LOGIN/POLL_LOGIN_TASK and goes
   * directly to getPostLoginState() after app installation.
   */
  requiresLogin(): boolean;

  /**
   * Get the first state after login completes (or after app install if login not required)
   *
   * Called when POLL_LOGIN_TASK succeeds to determine which
   * workflow-specific state to transition to next.
   *
   * @param job - The current phone job
   * @returns The next state to transition to
   */
  getPostLoginState(job: PhoneJob): PhoneState;

  /**
   * Get the handler function for a workflow-specific state
   *
   * @param state - The current phone state
   * @param context - Workflow context with dependencies
   * @returns Handler function or null if state not handled by this strategy
   */
  getStateHandler(
    state: PhoneState,
    context: WorkflowContext
  ): (() => Promise<void>) | null;

  /**
   * Get the total number of steps for this workflow
   *
   * Used for progress tracking in the UI.
   */
  getTotalSteps(): number;

  /**
   * Get the list of retryable states for this workflow
   *
   * These states support exponential backoff retry on failure.
   */
  getRetryableStates(): RetryableState[];
}

/**
 * State handler function type
 *
 * A function that executes the logic for a single state.
 */
export type StateHandler = () => Promise<void>;
