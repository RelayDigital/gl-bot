import { NextResponse } from 'next/server';
import { GeeLarkClient } from '@/lib/geelark/client';

/**
 * Fetch phone groups from GeeLark
 *
 * GET /api/geelark/groups
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

    const client = new GeeLarkClient(token);
    const groups = await client.listAllGroups();

    return NextResponse.json({
      success: true,
      groups,
    });
  } catch (error) {
    console.error('Fetch groups error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch groups' },
      { status: 500 }
    );
  }
}
