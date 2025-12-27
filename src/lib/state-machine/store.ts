import {
  PhoneJob,
  LogEntry,
  WorkflowStatus,
  ResultsSummary,
} from './types';

// Use globalThis to persist singleton across Next.js module reloads in development
const globalForStore = globalThis as unknown as {
  workflowStore: WorkflowStore | undefined;
};

/**
 * In-memory workflow state store
 *
 * Uses singleton pattern to ensure consistent state across API routes.
 * State is not persisted - resets on server restart.
 */
class WorkflowStore {

  private phones: Map<string, PhoneJob> = new Map();
  private logs: LogEntry[] = [];
  private status: WorkflowStatus = 'idle';
  private startedAt: number | null = null;
  private completedAt: number | null = null;
  private config: Record<string, unknown> | null = null;
  private uploadedMediaUrls: Set<string> = new Set();

  constructor() {}

  /**
   * Reset all state
   */
  reset(): void {
    this.phones.clear();
    this.logs = [];
    this.status = 'idle';
    this.startedAt = null;
    this.completedAt = null;
    this.config = null;
    this.uploadedMediaUrls.clear();
  }

  // ==================== Phone Management ====================

  /**
   * Set or update a phone job
   */
  setPhone(job: PhoneJob): void {
    this.phones.set(job.envId, { ...job });
  }

  /**
   * Get a phone job by envId
   */
  getPhone(envId: string): PhoneJob | undefined {
    const phone = this.phones.get(envId);
    return phone ? { ...phone } : undefined;
  }

  /**
   * Get all phone jobs
   */
  getAllPhones(): Map<string, PhoneJob> {
    return new Map(
      Array.from(this.phones.entries()).map(([k, v]) => [k, { ...v }])
    );
  }

  /**
   * Get phones as array
   */
  getPhonesArray(): PhoneJob[] {
    return Array.from(this.phones.values()).map((p) => ({ ...p }));
  }

  /**
   * Get number of phones
   */
  getPhoneCount(): number {
    return this.phones.size;
  }

  /**
   * Batch set multiple phones
   */
  setPhones(jobs: PhoneJob[]): void {
    for (const job of jobs) {
      this.setPhone(job);
    }
  }

  // ==================== Log Management ====================

  /**
   * Add a log entry
   */
  addLog(entry: LogEntry): void {
    this.logs.push(entry);
    // Keep last 10000 entries to prevent memory issues
    if (this.logs.length > 10000) {
      this.logs = this.logs.slice(-10000);
    }
  }

  /**
   * Get recent logs
   */
  getLogs(limit: number = 100): LogEntry[] {
    return this.logs.slice(-limit).map((l) => ({ ...l }));
  }

  /**
   * Get all logs
   */
  getAllLogs(): LogEntry[] {
    return this.logs.map((l) => ({ ...l }));
  }

  /**
   * Clear logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  // ==================== Status Management ====================

  /**
   * Set workflow status
   */
  setStatus(status: WorkflowStatus): void {
    this.status = status;

    if (status === 'running') {
      this.startedAt = Date.now();
      this.completedAt = null;
    } else if (status === 'completed' || status === 'stopped') {
      this.completedAt = Date.now();
    }
  }

  /**
   * Get workflow status
   */
  getStatus(): WorkflowStatus {
    return this.status;
  }

  /**
   * Check if workflow is running
   */
  isRunning(): boolean {
    return this.status === 'running';
  }

  /**
   * Get started timestamp
   */
  getStartedAt(): number | null {
    return this.startedAt;
  }

  /**
   * Get completed timestamp
   */
  getCompletedAt(): number | null {
    return this.completedAt;
  }

  // ==================== Config Management ====================

  /**
   * Store config for reference
   */
  setConfig(config: Record<string, unknown>): void {
    this.config = { ...config };
  }

  /**
   * Get stored config
   */
  getConfig(): Record<string, unknown> | null {
    return this.config ? { ...this.config } : null;
  }

  // ==================== Uploaded Media Management ====================

  /**
   * Add uploaded media URLs for cleanup tracking
   */
  addUploadedMediaUrls(urls: string[]): void {
    urls.forEach(url => this.uploadedMediaUrls.add(url));
  }

  /**
   * Get all uploaded media URLs
   */
  getUploadedMediaUrls(): string[] {
    return Array.from(this.uploadedMediaUrls);
  }

  /**
   * Clear uploaded media URLs
   */
  clearUploadedMediaUrls(): void {
    this.uploadedMediaUrls.clear();
  }

  // ==================== Results Summary ====================

  /**
   * Calculate and return results summary
   */
  getResultsSummary(): ResultsSummary {
    let completed = 0;
    let failed = 0;
    let inProgress = 0;
    let pending = 0;
    const failedPhones: ResultsSummary['failedPhones'] = [];

    for (const phone of this.phones.values()) {
      switch (phone.state) {
        case 'DONE':
          completed++;
          break;
        case 'FAILED':
          failed++;
          failedPhones.push({
            envId: phone.envId,
            serialName: phone.serialName,
            username: phone.account?.username || null,
            error: phone.lastError || 'Unknown error',
          });
          break;
        case 'IDLE':
          pending++;
          break;
        default:
          inProgress++;
      }
    }

    return {
      total: this.phones.size,
      completed,
      failed,
      inProgress,
      pending,
      failedPhones,
    };
  }

  /**
   * Get phones that are not in terminal states
   */
  getActivePhones(): PhoneJob[] {
    return Array.from(this.phones.values())
      .filter((p) => p.state !== 'DONE' && p.state !== 'FAILED')
      .map((p) => ({ ...p }));
  }

  /**
   * Get phones in a specific state
   */
  getPhonesByState(state: PhoneJob['state']): PhoneJob[] {
    return Array.from(this.phones.values())
      .filter((p) => p.state === state)
      .map((p) => ({ ...p }));
  }
}

// Export singleton instance (persisted via globalThis in development)
export const workflowStore =
  globalForStore.workflowStore ?? (globalForStore.workflowStore = new WorkflowStore());
