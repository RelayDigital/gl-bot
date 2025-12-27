import { workflowEmitter } from '@/lib/events/emitter';
import { workflowStore } from '@/lib/state-machine/store';
import {
  PhoneJob,
  LogEntry,
  WorkflowStatus,
  ResultsSummary,
} from '@/lib/state-machine/types';

/**
 * Server-Sent Events endpoint for real-time workflow updates
 *
 * GET /api/events
 *
 * Events emitted:
 * - phone_update: PhoneJob - when a phone's state changes
 * - log: LogEntry - when a new log entry is added
 * - workflow_status: { status: WorkflowStatus } - workflow state changes
 * - results: ResultsSummary - final results when workflow completes
 */
export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial state
      const sendEvent = (type: string, data: unknown) => {
        const event = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(event));
        } catch {
          // Controller closed, ignore
        }
      };

      // Send current state on connect
      sendEvent('workflow_status', { status: workflowStore.getStatus() });

      const phones = workflowStore.getPhonesArray();
      for (const phone of phones) {
        sendEvent('phone_update', phone);
      }

      // Event handlers
      const onPhoneUpdate = (phone: PhoneJob) => {
        sendEvent('phone_update', phone);
      };

      const onLog = (log: LogEntry) => {
        sendEvent('log', log);
      };

      const onWorkflowStatus = (data: { status: WorkflowStatus; error?: string }) => {
        sendEvent('workflow_status', data);
      };

      const onResults = (results: ResultsSummary) => {
        sendEvent('results', results);
      };

      // Subscribe to events
      workflowEmitter.on('phone_update', onPhoneUpdate);
      workflowEmitter.on('log', onLog);
      workflowEmitter.on('workflow_status', onWorkflowStatus);
      workflowEmitter.on('results', onResults);

      // Cleanup on client disconnect
      request.signal.addEventListener('abort', () => {
        workflowEmitter.off('phone_update', onPhoneUpdate);
        workflowEmitter.off('log', onLog);
        workflowEmitter.off('workflow_status', onWorkflowStatus);
        workflowEmitter.off('results', onResults);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });

      // Keep-alive ping every 30 seconds
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(pingInterval);
        }
      }, 30000);

      request.signal.addEventListener('abort', () => {
        clearInterval(pingInterval);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
