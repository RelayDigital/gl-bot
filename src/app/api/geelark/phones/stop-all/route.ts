import { NextResponse } from 'next/server';
import { GeeLarkClient } from '@/lib/geelark/client';

/**
 * Stop all phones in a group
 *
 * POST /api/geelark/phones/stop-all
 *
 * Headers:
 *   Authorization: Bearer <token>
 *
 * Body:
 *   { groupName: string }
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
    const { groupName } = body;

    if (!groupName) {
      return NextResponse.json(
        { error: 'groupName is required' },
        { status: 400 }
      );
    }

    const client = new GeeLarkClient(token);

    // Get all phones in the group
    const phones = await client.listAllPhones(groupName);

    if (phones.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No phones found in group',
        stoppedCount: 0,
      });
    }

    // Stop phones in batches of 100 (API limit)
    const phoneIds = phones.map((p) => p.id);
    let stoppedCount = 0;

    for (let i = 0; i < phoneIds.length; i += 100) {
      const batch = phoneIds.slice(i, i + 100);
      const result = await client.stopPhones(batch);

      if (result.code === 0) {
        stoppedCount += batch.length;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Stopped ${stoppedCount} phones`,
      stoppedCount,
      totalPhones: phones.length,
    });
  } catch (error) {
    console.error('Stop all phones error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to stop phones' },
      { status: 500 }
    );
  }
}
