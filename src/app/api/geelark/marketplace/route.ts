import { NextResponse } from 'next/server';
import { GeeLarkClient } from '@/lib/geelark/client';

/**
 * Search marketplace apps from GeeLark App Shop
 *
 * GET /api/geelark/marketplace?key=instagram
 *
 * Headers:
 *   Authorization: Bearer <token>
 *
 * Query params:
 *   key: optional search keyword
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

    // Get search keyword from query params
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get('key') || undefined;

    const client = new GeeLarkClient(token);
    const response = await client.listMarketplaceApps(keyword, 1, 100);

    if (response.code !== 0) {
      return NextResponse.json(
        { error: response.msg || 'Failed to fetch apps from marketplace' },
        { status: 400 }
      );
    }

    // Response structure: data.items[] with each item having appVersionList
    return NextResponse.json({
      success: true,
      apps: response.data.items,
    });
  } catch (error) {
    console.error('Fetch marketplace apps error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch apps from marketplace' },
      { status: 500 }
    );
  }
}
