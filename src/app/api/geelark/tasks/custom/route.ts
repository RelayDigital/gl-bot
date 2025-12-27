import { NextResponse } from 'next/server';
import { GeeLarkClient } from '@/lib/geelark/client';

/**
 * Create a custom RPA task
 *
 * POST /api/geelark/tasks/custom
 *
 * Headers:
 *   Authorization: Bearer <token>
 *
 * Body:
 *   envId: Cloud phone ID (required)
 *   flowId: Task flow ID (required)
 *   name: Task name (optional, max 32 chars)
 *   remark: Remarks (optional, max 200 chars)
 *   paramMap: Task flow parameters (optional)
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);
    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { envId, flowId, name, remark, paramMap } = body;

    if (!envId) {
      return NextResponse.json(
        { error: 'envId is required' },
        { status: 400 }
      );
    }

    if (!flowId) {
      return NextResponse.json(
        { error: 'flowId is required' },
        { status: 400 }
      );
    }

    const client = new GeeLarkClient(token);
    const response = await client.createCustomTask(envId, flowId, {
      name,
      remark,
      paramMap,
    });

    if (response.code !== 0) {
      return NextResponse.json(
        { error: response.msg || 'Failed to create custom task' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      taskId: response.data.taskId,
    });
  } catch (error) {
    console.error('Create custom task error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create custom task' },
      { status: 500 }
    );
  }
}
