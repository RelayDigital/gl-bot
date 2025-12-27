import { NextResponse } from 'next/server';
import { GeeLarkClient } from '@/lib/geelark/client';

/**
 * Query task status(es)
 *
 * POST /api/geelark/tasks/query
 *
 * Headers:
 *   Authorization: Bearer <token>
 *
 * Body:
 *   { ids: string[] }
 */
export async function POST(request: Request) {
  try {
    // Get token from Authorization header
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
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'ids array is required' },
        { status: 400 }
      );
    }

    const client = new GeeLarkClient(token);
    const result = await client.queryTasks(ids);

    if (result.code !== 0) {
      return NextResponse.json(
        { error: result.msg, code: result.code },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      tasks: result.data.items,
    });
  } catch (error) {
    console.error('Query tasks error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to query tasks' },
      { status: 500 }
    );
  }
}
