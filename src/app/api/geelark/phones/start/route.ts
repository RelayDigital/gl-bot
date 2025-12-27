import { NextResponse } from 'next/server';
import { GeeLarkClient } from '@/lib/geelark/client';

/**
 * Start phone environment(s)
 *
 * POST /api/geelark/phones/start
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
    const result = await client.startPhones(ids);

    return NextResponse.json({
      success: result.code === 0,
      code: result.code,
      message: result.msg,
    });
  } catch (error) {
    console.error('Start phones error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start phones' },
      { status: 500 }
    );
  }
}
