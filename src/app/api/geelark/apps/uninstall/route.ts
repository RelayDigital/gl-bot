import { NextResponse } from 'next/server';
import { GeeLarkClient } from '@/lib/geelark/client';

/**
 * Uninstall app from a phone
 *
 * POST /api/geelark/apps/uninstall
 *
 * Headers:
 *   Authorization: Bearer <token>
 *
 * Body:
 *   { envId: string, packageName: string }
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
    const { envId, packageName } = body;

    if (!envId) {
      return NextResponse.json(
        { error: 'envId is required' },
        { status: 400 }
      );
    }

    if (!packageName) {
      return NextResponse.json(
        { error: 'packageName is required' },
        { status: 400 }
      );
    }

    const client = new GeeLarkClient(token);
    const result = await client.uninstallApp(envId, packageName);

    return NextResponse.json({
      success: result.code === 0,
      code: result.code,
      message: result.msg,
    });
  } catch (error) {
    console.error('Uninstall app error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to uninstall app' },
      { status: 500 }
    );
  }
}
