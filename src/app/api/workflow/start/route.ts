import { NextResponse } from 'next/server';
import {
  createOrchestrator,
  isOrchestratorRunning,
} from '@/lib/state-machine/orchestrator';
import { WorkflowConfig, WorkflowType } from '@/lib/state-machine/types';
import { parseCSV } from '@/lib/utils/sorting';

/**
 * Start workflow endpoint
 *
 * POST /api/workflow/start
 *
 * Body:
 * {
 *   apiToken: string,
 *   groupName: string,
 *   accountData: string (CSV/TSV format),
 *   igAppVersionId: string,
 *   concurrencyLimit?: number (default 5),
 *   maxRetriesPerStage?: number (default 3),
 *   baseBackoffSeconds?: number (default 2),
 *   pollIntervalSeconds?: number (default 5),
 *   pollTimeoutSeconds?: number (default 300)
 * }
 */
export async function POST(request: Request) {
  try {
    // Check if already running
    if (isOrchestratorRunning()) {
      return NextResponse.json(
        { error: 'Workflow is already running' },
        { status: 409 }
      );
    }

    const body = await request.json();

    // Validate required fields
    if (!body.apiToken) {
      return NextResponse.json(
        { error: 'apiToken is required' },
        { status: 400 }
      );
    }

    if (!body.groupName) {
      return NextResponse.json(
        { error: 'groupName is required' },
        { status: 400 }
      );
    }

    if (!body.accountData) {
      return NextResponse.json(
        { error: 'accountData is required' },
        { status: 400 }
      );
    }

    if (!body.igAppVersionId) {
      return NextResponse.json(
        { error: 'igAppVersionId is required' },
        { status: 400 }
      );
    }

    // Parse account data
    const sheetRows = parseCSV(body.accountData);

    if (sheetRows.length === 0) {
      return NextResponse.json(
        { error: 'accountData must contain at least one account' },
        { status: 400 }
      );
    }

    // Build config with defaults
    const config: WorkflowConfig = {
      apiToken: body.apiToken,
      groupName: body.groupName,
      sheetRows,
      igAppVersionId: body.igAppVersionId,
      concurrencyLimit: body.concurrencyLimit ?? 5,
      maxRetriesPerStage: body.maxRetriesPerStage ?? 3,
      baseBackoffSeconds: body.baseBackoffSeconds ?? 2,
      pollIntervalSeconds: body.pollIntervalSeconds ?? 5,
      pollTimeoutSeconds: body.pollTimeoutSeconds ?? 300,
      customLoginFlowId: body.customLoginFlowId,
      customLoginFlowParams: body.customLoginFlowParams,
      workflowType: (body.workflowType as WorkflowType) ?? 'warmup',
      setupFlowIds: body.setupFlowIds,
    };

    // Create orchestrator and start in background
    const orchestrator = createOrchestrator(config);

    // Start async - don't await
    orchestrator.start().catch((error) => {
      console.error('Workflow start error:', error);
    });

    return NextResponse.json({
      success: true,
      message: 'Workflow started',
      config: {
        groupName: config.groupName,
        accountCount: config.sheetRows.length,
        concurrencyLimit: config.concurrencyLimit,
        maxRetriesPerStage: config.maxRetriesPerStage,
      },
    });
  } catch (error) {
    console.error('Start workflow error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
