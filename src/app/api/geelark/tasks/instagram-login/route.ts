import { NextResponse } from 'next/server';
import { GeeLarkClient } from '@/lib/geelark/client';

/**
 * Start Instagram login RPA task
 *
 * POST /api/geelark/tasks/instagram-login
 *
 * Headers:
 *   Authorization: Bearer <token>
 *
 * Body:
 *   { envId: string, account: string, password: string }
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
    const { envId, account, password } = body;

    if (!envId) {
      return NextResponse.json(
        { error: 'envId is required' },
        { status: 400 }
      );
    }

    if (!account) {
      return NextResponse.json(
        { error: 'account (username/email) is required' },
        { status: 400 }
      );
    }

    if (!password) {
      return NextResponse.json(
        { error: 'password is required' },
        { status: 400 }
      );
    }

    const client = new GeeLarkClient(token);
    const result = await client.instagramLogin(envId, account, password);

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
    console.error('Instagram login task error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start Instagram login task' },
      { status: 500 }
    );
  }
}
