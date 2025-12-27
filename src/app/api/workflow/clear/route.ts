import { NextResponse } from 'next/server';
import { workflowStore } from '@/lib/state-machine/store';
import { clearOrchestrator, isOrchestratorRunning } from '@/lib/state-machine/orchestrator';
import { workflowEmitter } from '@/lib/events/emitter';

/**
 * Clear workflow endpoint
 *
 * POST /api/workflow/clear
 *
 * Resets the workflow state on the server side, allowing a new workflow to be started.
 * Returns error if workflow is currently running.
 */
export async function POST() {
  try {
    // Check if workflow is currently running
    if (isOrchestratorRunning()) {
      return NextResponse.json(
        { error: 'Cannot clear while workflow is running. Stop the workflow first.' },
        { status: 409 }
      );
    }

    // Clear server-side state
    workflowStore.reset();
    clearOrchestrator();

    // Emit status change so SSE clients update
    workflowEmitter.emitWorkflowStatus('idle');

    return NextResponse.json({
      success: true,
      message: 'Workflow state cleared',
    });
  } catch (error) {
    console.error('Clear workflow error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
