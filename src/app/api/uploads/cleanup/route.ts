import { NextRequest, NextResponse } from 'next/server';
import { deleteByUrls } from '@/lib/storage/spaces';

/**
 * Clean up uploaded files from DigitalOcean Spaces
 * POST /api/uploads/cleanup
 * Body: { urls: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { urls } = body;

    if (!urls || !Array.isArray(urls)) {
      return NextResponse.json(
        { error: 'Missing urls array' },
        { status: 400 }
      );
    }

    if (urls.length === 0) {
      return NextResponse.json({ success: true, deleted: 0 });
    }

    await deleteByUrls(urls);

    console.log(`[Cleanup] Deleted ${urls.length} file(s) from Spaces`);

    return NextResponse.json({
      success: true,
      deleted: urls.length,
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cleanup failed' },
      { status: 500 }
    );
  }
}
