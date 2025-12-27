import { GeeLarkClient } from '@/lib/geelark/client';
import { GEELARK_ERROR_CODES, SCREENSHOT_STATUS, GeeLarkPhone } from '@/lib/geelark/types';
import { createPhoneJobs, sortPhonesBySerialName } from '@/lib/utils/sorting';
import {
  verifyPhones,
  createPhoneAssignment,
  reassignToBackups,
  logVerificationSummary,
} from '@/lib/utils/phone-verification';
import { deleteByUrls } from '@/lib/storage/spaces';
import { workflowEmitter, createLogEntry } from '@/lib/events/emitter';
import { workflowStore } from './store';
import { PhoneStateMachine } from './machine';
import {
  PhoneJob,
  WorkflowConfig,
  WorkflowStatus,
  PhoneVerificationResult,
  AccountData,
  getTotalSteps,
} from './types';
import { sleep } from '@/lib/utils/backoff';

// DigitalOcean Spaces URL prefix for detecting uploaded media
const SPACES_URL_PREFIX = 'https://glbot-media-public.nyc3.digitaloceanspaces.com/';

/**
 * Workflow orchestrator that manages multiple phone state machines
 * with concurrency control.
 *
 * Key features:
 * - Processes phones with configurable concurrency limit
 * - Each phone runs independently in its own state machine
 * - Failed phones are tracked, not retried at batch level
 * - Supports graceful stop (aborts all active jobs)
 */
export class WorkflowOrchestrator {
  private config: WorkflowConfig;
  private client: GeeLarkClient;
  private activeJobs: Map<string, PhoneStateMachine> = new Map();
  private queue: string[] = [];
  private isRunning: boolean = false;
  private isStopping: boolean = false;
  private runPromise: Promise<void> | null = null;

  constructor(config: WorkflowConfig, client?: GeeLarkClient) {
    this.config = config;
    // Create client with token from config
    this.client = client || new GeeLarkClient(config.apiToken);
  }

  /**
   * Start the workflow
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Workflow is already running');
    }

    this.isRunning = true;
    this.isStopping = false;
    workflowStore.reset();
    workflowStore.setStatus('running');
    workflowStore.setConfig(this.config as unknown as Record<string, unknown>);
    workflowEmitter.emitWorkflowStatus('running');

    this.log('info', 'Workflow started');
    this.log('info', `Config: concurrency=${this.config.concurrencyLimit}, maxRetries=${this.config.maxRetriesPerStage}`);

    try {
      // 1. Fetch phones from GeeLark
      this.log('info', `Fetching phones from group: ${this.config.groupName}`);
      const phones = await this.client.listAllPhones(
        this.config.groupName,
        100
      );
      this.log('info', `Found ${phones.length} phones`);

      if (phones.length === 0) {
        this.log('error', 'No phones found in group');
        workflowStore.setStatus('completed');
        workflowEmitter.emitWorkflowStatus('completed');
        return;
      }

      // 2. Verify phones against expected accounts
      this.log('info', 'Verifying phone-account assignments...');
      const verificationResults = verifyPhones(phones, this.config.sheetRows);
      const assignment = createPhoneAssignment(verificationResults);

      // 3. Handle mismatches with backup phones
      const { finalAssignment, reassignments, unassignedAccounts } =
        reassignToBackups(assignment);

      // Log verification summary
      logVerificationSummary(
        assignment,
        reassignments,
        unassignedAccounts,
        (level, message) => this.log(level, message)
      );

      // 4. Handle mismatched phones - capture screenshots and stop them
      if (assignment.mismatchedPhones.length > 0) {
        await this.handleMismatchedPhones(assignment.mismatchedPhones);
      }

      // 5. Create phone jobs from final assignment
      const jobs = this.createJobsFromAssignment(
        finalAssignment.matchedPhones,
        reassignments
      );

      // Log account data for debugging sister workflow issues
      for (const job of jobs) {
        const setup = job.account?.setup;
        this.log('debug', `Account data for ${job.serialName}: username=${job.account?.username}, setup=${JSON.stringify(setup || {})}`);
      }

      if (jobs.length === 0) {
        this.log('error', 'No phones available to process');
        workflowStore.setStatus('completed');
        workflowEmitter.emitWorkflowStatus('completed');
        return;
      }

      workflowStore.setPhones(jobs);

      // Track uploaded media for cleanup after workflow ends
      this.trackUploadedMedia(this.config.sheetRows);

      // Log processing info
      this.log('info', `Processing ${jobs.length} phones`);

      // Emit initial state for all phones
      for (const job of jobs) {
        workflowEmitter.emitPhoneUpdate(job);
      }

      // 6. Initialize queue with all phone IDs
      this.queue = jobs.map((j) => j.envId);

      // 7. Process queue
      await this.processQueue();

      // 8. Complete
      if (!this.isStopping) {
        // Clean up uploaded media from Spaces
        await this.cleanupUploadedMedia();

        workflowStore.setStatus('completed');
        workflowEmitter.emitWorkflowStatus('completed');
        this.emitResults();
        this.log('info', 'Workflow completed');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.log('error', `Workflow error: ${errorMessage}`);

      // Clean up uploaded media on error
      await this.cleanupUploadedMedia();

      workflowStore.setStatus('stopped');
      workflowEmitter.emitWorkflowStatus('stopped', errorMessage);
    } finally {
      this.isRunning = false;
      this.runPromise = null;
    }
  }

  /**
   * Handle mismatched phones - capture screenshots for manual review, then stop them
   */
  private async handleMismatchedPhones(
    mismatchedPhones: PhoneVerificationResult[]
  ): Promise<void> {
    if (mismatchedPhones.length === 0) return;

    this.log(
      'info',
      `Handling ${mismatchedPhones.length} mismatched phones...`
    );

    // Start phones briefly to capture screenshots
    const phoneIds = mismatchedPhones.map((p) => p.envId);

    try {
      this.log('info', 'Starting mismatched phones for screenshots...');
      await this.client.startPhones(phoneIds);

      // Wait for phones to start (30 seconds)
      await sleep(30000);

      // Capture screenshots in parallel
      this.log('info', 'Capturing screenshots of mismatched phones...');
      const screenshotPromises = mismatchedPhones.map((phone) =>
        this.capturePhoneScreenshot(phone)
      );
      const screenshots = await Promise.all(screenshotPromises);

      // Log screenshots captured
      const validScreenshots = screenshots.filter(Boolean);
      this.log('info', `Captured ${validScreenshots.length} screenshots`);

      // Stop mismatched phones
      this.log('info', 'Stopping mismatched phones...');
      await this.client.stopPhones(phoneIds);
      this.log('info', 'Mismatched phones stopped');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.log('warn', `Error handling mismatched phones: ${errorMessage}`);

      // Try to stop phones even if screenshot failed
      try {
        await this.client.stopPhones(phoneIds);
      } catch {
        // Ignore stop errors
      }
    }
  }

