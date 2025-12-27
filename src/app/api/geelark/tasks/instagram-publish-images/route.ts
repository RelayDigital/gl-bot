import { NextResponse } from 'next/server';
import { GeeLarkClient } from '@/lib/geelark/client';

/**
 * Publish Instagram Reels image carousel
 *
 * POST /api/geelark/tasks/instagram-publish-images
 *
 * Headers:
 *   Authorization: Bearer <token>
 *
 * Body:
 *   envId: Cloud phone ID (required)
 *   description: Caption, up to 2200 chars (required)
 *   images: Array of image file references (required, up to 10)
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
    const { envId, description, images, name, remark } = body;

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

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { error: 'images array is required and must not be empty' },
        { status: 400 }
      );
    }

    if (images.length > 10) {
      return NextResponse.json(
        { error: 'Maximum 10 images allowed' },
        { status: 400 }
      );
    }

    const client = new GeeLarkClient(token);
    const response = await client.instagramPublishReelsImages(
      envId,
      description,
      images,
      { name, remark }
    );

    if (response.code !== 0) {
      return NextResponse.json(
        { error: response.msg || 'Failed to create publish images task' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      taskId: response.data.taskId,
    });
  } catch (error) {
    console.error('Instagram publish images error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create publish images task' },
      { status: 500 }
    );
  }
}
