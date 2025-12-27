import { GeeLarkClient, GeeLarkAPIError } from '@/lib/geelark/client';
import {
  GEELARK_ERROR_CODES,
  PHONE_STATUS,
  TASK_STATUS,
  SCREENSHOT_STATUS,
  isTerminalTaskStatus,
  isTaskSuccess,
} from '@/lib/geelark/types';
import { calculateBackoff, sleep, sleepWithAbort } from '@/lib/utils/backoff';
import { workflowEmitter, createLogEntry } from '@/lib/events/emitter';
import { workflowStore } from './store';
import {
  PhoneJob,
  PhoneState,
  WorkflowConfig,
  RetryableState,
  STATE_STEP_MAP,
  TERMINAL_STATES,
  getTotalSteps,
} from './types';
import { getWorkflowStrategy, WorkflowStrategy, WorkflowContext } from './workflows';
import { generatePhoneName } from '@/lib/utils/phone-verification';

/**
 * Custom error for max retries exceeded
 */
export class MaxRetriesExceededError extends Error {
  constructor(
    public state: PhoneState,
    public attempts: number
  ) {
    super(`Max retries (${attempts}) exceeded for state ${state}`);
    this.name = 'MaxRetriesExceededError';
  }
}

/**
 * Custom error for task failures
 */
export class TaskFailedError extends Error {
  constructor(
    public taskType: 'login' | 'warmup' | 'publish',
    public status: number | string,
    public errorMsg?: string
  ) {
    super(
      `${taskType} task failed with status ${status}${errorMsg ? `: ${errorMsg}` : ''}`
    );
    this.name = 'TaskFailedError';
  }
}

/**
 * Custom error for timeout
 */
export class TimeoutError extends Error {
  constructor(public state: PhoneState) {
    super(`Timeout waiting for ${state}`);
    this.name = 'TimeoutError';
  }
}

/**
 * Custom error for missing account
 */
export class NoAccountMatchedError extends Error {
  constructor(public serialName: string) {
    super(`No account matched for phone ${serialName}`);
    this.name = 'NoAccountMatchedError';
  }
}

/**
 * Custom error for phone not running (42002)
 * This triggers a restart of the phone
 */
export class PhoneNotRunningError extends Error {
  constructor(public envId: string) {
    super(`Phone ${envId} is not running, needs restart`);
    this.name = 'PhoneNotRunningError';
  }
}

/**
 * Custom error for rate limiting (40007, 47002)
 * Triggers longer backoff before retry
 */
export class RateLimitedError extends Error {
  constructor(
    public code: number,
    public delaySeconds: number
  ) {
    super(`Rate limited (${code}), waiting ${delaySeconds}s before retry`);
    this.name = 'RateLimitedError';
  }
}

/**
 * Per-phone state machine
 *
 * Each phone runs through states independently:
 * IDLE -> INIT -> START_ENV -> CONFIRM_ENV_RUNNING -> INSTALL_IG ->
 * CONFIRM_IG_INSTALLED -> LOGIN -> POLL_LOGIN_TASK -> WARMUP ->
 * POLL_WARMUP_TASK -> DONE
 *
 * On failure at any stage, retries with exponential backoff.
 * After max retries, transitions to FAILED.
 */
export class PhoneStateMachine {
  private job: PhoneJob;
  private config: WorkflowConfig;
  private client: GeeLarkClient;
  private abortController: AbortController;
  private isComplete: boolean = false;
  private completionPromise: Promise<PhoneJob>;
  private resolveCompletion!: (job: PhoneJob) => void;
  private workflowStrategy: WorkflowStrategy;

  constructor(job: PhoneJob, config: WorkflowConfig, client: GeeLarkClient) {
    this.job = job;
    this.config = config;
    this.client = client;
    this.abortController = new AbortController();
    this.workflowStrategy = getWorkflowStrategy(config.workflowType);

    // Set total steps based on workflow type
    this.job.progress.totalSteps = getTotalSteps(config.workflowType);

    // Create completion promise
    this.completionPromise = new Promise((resolve) => {
      this.resolveCompletion = resolve;
    });
  }

  /**
   * Run the state machine until terminal state
   */
  async run(): Promise<PhoneJob> {
    this.log('info', `Starting state machine for ${this.job.serialName}`);

    while (!this.isTerminal() && !this.abortController.signal.aborted) {
      try {
        await this.executeCurrentState();
      } catch (error) {
        await this.handleError(error);
      }
    }

    this.isComplete = true;
    this.resolveCompletion(this.job);
    return this.job;
  }

  /**
   * Abort the state machine
   */
  abort(): void {
    this.abortController.abort();
  }

  /**
   * Check if state machine has completed
   */
  isCompleted(): boolean {
    return this.isComplete;
  }

  /**
   * Wait for completion
   */
  waitForCompletion(): Promise<PhoneJob> {
    return this.completionPromise;
  }

  /**
   * Get current job state
   */
  getJob(): PhoneJob {
    return { ...this.job };
  }

  // ==================== State Transition ====================

  private isTerminal(): boolean {
    return TERMINAL_STATES.includes(this.job.state);
  }

  private transitionTo(nextState: PhoneState): void {
    const prevState = this.job.state;
    this.job.state = nextState;
    this.job.timestamps.updatedAt = Date.now();
    this.job.timestamps.stateEnteredAt = Date.now();
    // Cap step at totalSteps to handle workflows with different lengths
    this.job.progress.currentStep = Math.min(
      STATE_STEP_MAP[nextState],
      this.job.progress.totalSteps
    );

    this.log('info', `${prevState} -> ${nextState}`);
    this.emitUpdate();

    // Stop phone when reaching terminal state
    if (nextState === 'DONE' || nextState === 'FAILED') {
      this.stopPhone();
    }
  }

