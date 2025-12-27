import { EventEmitter } from 'events';
import {
  PhoneJob,
  LogEntry,
  WorkflowStatus,
  ResultsSummary,
  WorkflowEventType,
} from '@/lib/state-machine/types';

// Use globalThis to persist singleton across Next.js module reloads in development
const globalForEmitter = globalThis as unknown as {
  workflowEmitter: WorkflowEventEmitter | undefined;
};

/**
 * Typed event map for workflow events
 */
interface WorkflowEventMap {
  phone_update: PhoneJob;
  log: LogEntry;
  workflow_status: { status: WorkflowStatus; error?: string };
  results: ResultsSummary;
}

/**
 * Workflow event emitter for real-time SSE updates
 *
 * Uses singleton pattern to ensure consistent state across API routes
 */
class WorkflowEventEmitter extends EventEmitter {
  constructor() {
    super();
    // Support many SSE connections
    this.setMaxListeners(100);
  }

  /**
   * Emit a typed workflow event
   */
  emitEvent<K extends WorkflowEventType>(
    type: K,
    payload: WorkflowEventMap[K]
  ): boolean {
    return this.emit(type, payload);
  }

  /**
   * Listen to a typed workflow event
   */
  onEvent<K extends WorkflowEventType>(
    type: K,
    listener: (payload: WorkflowEventMap[K]) => void
  ): this {
    return this.on(type, listener);
  }

  /**
   * Remove a typed workflow event listener
   */
  offEvent<K extends WorkflowEventType>(
    type: K,
    listener: (payload: WorkflowEventMap[K]) => void
  ): this {
    return this.off(type, listener);
  }

  /**
   * Emit phone update event
   */
  emitPhoneUpdate(phone: PhoneJob): void {
    this.emitEvent('phone_update', phone);
  }

  /**
   * Emit log entry
   */
  emitLog(log: LogEntry): void {
    this.emitEvent('log', log);
  }

  /**
   * Emit workflow status change
   */
  emitWorkflowStatus(status: WorkflowStatus, error?: string): void {
    this.emitEvent('workflow_status', { status, error });
  }

  /**
   * Emit results summary
   */
  emitResults(results: ResultsSummary): void {
    this.emitEvent('results', results);
  }
}

// Export singleton instance (persisted via globalThis in development)
export const workflowEmitter =
  globalForEmitter.workflowEmitter ?? (globalForEmitter.workflowEmitter = new WorkflowEventEmitter());

/**
 * Generate unique log entry ID
 */
let logIdCounter = 0;

export function generateLogId(): string {
  return `log_${Date.now()}_${++logIdCounter}`;
}

/**
 * Create a log entry helper
 */
export function createLogEntry(
  level: LogEntry['level'],
  message: string,
  options: {
    phoneId?: string;
    phoneName?: string;
    state?: PhoneJob['state'];
    details?: Record<string, unknown>;
  } = {}
): LogEntry {
  return {
    id: generateLogId(),
    timestamp: Date.now(),
    level,
    message,
    ...options,
  };
}
