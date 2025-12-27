import { NextResponse } from 'next/server';
import { workflowStore } from '@/lib/state-machine/store';

/**
 * Get workflow status endpoint
 *
 * GET /api/workflow/status
 *
 * Returns current workflow state including:
 * - status: 'idle' | 'running' | 'stopping' | 'stopped' | 'completed'
 * - phones: array of all phone jobs with their states
 * - results: summary of completed/failed counts
 * - logs: recent log entries
 */
export async function GET() {
  try {
    const status = workflowStore.getStatus();
    const phones = workflowStore.getPhonesArray();
    const results = workflowStore.getResultsSummary();
    const logs = workflowStore.getLogs(100);
    const startedAt = workflowStore.getStartedAt();
    const completedAt = workflowStore.getCompletedAt();

    return NextResponse.json({
      status,
      phones,
      results,
      logs,
      timestamps: {
        startedAt,
        completedAt,
      },
    });
  } catch (error) {
    console.error('Get status error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
