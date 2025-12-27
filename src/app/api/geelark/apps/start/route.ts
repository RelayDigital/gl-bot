import { NextResponse } from 'next/server';
import { GeeLarkClient } from '@/lib/geelark/client';

/**
 * Start an application on a phone
 *
 * POST /api/geelark/apps/start
 *
 * Headers:
 *   Authorization: Bearer <token>
 *
 * Body:
 *   envId: Cloud phone ID (required)
 *   appVersionId: App version ID (optional, one of appVersionId or packageName required)
 *   packageName: Package name (optional, one of appVersionId or packageName required)
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
    const { envId, appVersionId, packageName } = body;

    if (!envId) {
      return NextResponse.json(
        { error: 'envId is required' },
        { status: 400 }
      );
    }

    if (!appVersionId && !packageName) {
      return NextResponse.json(
        { error: 'Either appVersionId or packageName is required' },
        { status: 400 }
      );
    }

    const client = new GeeLarkClient(token);
    const appIdentifier = appVersionId
      ? { appVersionId }
      : { packageName };

    const response = await client.startApp(envId, appIdentifier);

    if (response.code !== 0) {
      return NextResponse.json(
        { error: response.msg || 'Failed to start app' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('Start app error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start app' },
      { status: 500 }
    );
  }
}
