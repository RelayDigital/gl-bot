import { NextResponse } from 'next/server';
import {
  getOrchestrator,
  isOrchestratorRunning,
  clearOrchestrator,
} from '@/lib/state-machine/orchestrator';
import { workflowStore } from '@/lib/state-machine/store';
import { workflowEmitter } from '@/lib/events/emitter';

/**
 * Stop workflow endpoint
 *
 * POST /api/workflow/stop
 *
 * Gracefully stops the running workflow:
 * - Aborts all active phone state machines
 * - Waits for them to complete current operations
 * - Sets workflow status to 'stopped'
 *
 * If no workflow is running, it still ensures state is reset to 'stopped'
 * to handle edge cases where client and server state are out of sync.
 */
export async function POST() {
  try {
    if (isOrchestratorRunning()) {
      // Workflow is running, stop it gracefully
      const orchestrator = getOrchestrator();
      await orchestrator.stop();
    } else {
      // No workflow running - ensure state is consistent
      // This handles edge cases where client thinks workflow is running but server doesn't
      const currentStatus = workflowStore.getStatus();
      if (currentStatus === 'running' || currentStatus === 'stopping') {
        workflowStore.setStatus('stopped');
        workflowEmitter.emitWorkflowStatus('stopped');
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Workflow stopped',
    });
  } catch (error) {
    console.error('Stop workflow error:', error);
    // Even on error, try to reset state to stopped
    workflowStore.setStatus('stopped');
    workflowEmitter.emitWorkflowStatus('stopped');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