  private async transitionToFailed(error: string): Promise<void> {
    // Capture screenshot before failing (don't await, fire and forget for speed)
    this.takeScreenshot('On Failure').catch(() => {});

    this.job.state = 'FAILED';
    this.job.lastError = error;
    this.job.timestamps.updatedAt = Date.now();
    // Cap step at totalSteps to handle workflows with different lengths
    this.job.progress.currentStep = Math.min(
      STATE_STEP_MAP['FAILED'],
      this.job.progress.totalSteps
    );

    this.log('error', `Failed: ${error}`);
    this.emitUpdate();

    // Stop phone on failure
    this.stopPhone();
  }

  /**
   * Stop the cloud phone when workflow completes or fails
   */
  private async stopPhone(): Promise<void> {
    try {
      this.log('info', 'Stopping cloud phone...');
      const response = await this.client.stopPhone(this.job.envId);
      if (response.code === GEELARK_ERROR_CODES.SUCCESS) {
        this.log('info', 'Cloud phone stopped');
      } else {
        this.log('warn', `Failed to stop phone: ${response.msg}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('warn', `Error stopping phone: ${errorMessage}`);
    }
  }

  // ==================== State Execution ====================

  private async executeCurrentState(): Promise<void> {
    const handler = this.getStateHandler(this.job.state);
    await handler();
  }

  private getStateHandler(state: PhoneState): () => Promise<void> {
    // Shared states handled by main machine
    const sharedHandlers: Partial<Record<PhoneState, () => Promise<void>>> = {
      IDLE: () => this.handleInit(),
      INIT: () => this.handleInit(),
      START_ENV: () => this.handleStartEnv(),
      CONFIRM_ENV_RUNNING: () => this.handleConfirmEnvRunning(),
      INSTALL_IG: () => this.handleInstallIG(),
      CONFIRM_IG_INSTALLED: () => this.handleConfirmIGInstalled(),
      LOGIN: () => this.handleLogin(),
      POLL_LOGIN_TASK: () => this.handlePollLoginTask(),
      RENAME_PHONE: () => this.handleRenamePhone(),
      DONE: () => Promise.resolve(),
      FAILED: () => Promise.resolve(),
    };

    // Check if this is a shared state
    const sharedHandler = sharedHandlers[state];
    if (sharedHandler) {
      return sharedHandler;
    }

    // Delegate to workflow strategy for workflow-specific states
    const ctx = this.createWorkflowContext();
    const strategyHandler = this.workflowStrategy.getStateHandler(state, ctx);
    if (strategyHandler) {
      return strategyHandler;
    }

    // Fallback - should never happen if states are properly configured
    throw new Error(`No handler found for state: ${state}`);
  }

  /**
   * Create a workflow context for strategy handlers
   */
  private createWorkflowContext(): WorkflowContext {
    return {
      job: this.job,
      config: this.config,
      client: this.client,
      transitionTo: (nextState: PhoneState) => this.transitionTo(nextState),
      transitionToFailed: (error: string) => this.transitionToFailed(error),
      log: (level, message) => this.log(level, message),
      emitUpdate: () => this.emitUpdate(),
      sleepWithAbort: (ms: number) => this.sleepWithAbort(ms),
      pollTask: (taskId, taskType, timeout) => this.pollTask(taskId, taskType, timeout),
      pollTaskWithScreenshots: (taskId, taskType, stepLabel) =>
        this.pollTaskWithScreenshots(taskId, taskType, stepLabel),
      takeScreenshot: (stepName: string) => this.takeScreenshot(stepName),
      isAborted: () => this.abortController.signal.aborted,
      withRetry: (stateName, operation) => this.withRetry(stateName, operation),
    };
  }

  // ==================== State Handlers ====================

  /**
   * INIT: Validate phone has matched account
   */
  private async handleInit(): Promise<void> {
    if (!this.job.account) {
      throw new NoAccountMatchedError(this.job.serialName);
    }

    this.log('info', `Matched account: ${this.job.account.username}`);
    this.transitionTo('START_ENV');
  }

  /**
   * START_ENV: Start the phone environment
   */
  private async handleStartEnv(): Promise<void> {
    await this.withRetry('START_ENV', async () => {
      const response = await this.client.startPhone(this.job.envId);

      if (response.code !== GEELARK_ERROR_CODES.SUCCESS) {
        throw new GeeLarkAPIError('startPhone', response.code, response.msg);
      }

      this.log('info', 'Environment start requested');
      this.transitionTo('CONFIRM_ENV_RUNNING');
    });
  }

  /**
   * CONFIRM_ENV_RUNNING: Wait for environment to be running
   */
  private async handleConfirmEnvRunning(): Promise<void> {
    await this.withRetry('CONFIRM_ENV_RUNNING', async () => {
      const startTime = Date.now();
      const timeout = this.config.pollTimeoutSeconds * 1000;

      while (Date.now() - startTime < timeout) {
        if (this.abortController.signal.aborted) return;

        try {
          const response = await this.client.getPhoneStatus(this.job.envId);

          if (response.code === GEELARK_ERROR_CODES.SUCCESS) {
            // Check status field (0 = Started/Running)
            if (response.data?.status === PHONE_STATUS.STARTED) {
              this.log('info', 'Environment confirmed running');
              this.transitionTo('INSTALL_IG');
              return;
            }
            this.log('debug', `Phone status: ${response.data?.status} (waiting for ${PHONE_STATUS.STARTED})`);
          }
        } catch {
          // Ignore errors during polling, will timeout if persistent
        }

        await this.sleepWithAbort(this.config.pollIntervalSeconds * 1000);
      }

      throw new TimeoutError('CONFIRM_ENV_RUNNING');
    });
  }

  /**
   * INSTALL_IG: Request Instagram installation
   *
   * Handles special error codes:
   * - 42003 (APP_BEING_INSTALLED): Installation already in progress, proceed
   * - 42004 (APP_HIGHER_VERSION_EXISTS): Already installed, proceed
   */
  private async handleInstallIG(): Promise<void> {
    await this.withRetry('INSTALL_IG', async () => {
      const response = await this.client.installApp(
        this.job.envId,
        this.config.igAppVersionId
      );

      // Success - installation requested
      if (response.code === GEELARK_ERROR_CODES.SUCCESS) {
        this.log('info', 'Instagram installation requested');
        this.transitionTo('CONFIRM_IG_INSTALLED');
        return;
      }

      // App is already being installed - proceed to confirmation
      if (response.code === GEELARK_ERROR_CODES.APP_BEING_INSTALLED) {
        this.log('info', 'Instagram installation already in progress');
        this.transitionTo('CONFIRM_IG_INSTALLED');
        return;
      }

      // Higher version already installed - app is ready
      if (response.code === GEELARK_ERROR_CODES.APP_HIGHER_VERSION_EXISTS) {
        this.log('info', 'Instagram already installed (higher version)');
        this.transitionTo('CONFIRM_IG_INSTALLED');
        return;
      }

      // Phone not running - trigger restart
      if (response.code === GEELARK_ERROR_CODES.ENV_NOT_RUNNING) {
        throw new PhoneNotRunningError(this.job.envId);
      }

      // Other errors - throw to trigger retry
      throw new GeeLarkAPIError('installApp', response.code, response.msg);
    });
  }

  /**
   * CONFIRM_IG_INSTALLED: Try starting the app to confirm installation
   *
   * Uses the Start Application endpoint to verify Instagram is installed.
   * Error codes tell us the installation status:
   * - Success: App is installed and started, proceed to LOGIN
   * - 42005 (APP_NOT_INSTALLED_START): Still installing, wait and retry
   * - 42002 (ENV_NOT_RUNNING): Phone not running, trigger restart
   */
  private async handleConfirmIGInstalled(): Promise<void> {
    const startTime = Date.now();
    // Use a longer timeout for app installation (5 minutes)
    const installTimeout = Math.max(this.config.pollTimeoutSeconds * 1000, 300000);
    const pollInterval = this.config.pollIntervalSeconds * 1000;

    this.log('info', 'Waiting for Instagram installation to complete...');

    while (Date.now() - startTime < installTimeout) {
      if (this.abortController.signal.aborted) return;

      try {
        // Try to start Instagram app - this will fail if not installed
        const response = await this.client.startApp(this.job.envId, {
          appVersionId: this.config.igAppVersionId,
        });

        if (response.code === GEELARK_ERROR_CODES.SUCCESS) {
          // App started successfully - it's installed
          this.log('info', 'App confirmed installed and started');

          // Capture screenshot after app is ready
          await this.takeScreenshot('App Ready');

          // Check if this workflow requires login
          if (this.workflowStrategy.requiresLogin()) {
            this.transitionTo('LOGIN');
          } else {
            // Skip login for workflows that don't require it (e.g., Reddit)
            this.log('info', 'Workflow does not require login, proceeding to workflow states');
            const nextState = this.workflowStrategy.getPostLoginState(this.job);
            this.transitionTo(nextState);
          }
          return;
        }

        // App not installed (Start Application endpoint uses 42005)
        if (response.code === GEELARK_ERROR_CODES.APP_NOT_INSTALLED_START) {
          this.log('debug', 'Instagram still installing...');
        }
        // Phone not running - trigger restart
        else if (response.code === GEELARK_ERROR_CODES.ENV_NOT_RUNNING) {
          throw new PhoneNotRunningError(this.job.envId);
        }
        // Other error - log but continue polling
        else {
          this.log('debug', `startApp returned code ${response.code}: ${response.msg}`);
        }
      } catch (error) {
        if (error instanceof PhoneNotRunningError) {
          throw error;
        }
        // Log other errors but continue polling
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.log('debug', `Error starting app: ${errorMsg}`);
      }

      // Wait before next poll
      await this.sleepWithAbort(pollInterval);
    }

    // Timeout - installation took too long
    throw new TimeoutError('CONFIRM_IG_INSTALLED');
  }

  /**
   * Check if this is a Reddit workflow
   */
  private isRedditWorkflow(): boolean {
    return this.config.workflowType === 'reddit_warmup' || this.config.workflowType === 'reddit_post';
  }

  /**
   * LOGIN: Execute login RPA task
   *
   * For Instagram:
   * - If customLoginFlowId is configured, uses the custom RPA task API (for 2FA support)
   * - Otherwise uses the built-in instagramLogin endpoint
   *
   * For Reddit:
   * - REQUIRES customLoginFlowId - there is no built-in Reddit login endpoint
   * - Throws error if no custom login flow configured
   *
   * OPTIMIZATION: If phone verification shows this account is already logged in
   * (phone name = "{username} {App}"), skip the login task and verify directly.
   */
  private async handleLogin(): Promise<void> {
    const isReddit = this.isRedditWorkflow();
    const appName = isReddit ? 'Reddit' : 'Instagram';

    // Log verification status for debugging
    this.log('debug', `Verification status: ${this.job.verification?.status || 'none'}, phone name: ${this.job.verification?.phoneName || 'unknown'}`);

    // Check if phone is already logged in with the correct account
    // Matched phones have phone name "{username} {App}" matching expected account
    // The phone name is set AFTER successful login, so we can trust it
    if (this.job.verification?.status === 'matched') {
      this.log('info', `Phone already logged in as ${this.job.account?.username}, trusting phone name and skipping login`);

      // Take a screenshot to document the state, then proceed directly
      // No need to verify with warmup task - the phone name proves prior login success
      await this.takeScreenshot('Matched Phone - Skipping Login');
      this.transitionTo('RENAME_PHONE');
      return;
    }

    // Reddit requires a custom login flow - there's no built-in redditLogin endpoint
    if (isReddit && !this.config.customLoginFlowId) {
      throw new Error(
        'Reddit workflows require a custom login flow. ' +
        'Please configure a Reddit login flow in Advanced Settings → Custom Login Flow.'
      );
    }

    await this.withRetry('LOGIN', async () => {
      let response;

      // Use custom login flow if configured (required for Reddit, optional for Instagram 2FA)
      if (this.config.customLoginFlowId) {
        const has2FA = Boolean(this.job.account!.twoFactorSecret);
        this.log('info', `Using custom ${appName} login flow${has2FA ? ' with 2FA secret' : ''}`);

        // Build paramMap using the flow's expected parameter names
        const paramMap = this.buildCustomLoginParamMap();
        this.log('debug', `Custom flow params: ${JSON.stringify(Object.keys(paramMap))}`);

        response = await this.client.createCustomTask(
          this.job.envId,
          this.config.customLoginFlowId,
          {
            name: `${appName} Login ${this.job.account!.username}`,
            paramMap,
          }
        );
      } else {
        // Use built-in Instagram login (only for Instagram workflows)
        response = await this.client.instagramLogin(
          this.job.envId,
          this.job.account!.username,
          this.job.account!.password
        );
      }

      if (response.code === GEELARK_ERROR_CODES.SUCCESS) {
        this.job.tasks.loginTaskId = response.data.taskId;
        this.log('info', `${appName} login task started: ${response.data.taskId}`);
        this.transitionTo('POLL_LOGIN_TASK');
        return;
      }

      // Phone not running - trigger restart
      if (response.code === GEELARK_ERROR_CODES.ENV_NOT_RUNNING) {
        throw new PhoneNotRunningError(this.job.envId);
      }

      // App not installed - go back to confirm installation
      if (response.code === GEELARK_ERROR_CODES.APP_NOT_INSTALLED) {
        this.log('warn', `${appName} not installed, going back to confirm installation`);
        this.transitionTo('CONFIRM_IG_INSTALLED');
        return;
      }

      throw new GeeLarkAPIError(
        this.config.customLoginFlowId ? 'createCustomTask' : 'instagramLogin',
        response.code,
        response.msg
      );
    });
  }

  /**
   * POLL_LOGIN_TASK: Wait for login task to complete
   *
   * CRITICAL: Gate on task STATUS field, NOT msg field
   * Also check failDesc even on success - task may "complete" without actually logging in
   * On failure, retry by going back to LOGIN state (retry count is tracked there)
   */
  private async handlePollLoginTask(): Promise<void> {
    const taskId = this.job.tasks.loginTaskId!;
    // Login can take a while (2FA, captchas, slow network) - use 10 min minimum
    const loginTimeout = Math.max(this.config.pollTimeoutSeconds, 600);
    const result = await this.pollTask(taskId, 'login', loginTimeout);

    // Check for failure - either explicit failure status OR failDesc present on "success"
    const hasFailDesc = result.failDesc && result.failDesc.trim().length > 0;
    const isActualSuccess = isTaskSuccess(result.status) && !hasFailDesc;

    if (isActualSuccess) {
      this.log('info', 'Login task completed, verifying login state...');

      // Brief delay to let UI settle before verification
      await this.sleepWithAbort(2000);

      // Verify login by attempting to start warmup task
      // If warmup fails to start with certain errors, login didn't actually work
      // Note: For Warmup workflow, if verification succeeds and warmup is enabled,
      // the warmup task is stored for reuse in the WARMUP state
      const warmupEnabled = this.job.account?.flags.runWarmup !== false;
      const loginVerified = await this.verifyLoginSuccess(warmupEnabled);

      if (loginVerified) {
        this.log('info', 'Login verified successfully');

        // Capture screenshot after verified login
        await this.takeScreenshot('After Login (Verified)');

        // Transition to RENAME_PHONE to update phone name to "{username} Instagram"
        // After rename, handleRenamePhone will use strategy to determine workflow state
        this.transitionTo('RENAME_PHONE');
      } else {
        // Login verification failed - retry login
        this.log('warn', 'Login verification failed - login did not actually succeed');
        this.job.tasks.loginTaskId = null;
        this.transitionTo('LOGIN');
      }
    } else {
      // Task failed - log the error and retry by going back to LOGIN
      const failReason = hasFailDesc
        ? `completed with error: ${result.failDesc}`
        : `status ${result.status}: ${result.failDesc || 'unknown'}`;
      this.log('warn', `Login task failed (${failReason})`);

      // Clear the task ID so we create a new task
      this.job.tasks.loginTaskId = null;

      // Go back to LOGIN to retry (withRetry will track attempts)
      this.transitionTo('LOGIN');
    }
  }

  /**
   * RENAME_PHONE: Rename phone to match logged-in account
   *
   * After successful login verification, renames the phone to "{username} Instagram"
   * so we can identify which account is logged in on future runs.
   *
   * Important: The API docs warn not to call this while phone is starting,
   * but at this point the phone is fully running with Instagram active.
   */
  private async handleRenamePhone(): Promise<void> {
    if (!this.job.account) {
      // No account, nothing to rename to - skip and proceed
      this.log('warn', 'No account assigned, skipping phone rename');
      const nextState = this.workflowStrategy.getPostLoginState(this.job);
      this.log('info', `Transitioning to ${this.config.workflowType} workflow: ${nextState}`);
      this.transitionTo(nextState);
      return;
    }

    const expectedName = generatePhoneName(this.job.account.username);

    // Check if already named correctly (from verification)
    if (this.job.verification?.phoneName === expectedName) {
      this.log('debug', 'Phone already named correctly, skipping rename');
      const nextState = this.workflowStrategy.getPostLoginState(this.job);
      this.log('info', `Transitioning to ${this.config.workflowType} workflow: ${nextState}`);
      this.transitionTo(nextState);
      return;
    }

    await this.withRetry('RENAME_PHONE', async () => {
      this.log('info', `Renaming phone to "${expectedName}"`);

      const response = await this.client.renamePhone(this.job.envId, expectedName);

      if (response.code === GEELARK_ERROR_CODES.SUCCESS) {
        this.log('info', 'Phone renamed successfully');

        // Capture screenshot after rename
        await this.takeScreenshot('After Phone Rename');

        // Use workflow strategy to determine next state
        const nextState = this.workflowStrategy.getPostLoginState(this.job);
        this.log('info', `Transitioning to ${this.config.workflowType} workflow: ${nextState}`);
        this.transitionTo(nextState);
        return;
      }

      // Phone not running - trigger restart
      if (response.code === GEELARK_ERROR_CODES.ENV_NOT_RUNNING) {
        throw new PhoneNotRunningError(this.job.envId);
      }

      throw new GeeLarkAPIError('modifyPhone', response.code, response.msg);
    });
  }

  /**
   * Verify that login actually succeeded by starting a warmup task and confirming it runs
   *
   * IMPORTANT: We don't just check that the task was CREATED, we poll to ensure it
   * actually STARTS RUNNING. A task can be created but fail immediately if not logged in.
   *
   * When warmup is enabled, the task is started with user's configured settings
   * so it can be reused for the actual warmup phase.
   *
   * @param warmupEnabled - Whether warmup is enabled for this account
   * @returns true if login is verified, false if verification failed
   */
  private async verifyLoginSuccess(warmupEnabled: boolean): Promise<boolean> {
    try {
      // Try to start a warmup task - this requires being logged in
      // Use user's configured browseVideo if warmup enabled, otherwise minimal
      const browseVideo = warmupEnabled
        ? (this.job.account?.flags.warmupBrowseVideo ?? 5)
        : 1; // Minimal for verification only

      const response = await this.client.instagramWarmup(this.job.envId, {
        browseVideo,
      });

      if (response.code !== GEELARK_ERROR_CODES.SUCCESS) {
        // Task creation failed - check specific error codes
        this.log('debug', `Warmup verification response: code=${response.code}, msg=${response.msg}`);

        // Phone not running is a separate issue, not a login failure
        if (response.code === GEELARK_ERROR_CODES.ENV_NOT_RUNNING) {
          throw new PhoneNotRunningError(this.job.envId);
        }

        // App not installed means we need to go back to install step
        if (response.code === GEELARK_ERROR_CODES.APP_NOT_INSTALLED) {
          this.log('warn', 'Instagram not installed during verification');
          return false;
        }

        // Other errors might indicate login failure
        this.log('warn', `Verification task creation failed: ${response.msg} (code ${response.code})`);
        return false;
      }

      // Task was created - now poll to ensure it actually starts running
      // A task that was created but fails immediately means login didn't work
      const taskId = response.data.taskId;
      this.log('info', `Verifying login (task ${taskId})...`);

      const verificationTimeout = 90000; // 90 seconds to verify task starts
      const pollInterval = 3000; // Check every 3 seconds
      const startTime = Date.now();

      while (Date.now() - startTime < verificationTimeout) {
        if (this.abortController.signal.aborted) {
          return false;
        }

        const queryResponse = await this.client.queryTask(taskId);

        if (queryResponse.code !== GEELARK_ERROR_CODES.SUCCESS) {
          this.log('warn', `Task query failed during verification: ${queryResponse.msg}`);
          await this.sleepWithAbort(pollInterval);
          continue;
        }

        const taskItem = queryResponse.data?.items?.[0];
        if (!taskItem) {
          this.log('warn', `Task ${taskId} not found in query response`);
          await this.sleepWithAbort(pollInterval);
          continue;
        }

        const status = taskItem.status;

        // Task is IN_PROGRESS (2) - login verified! The verification task is actually running
        if (status === TASK_STATUS.IN_PROGRESS) {
          this.log('info', 'Login verified - account is logged in');
          if (warmupEnabled) {
            // Store the task ID since we'll use this for actual warmup
            this.job.tasks.warmupTaskId = taskId;
          }
          return true;
        }

        // Task COMPLETED (3) - login verified (task finished quickly, which is fine)
        if (status === TASK_STATUS.COMPLETED) {
          // Check for failDesc even on "completed" status
          const hasFailDesc = taskItem.failDesc && taskItem.failDesc.trim().length > 0;
          if (!hasFailDesc) {
            this.log('info', 'Login verified - account is logged in');
            if (warmupEnabled) {
              this.job.tasks.warmupTaskId = taskId;
            }
            return true;
          }
          // Task completed with error - login failed
          this.log('warn', `Warmup completed with error: ${taskItem.failDesc}`);
          return false;
        }

        // Task FAILED (4) or CANCELLED (7) - login verification failed
        if (status === TASK_STATUS.FAILED || status === TASK_STATUS.CANCELLED) {
          const failReason = taskItem.failDesc || 'unknown reason';
          this.log('warn', `Login verification failed - warmup task failed: ${failReason}`);
          return false;
        }

        // Task still WAITING (1) - keep polling
        this.log('debug', `Login verification task status: ${status} (waiting to confirm login)`);
        await this.sleepWithAbort(pollInterval);
      }

      // Timeout - task never started running, could indicate login issue
      this.log('warn', 'Login verification timeout - warmup task did not start within 90s');
      return false;
    } catch (error) {
      if (error instanceof PhoneNotRunningError) {
        throw error; // Re-throw to trigger phone restart
      }
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log('warn', `Login verification error: ${errorMsg}`);
      return false;
    }
  }

  // ==================== Task Polling with Screenshots ====================

  /**
   * Poll a task with periodic screenshots
   *
   * Takes a screenshot every 60 seconds during the task to show progress.
   * Useful for long-running tasks like warmup that involve several minutes of activity.
   *
   * @param taskId - The task ID to poll
   * @param taskType - Type of task for UI display
   * @param stepLabel - Label prefix for screenshots (e.g., "Warmup Progress")
   */
  private async pollTaskWithScreenshots(
    taskId: string,
    taskType: 'login' | 'warmup' | 'publish' | 'setup',
    stepLabel: string
  ): Promise<{ status: number; failDesc?: string }> {
    const startTime = Date.now();
    // Long-running tasks (like warmup) can take 5+ minutes, use 10 min timeout
    const timeout = Math.max(this.config.pollTimeoutSeconds, 600) * 1000;
    const screenshotInterval = 60000; // Take screenshot every 60 seconds
    let lastScreenshotTime = 0;
    let screenshotCount = 0;

    // Set current task type for UI
    this.job.currentTaskType = taskType;
    this.job.currentTaskStatus = TASK_STATUS.WAITING as 1 | 2 | 3 | 4 | 7;
    this.emitUpdate();

    while (Date.now() - startTime < timeout) {
      if (this.abortController.signal.aborted) {
        this.job.currentTaskStatus = TASK_STATUS.CANCELLED as 7;
        this.emitUpdate();
        return { status: TASK_STATUS.CANCELLED };
      }

      const response = await this.client.queryTask(taskId);

      if (response.code !== GEELARK_ERROR_CODES.SUCCESS) {
        throw new GeeLarkAPIError('queryTask', response.code, response.msg);
      }

      const taskItem = response.data?.items?.[0];
      if (!taskItem) {
        throw new Error(`Task ${taskId} not found in query response`);
      }

      const status = taskItem.status;

      // Update task status for UI
      this.job.currentTaskStatus = status as 1 | 2 | 3 | 4 | 7;
      this.emitUpdate();

      // Check if task is complete
      if (isTerminalTaskStatus(status)) {
        return {
          status,
          failDesc: taskItem.failDesc,
        };
      }

      // Take periodic screenshot (every 60 seconds)
      const timeSinceLastScreenshot = Date.now() - lastScreenshotTime;
      if (timeSinceLastScreenshot >= screenshotInterval) {
        screenshotCount++;
        // Don't await - take screenshot in background to not slow down polling
        this.takeScreenshot(`${stepLabel} ${screenshotCount}`).catch(() => {});
        lastScreenshotTime = Date.now();
        this.log('debug', `${stepLabel} screenshot ${screenshotCount}`);
      }

      this.log('debug', `${taskType} task status: ${status}`);
      await this.sleepWithAbort(this.config.pollIntervalSeconds * 1000);
    }

    throw new TimeoutError(`POLL_${taskType.toUpperCase()}_TASK` as PhoneState);
  }

  // ==================== Task Polling ====================

  /**
   * Poll a task until terminal state
   *
   * CRITICAL: Gate on status field, NOT msg field
   * Updates currentTaskStatus and emits updates for UI
   *
   * Features:
   * - Progressive polling intervals (faster at start, slower for long tasks)
   * - Retries on transient API errors
   * - Detailed logging with elapsed time
   *
   * @param taskId - The task ID to poll
   * @param taskType - Type of task (login, warmup, publish, setup)
   * @param timeoutSeconds - Optional timeout override (default: config.pollTimeoutSeconds)
   */
  private async pollTask(
    taskId: string,
    taskType: 'login' | 'warmup' | 'publish' | 'setup',
    timeoutSeconds?: number
  ): Promise<{ status: number; failDesc?: string }> {
    const startTime = Date.now();
    const timeout = (timeoutSeconds ?? this.config.pollTimeoutSeconds) * 1000;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 3;

    // Set current task type for UI
    this.job.currentTaskType = taskType;
    this.job.currentTaskStatus = TASK_STATUS.WAITING as 1 | 2 | 3 | 4 | 7;
    this.emitUpdate();

    this.log('info', `Polling ${taskType} task ${taskId}...`);

    while (Date.now() - startTime < timeout) {
      if (this.abortController.signal.aborted) {
        this.job.currentTaskStatus = TASK_STATUS.CANCELLED as 7;
        this.emitUpdate();
        return { status: TASK_STATUS.CANCELLED };
      }

      try {
        const response = await this.client.queryTask(taskId);

        if (response.code !== GEELARK_ERROR_CODES.SUCCESS) {
          consecutiveErrors++;
          this.log('warn', `Task query failed (attempt ${consecutiveErrors}): code=${response.code} msg=${response.msg}`);

          if (consecutiveErrors >= maxConsecutiveErrors) {
            throw new GeeLarkAPIError('queryTask', response.code, response.msg);
          }

          // Wait before retrying
          await this.sleepWithAbort(5000);
          continue;
        }

        // Reset error counter on success
        consecutiveErrors = 0;

        const taskItem = response.data?.items?.[0];
        if (!taskItem) {
          this.log('warn', `Task ${taskId} not found in query response, retrying...`);
          await this.sleepWithAbort(5000);
          continue;
        }

        // IMPORTANT: Check status field, NOT msg
        const status = taskItem.status;

        // Update task status for UI
        this.job.currentTaskStatus = status as 1 | 2 | 3 | 4 | 7;
        this.emitUpdate();

        if (isTerminalTaskStatus(status)) {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          const costInfo = taskItem.cost ? ` (GeeLark cost: ${taskItem.cost}s)` : '';

          if (status === TASK_STATUS.COMPLETED) {
            this.log('info', `${taskType} task completed successfully in ${elapsed}s${costInfo}`);
          } else {
            this.log('warn', `${taskType} task failed in ${elapsed}s: ${taskItem.failDesc || 'Unknown error'}${costInfo}`);
          }

          return {
            status,
            failDesc: taskItem.failDesc,
          };
        }

        // Log progress periodically (every 30 seconds)
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        if (elapsed > 0 && elapsed % 30 === 0) {
          this.log('debug', `${taskType} task still executing... (${elapsed}s elapsed)`);
        }

      } catch (error) {
        // Handle network/transient errors
        if (error instanceof GeeLarkAPIError) {
          throw error; // Already handled above
        }

        consecutiveErrors++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.log('warn', `Task query error (attempt ${consecutiveErrors}): ${errorMsg}`);

        if (consecutiveErrors >= maxConsecutiveErrors) {
          throw error;
        }

        await this.sleepWithAbort(5000);
        continue;
      }

      // Progressive polling intervals:
      // - First 30s: poll every 5s (fast feedback)
      // - 30s-2min: poll every 10s
      // - 2min+: poll every 15s (long-running tasks like video publish)
      const elapsed = Date.now() - startTime;
      let pollInterval: number;
      if (elapsed < 30000) {
        pollInterval = 5000;
      } else if (elapsed < 120000) {
        pollInterval = 10000;
      } else {
        pollInterval = 15000;
      }

      await this.sleepWithAbort(pollInterval);
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    this.log('error', `${taskType} task timed out after ${elapsed}s`);
    throw new TimeoutError(`POLL_${taskType.toUpperCase()}_TASK` as PhoneState);
  }

  // ==================== Retry Logic ====================

  /**
   * Execute an operation with retry and exponential backoff
   *
   * Retries are per-phone, per-stage - never loops entire batch
   */
  private async withRetry(
    stateName: RetryableState,
    operation: () => Promise<void>
  ): Promise<void> {
    const attempts = (this.job.attempts[stateName] || 0) + 1;
    this.job.attempts[stateName] = attempts;

    if (attempts > this.config.maxRetriesPerStage) {
      throw new MaxRetriesExceededError(stateName, attempts - 1);
    }

    if (attempts > 1) {
      const backoffMs = calculateBackoff(
        attempts - 1,
        this.config.baseBackoffSeconds
      );
      this.log(
        'debug',
        `Retry ${attempts - 1}/${this.config.maxRetriesPerStage}, backoff ${Math.round(backoffMs / 1000)}s`
      );
      await this.sleepWithAbort(backoffMs);
    }

    try {
      await operation();
    } catch (error) {
      // Re-throw to trigger retry at next iteration
      throw error;
    }
  }

  // ==================== Error Handling ====================

  private async handleError(error: unknown): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    // Check for permanent failures that should not be retried
    if (error instanceof NoAccountMatchedError) {
      await this.transitionToFailed(errorMessage);
      return;
    }

    if (error instanceof MaxRetriesExceededError) {
      await this.transitionToFailed(errorMessage);
      return;
    }

    if (error instanceof TaskFailedError) {
      // Task failures may indicate permanent issues (bad credentials, etc.)
      await this.transitionToFailed(errorMessage);
      return;
    }

    // Phone not running - restart the phone
    if (error instanceof PhoneNotRunningError) {
      this.log('warn', 'Phone not running, restarting...');
      this.transitionTo('START_ENV');
      return;
    }

    // Rate limited - wait and retry
    if (error instanceof RateLimitedError) {
      this.log('warn', `Rate limited, waiting ${error.delaySeconds}s...`);
      await this.sleepWithAbort(error.delaySeconds * 1000);
      // Don't transition, just let the retry logic continue
      return;
    }

    // Check for rate limit error codes in API errors
    if (error instanceof GeeLarkAPIError) {
      // 40007 = Rate limited (resets next minute)
      if (error.code === GEELARK_ERROR_CODES.RATE_LIMITED) {
        this.log('warn', 'Rate limited (40007), waiting 60s...');
        await this.sleepWithAbort(60000);
        return;
      }
      // 47002 = Too many concurrent requests (lifted after 2 hours)
      if (error.code === GEELARK_ERROR_CODES.TOO_MANY_CONCURRENT) {
        this.log('warn', 'Too many concurrent requests (47002), waiting 120s...');
        await this.sleepWithAbort(120000);
        return;
      }
    }

    // For other errors, log and let the retry logic handle it
    this.log('warn', `Error: ${errorMessage}`);

    // Check if current state is retryable
    // Shared retryable states + workflow-specific retryable states
    const sharedRetryableStates: RetryableState[] = [
      'START_ENV',
      'CONFIRM_ENV_RUNNING',
      'INSTALL_IG',
      'CONFIRM_IG_INSTALLED',
      'LOGIN',
    ];
    const workflowRetryableStates = this.workflowStrategy.getRetryableStates();
    const allRetryableStates = [...sharedRetryableStates, ...workflowRetryableStates];

    if (!allRetryableStates.includes(this.job.state as RetryableState)) {
      await this.transitionToFailed(errorMessage);
    }
    // Otherwise, the next iteration will retry the current state
  }

  // ==================== Utilities ====================

  private async sleepWithAbort(ms: number): Promise<void> {
    try {
      await sleepWithAbort(ms, this.abortController.signal);
    } catch {
      // Aborted, ignore
    }
  }

  private log(
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string
  ): void {
    const entry = createLogEntry(level, message, {
      phoneId: this.job.envId,
      phoneName: this.job.serialName,
      state: this.job.state,
    });

    workflowStore.addLog(entry);
    workflowEmitter.emitLog(entry);
  }

  private emitUpdate(): void {
    workflowStore.setPhone(this.job);
    workflowEmitter.emitPhoneUpdate(this.job);
  }

  // ==================== Screenshot ====================

  /**
   * Take a screenshot and add it to the job's screenshots array
   *
   * Waits a few seconds before capturing to ensure the screen has loaded.
   *
   * @param stepName - Human-readable name for the step (e.g., "After Login")
   * @returns true if screenshot was captured successfully, false otherwise
   */
  private async takeScreenshot(stepName: string): Promise<boolean> {
    try {
      // Wait a few seconds to ensure the screen has loaded the current state
      await this.sleepWithAbort(3000);

      if (this.abortController.signal.aborted) return false;

      this.log('debug', `Taking screenshot: ${stepName}`);

      // Request screenshot
      const requestResponse = await this.client.requestScreenshot(this.job.envId);

      if (requestResponse.code !== GEELARK_ERROR_CODES.SUCCESS) {
        this.log('debug', `Screenshot request failed: ${requestResponse.msg}`);
        return false;
      }

      const taskId = requestResponse.data.taskId;

      // Poll for result (with shorter timeout than normal tasks)
      const startTime = Date.now();
      const timeout = 30000; // 30 seconds max for screenshot
      const pollInterval = 2000; // Poll every 2 seconds

      while (Date.now() - startTime < timeout) {
        if (this.abortController.signal.aborted) return false;

        const resultResponse = await this.client.getScreenshotResult(taskId);

        if (resultResponse.code !== GEELARK_ERROR_CODES.SUCCESS) {
          this.log('debug', `Screenshot result query failed: ${resultResponse.msg}`);
          return false;
        }

        const status = resultResponse.data.status;

        // Screenshot succeeded
        if (status === SCREENSHOT_STATUS.SUCCEEDED && resultResponse.data.downloadLink) {
          this.job.screenshots.push({
            step: stepName,
            url: resultResponse.data.downloadLink,
            capturedAt: Date.now(),
          });
          this.log('debug', `Screenshot captured: ${stepName}`);
          this.emitUpdate();
          return true;
        }

        // Screenshot failed
        if (status === SCREENSHOT_STATUS.ACQUISITION_FAILED || status === SCREENSHOT_STATUS.EXECUTION_FAILED) {
          this.log('debug', `Screenshot failed (status ${status})`);
          return false;
        }

        // Still in progress, wait and retry
        await this.sleepWithAbort(pollInterval);
      }

      this.log('debug', 'Screenshot timeout');
      return false;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log('debug', `Screenshot error: ${errorMsg}`);
      return false;
    }
  }

  // ==================== Custom Flow Parameter Mapping ====================

  /**
   * Build paramMap for custom login flow based on flow's expected parameter names
   *
   * Maps our known fields (username, password, twoFactorSecret) to the flow's
   * expected parameter names using pattern matching.
   *
   * Expected patterns:
   * - account/user/username → maps to account username
   * - password/pass → maps to account password
   * - auth/2fa/totp/secret/code → maps to 2FA secret
   * - pubdate/date → maps to current date (YYYY-MM-DD format)
   */
  private buildCustomLoginParamMap(): Record<string, string> {
    const paramMap: Record<string, string> = {};
    const flowParams = this.config.customLoginFlowParams || [];

    // If no custom params defined, use defaults
    if (flowParams.length === 0) {
      paramMap.account = this.job.account!.username;
      paramMap.password = this.job.account!.password;
      if (this.job.account!.twoFactorSecret) {
        paramMap.twoFactorSecret = this.job.account!.twoFactorSecret;
      }
      return paramMap;
    }

    // Map each flow parameter to our known fields
    for (const param of flowParams) {
      const paramLower = param.toLowerCase();

      // Account/username patterns
      if (paramLower === 'account' || paramLower === 'user' || paramLower === 'username' ||
          paramLower === 'email' || paramLower === 'login') {
        paramMap[param] = this.job.account!.username;
      }
      // Password patterns
      else if (paramLower === 'password' || paramLower === 'pass' || paramLower === 'pwd') {
        paramMap[param] = this.job.account!.password;
      }
      // 2FA/auth patterns
      else if (paramLower === 'auth' || paramLower === '2fa' || paramLower === 'totp' ||
               paramLower === 'secret' || paramLower === 'code' || paramLower === 'twofactorsecret' ||
               paramLower === '2fasecret' || paramLower === 'authcode' || paramLower === 'otp') {
        // Use 2FA secret if available, otherwise empty string
        paramMap[param] = this.job.account!.twoFactorSecret || '';
      }
      // Date patterns (PubDate, Date, etc.) - use current date
      else if (paramLower === 'pubdate' || paramLower === 'date' || paramLower === 'publishdate') {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        paramMap[param] = `${yyyy}-${mm}-${dd}`;
      }
      // Unknown parameter - log warning and skip
      else {
        this.log('warn', `Unknown custom flow parameter: ${param} - skipping`);
      }
    }

    return paramMap;
  }
}
