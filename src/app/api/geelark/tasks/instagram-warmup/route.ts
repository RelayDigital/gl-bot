import { NextResponse } from 'next/server';
import { GeeLarkClient } from '@/lib/geelark/client';

/**
 * Start Instagram warmup RPA task
 *
 * POST /api/geelark/tasks/instagram-warmup
 *
 * Headers:
 *   Authorization: Bearer <token>
 *
 * Body:
 *   {
 *     envId: string,          // Required: Cloud phone ID
 *     browseVideo?: number,   // Optional: Videos to view (1-100)
 *     keyword?: string,       // Optional: Search keyword
 *     name?: string,          // Optional: Task name (max 128 chars)
 *     remark?: string         // Optional: Remarks (max 200 chars)
 *   }
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
    const { envId, browseVideo, keyword, name, remark } = body;

    if (!envId) {
      return NextResponse.json(
        { error: 'envId is required' },
        { status: 400 }
      );
    }

    const client = new GeeLarkClient(token);
    const result = await client.instagramWarmup(envId, {
      browseVideo,
      keyword,
      name,
      remark,
    });

    if (result.code !== 0) {
      return NextResponse.json(
        { error: result.msg, code: result.code },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      taskId: result.data.taskId,
    });
  } catch (error) {
    console.error('Instagram warmup task error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start Instagram warmup task' },
      { status: 500 }
    );
  }
}
