import { NextResponse } from 'next/server';
import { GeeLarkClient } from '@/lib/geelark/client';

/**
 * Install app on phone(s)
 *
 * POST /api/geelark/apps/install
 *
 * Headers:
 *   Authorization: Bearer <token>
 *
 * Body:
 *   { envIds: string[], appVersionId: string }
 *   OR
 *   { envId: string, appVersionId: string }
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
    const { envId, envIds, appVersionId } = body;

    if (!appVersionId) {
      return NextResponse.json(
        { error: 'appVersionId is required' },
        { status: 400 }
      );
    }

    const phoneIds = envIds || (envId ? [envId] : null);
    if (!phoneIds || phoneIds.length === 0) {
      return NextResponse.json(
        { error: 'envId or envIds is required' },
        { status: 400 }
      );
    }

    const client = new GeeLarkClient(token);
    const result = await client.installAppOnPhones(phoneIds, appVersionId);

    return NextResponse.json({
      success: result.code === 0,
      code: result.code,
      message: result.msg,
    });
  } catch (error) {
    console.error('Install app error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to install app' },
      { status: 500 }
    );
  }
}
