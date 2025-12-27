import { NextResponse } from 'next/server';
import { GeeLarkClient } from '@/lib/geelark/client';

/**
 * Get installed apps on a phone
 *
 * GET /api/geelark/apps/installed?envId=<id>
 *
 * Headers:
 *   Authorization: Bearer <token>
 */
export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const envId = searchParams.get('envId');

    if (!envId) {
      return NextResponse.json(
        { error: 'envId is required' },
        { status: 400 }
      );
    }

    const client = new GeeLarkClient(token);
    const result = await client.getInstalledApps(envId);

    if (result.code !== 0) {
      return NextResponse.json(
        { error: result.msg, code: result.code },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      apps: result.data.apps,
    });
  } catch (error) {
    console.error('Get installed apps error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get installed apps' },
      { status: 500 }
    );
  }
}