  /**
   * Capture a screenshot of a phone for manual verification
   */
  private async capturePhoneScreenshot(
    phone: PhoneVerificationResult
  ): Promise<{ url: string; phone: PhoneVerificationResult } | null> {
    try {
      const requestResponse = await this.client.requestScreenshot(phone.envId);
      if (requestResponse.code !== GEELARK_ERROR_CODES.SUCCESS) {
        this.log(
          'debug',
          `Screenshot request failed for ${phone.serialName}: ${requestResponse.msg}`
        );
        return null;
      }

      const taskId = requestResponse.data.taskId;

      // Poll for result (max 30 seconds)
      for (let i = 0; i < 15; i++) {
        await sleep(2000);

        const resultResponse = await this.client.getScreenshotResult(taskId);
        if (
          resultResponse.code === GEELARK_ERROR_CODES.SUCCESS &&
          resultResponse.data.status === SCREENSHOT_STATUS.SUCCEEDED &&
          resultResponse.data.downloadLink
        ) {
          this.log(
            'info',
            `Screenshot captured for ${phone.serialName}: ${phone.mismatchReason}`
          );
          return { url: resultResponse.data.downloadLink, phone };
        }

        if (
          resultResponse.data.status === SCREENSHOT_STATUS.ACQUISITION_FAILED ||
          resultResponse.data.status === SCREENSHOT_STATUS.EXECUTION_FAILED
        ) {
          this.log(
            'debug',
            `Screenshot failed for ${phone.serialName} (status ${resultResponse.data.status})`
          );
          return null;
        }
      }

      this.log('debug', `Screenshot timeout for ${phone.serialName}`);
      return null;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.log(
        'debug',
        `Screenshot error for ${phone.serialName}: ${errorMessage}`
      );
      return null;
    }
  }

