import { NextResponse } from 'next/server';
import { GeeLarkClient } from '@/lib/geelark/client';

/**
 * Publish Instagram Reels video
 *
 * POST /api/geelark/tasks/instagram-publish-video
 *
 * Headers:
 *   Authorization: Bearer <token>
 *
 * Body:
 *   envId: Cloud phone ID (required)
 *   description: Caption, up to 2200 chars (required)
 *   videos: Array of video file references (required, up to 10)
 *   name: Task name (optional)
 *   remark: Remarks (optional)
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
    const { envId, description, videos, name, remark } = body;

    if (!envId) {
      return NextResponse.json(
        { error: 'envId is required' },
        { status: 400 }
      );
    }

    if (!description) {
      return NextResponse.json(
        { error: 'description is required' },
        { status: 400 }
      );
    }

    if (!videos || !Array.isArray(videos) || videos.length === 0) {
      return NextResponse.json(
        { error: 'videos array is required and must not be empty' },
        { status: 400 }
      );
    }

    if (videos.length > 10) {
      return NextResponse.json(
        { error: 'Maximum 10 videos allowed' },
        { status: 400 }
      );
    }

    const client = new GeeLarkClient(token);
    const response = await client.instagramPublishReelsVideo(
      envId,
      description,
      videos,
      { name, remark }
    );

    if (response.code !== 0) {
      return NextResponse.json(
        { error: response.msg || 'Failed to create publish video task' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      taskId: response.data.taskId,
    });
  } catch (error) {
    console.error('Instagram publish video error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create publish video task' },
      { status: 500 }
    );
  }
}