  /**
   * Create PhoneJob objects from verified phone assignments
   */
  private createJobsFromAssignment(
    matchedPhones: PhoneVerificationResult[],
    reassignments: Array<{
      backup: PhoneVerificationResult;
      account: AccountData;
    }>
  ): PhoneJob[] {
    const now = Date.now();
    const jobs: PhoneJob[] = [];

    // Track which phones were reassigned
    const reassignedEnvIds = new Set(reassignments.map((r) => r.backup.envId));

    for (const result of matchedPhones) {
      if (!result.expectedAccount) continue;

      const isBackup = reassignedEnvIds.has(result.envId);

      const job: PhoneJob = {
        envId: result.envId,
        serialName: result.serialName,
        phone_index: result.expectedAccount.row_number,
        account: result.expectedAccount,
        state: 'IDLE',
        attempts: {},
        tasks: {
          loginTaskId: null,
          warmupTaskId: null,
          post1TaskId: null,
          post2TaskId: null,
          profilePictureTaskId: null,
          bioTaskId: null,
          setupPost1TaskId: null,
          setupPost2TaskId: null,
          storyHighlightTaskId: null,
          setPrivateTaskId: null,
          enable2FATaskId: null,
          renameUsernameTaskId: null,
          editDisplayNameTaskId: null,
          redditWarmupTaskId: null,
          redditPostTaskId: null,
        },
        currentTaskStatus: null,
        currentTaskType: null,
        screenshots: [],
        lastError: null,
        timestamps: {
          startedAt: now,
          updatedAt: now,
          stateEnteredAt: now,
        },
        progress: {
          currentStep: 0,
          totalSteps: getTotalSteps(this.config.workflowType),
        },
        verification: result,
        isBackupPhone: isBackup,
      };

      jobs.push(job);
    }

    return jobs;
  }

  /**
   * Stop the workflow gracefully
   *
   * Also stops all cloud phones that are being processed
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.log('info', 'Stopping workflow...');
    this.isStopping = true;
    workflowStore.setStatus('stopping');
    workflowEmitter.emitWorkflowStatus('stopping');

    // Abort all active jobs
    for (const machine of this.activeJobs.values()) {
      machine.abort();
    }

    // Wait for all active jobs to complete
    await Promise.all(
      Array.from(this.activeJobs.values()).map((m) => m.waitForCompletion())
    );

    // Stop all cloud phones that were being processed
    await this.stopAllPhones();

    // Clean up uploaded media from Spaces
    await this.cleanupUploadedMedia();

    this.activeJobs.clear();
    this.queue = [];

    workflowStore.setStatus('stopped');
    workflowEmitter.emitWorkflowStatus('stopped');
    this.emitResults();
    this.log('info', 'Workflow stopped');
    this.isRunning = false;
  }

  /**
   * Clean up uploaded media files from DigitalOcean Spaces
   */
  private async cleanupUploadedMedia(): Promise<void> {
    const urls = workflowStore.getUploadedMediaUrls();
    if (urls.length === 0) {
      return;
    }

    this.log('info', `Cleaning up ${urls.length} uploaded media file(s)...`);

    try {
      await deleteByUrls(urls);
      workflowStore.clearUploadedMediaUrls();
      this.log('info', 'Media cleanup complete');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('warn', `Error cleaning up media: ${errorMessage}`);
    }
  }

  /**
   * Extract and track media URLs from accounts for cleanup
   */
  private trackUploadedMedia(accounts: AccountData[]): void {
    const urls: string[] = [];

    for (const account of accounts) {
      // Check posts
      if (account.posts) {
        for (const post of account.posts) {
          for (const url of post.mediaUrls) {
            if (url.startsWith(SPACES_URL_PREFIX)) {
              urls.push(url);
            }
          }
        }
      }

      // Check setup fields
      if (account.setup) {
        if (account.setup.profilePictureUrl?.startsWith(SPACES_URL_PREFIX)) {
          urls.push(account.setup.profilePictureUrl);
        }
        if (account.setup.highlightCoverUrl?.startsWith(SPACES_URL_PREFIX)) {
          urls.push(account.setup.highlightCoverUrl);
        }
        if (account.setup.post1) {
          for (const url of account.setup.post1.mediaUrls) {
            if (url.startsWith(SPACES_URL_PREFIX)) {
              urls.push(url);
            }
          }
        }
        if (account.setup.post2) {
          for (const url of account.setup.post2.mediaUrls) {
            if (url.startsWith(SPACES_URL_PREFIX)) {
              urls.push(url);
            }
          }
        }
      }
    }

    if (urls.length > 0) {
      workflowStore.addUploadedMediaUrls(urls);
      this.log('info', `Tracking ${urls.length} uploaded media file(s) for cleanup`);
    }
  }

  /**
   * Stop all cloud phones that were being processed
   */
  private async stopAllPhones(): Promise<void> {
    const phones = workflowStore.getPhonesArray();
    if (phones.length === 0) {
      return;
    }

    // Get all phone IDs that were in active states (not IDLE, DONE, or FAILED at start)
    const phoneIds = phones
      .filter((p) => p.state !== 'IDLE') // Only stop phones that were started
      .map((p) => p.envId);

    if (phoneIds.length === 0) {
      this.log('info', 'No phones to stop');
      return;
    }

    this.log('info', `Stopping ${phoneIds.length} cloud phone(s)...`);

    try {
      // Stop phones in batches of 100 (API limit)
      for (let i = 0; i < phoneIds.length; i += 100) {
        const batch = phoneIds.slice(i, i + 100);
        const response = await this.client.stopPhones(batch);

        if (response.code === 0) {
          this.log('info', `Stopped ${batch.length} phone(s)`);
        } else {
          this.log('warn', `Failed to stop phones: ${response.msg}`);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('warn', `Error stopping phones: ${errorMessage}`);
    }
  }

  /**
   * Get current status
   */
  getStatus(): WorkflowStatus {
    return workflowStore.getStatus();
  }

  /**
   * Check if running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  // ==================== Queue Processing ====================

  /**
   * Process the queue with concurrency control
   */
  private async processQueue(): Promise<void> {
    while (
      (this.queue.length > 0 || this.activeJobs.size > 0) &&
      !this.isStopping
    ) {
      // Fill up to concurrency limit
      while (
        this.activeJobs.size < this.config.concurrencyLimit &&
        this.queue.length > 0 &&
        !this.isStopping
      ) {
        const envId = this.queue.shift()!;
        this.startPhoneJob(envId);
      }

      // Wait for at least one job to complete
      if (this.activeJobs.size > 0) {
        await this.waitForAnyCompletion();
      }

      // Clean up completed jobs
      this.cleanupCompletedJobs();
    }
  }

  /**
   * Start processing a phone job
   */
  private startPhoneJob(envId: string): void {
    const job = workflowStore.getPhone(envId);
    if (!job) {
      this.log('warn', `Phone ${envId} not found in store`);
      return;
    }

    this.log('debug', `Starting job for ${job.serialName}`);

    const machine = new PhoneStateMachine(job, this.config, this.client);
    this.activeJobs.set(envId, machine);

    // Run asynchronously - don't await
    machine
      .run()
      .then((completedJob) => {
        workflowStore.setPhone(completedJob);
        this.log(
          'debug',
          `Job completed for ${completedJob.serialName}: ${completedJob.state}`
        );
      })
      .catch((error) => {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.log('error', `Job failed for ${job.serialName}: ${errorMessage}`);

        // Update job with error
        const updatedJob = workflowStore.getPhone(envId);
        if (updatedJob) {
          updatedJob.state = 'FAILED';
          updatedJob.lastError = errorMessage;
          workflowStore.setPhone(updatedJob);
          workflowEmitter.emitPhoneUpdate(updatedJob);
        }
      });
  }

  /**
   * Wait for any active job to complete
   */
  private async waitForAnyCompletion(): Promise<void> {
    if (this.activeJobs.size === 0) return;

    await Promise.race(
      Array.from(this.activeJobs.values()).map((m) => m.waitForCompletion())
    );
  }

  /**
   * Remove completed jobs from active set
   */
  private cleanupCompletedJobs(): void {
    for (const [envId, machine] of this.activeJobs) {
      if (machine.isCompleted()) {
        this.activeJobs.delete(envId);
      }
    }
  }

  // ==================== Utilities ====================

  private log(level: 'info' | 'warn' | 'error' | 'debug', message: string): void {
    const entry = createLogEntry(level, `[Orchestrator] ${message}`);
    workflowStore.addLog(entry);
    workflowEmitter.emitLog(entry);
  }

  private emitResults(): void {
    const results = workflowStore.getResultsSummary();
    workflowEmitter.emitResults(results);
  }
}

// ==================== Singleton Management ====================

// Use globalThis to persist singleton across Next.js module reloads in development
const globalForOrchestrator = globalThis as unknown as {
  orchestratorInstance: WorkflowOrchestrator | null;
};

// Initialize if not exists
if (globalForOrchestrator.orchestratorInstance === undefined) {
  globalForOrchestrator.orchestratorInstance = null;
}

/**
 * Get or create orchestrator instance
 */
export function getOrchestrator(config?: WorkflowConfig): WorkflowOrchestrator {
  if (!globalForOrchestrator.orchestratorInstance && config) {
    globalForOrchestrator.orchestratorInstance = new WorkflowOrchestrator(config);
  }
  if (!globalForOrchestrator.orchestratorInstance) {
    throw new Error('Orchestrator not initialized. Provide config first.');
  }
  return globalForOrchestrator.orchestratorInstance;
}

/**
 * Create new orchestrator instance (replaces existing)
 */
export function createOrchestrator(config: WorkflowConfig): WorkflowOrchestrator {
  globalForOrchestrator.orchestratorInstance = new WorkflowOrchestrator(config);
  return globalForOrchestrator.orchestratorInstance;
}

/**
 * Clear orchestrator instance
 */
export function clearOrchestrator(): void {
  globalForOrchestrator.orchestratorInstance = null;
}

/**
 * Check if orchestrator exists and is running
 */
export function isOrchestratorRunning(): boolean {
  return globalForOrchestrator.orchestratorInstance?.getIsRunning() ?? false;
}
