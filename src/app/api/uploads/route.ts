import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { uploadToSpaces, getMimeType } from '@/lib/storage/spaces';
import path from 'path';

/**
 * Handle file uploads for bulk media
 * Files are uploaded to DigitalOcean Spaces for public access
 * Returns URLs that can be used by GeeLark API
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const mediaType = formData.get('mediaType') as string;

    if (!mediaType) {
      return NextResponse.json(
        { error: 'Missing mediaType' },
        { status: 400 }
      );
    }

    const uploadedFiles: { path: string; rowIndex: number; originalName: string }[] = [];

    // Process each file
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('file_')) {
        const index = key.replace('file_', '');
        const rowIndexKey = `row_${index}`;
        const rowIndexValue = formData.get(rowIndexKey);

        if (!(value instanceof File)) {
          continue;
        }

        const file = value as File;
        const rowIndex = rowIndexValue ? parseInt(String(rowIndexValue), 10) : 0;

        // Generate clean filename: {uuid}.{ext}
        // GeeLark API requires URLs that end in the file extension
        const ext = path.extname(file.name).toLowerCase().replace('.', '');
        const uuid = randomUUID().slice(0, 8);
        const filename = `${uuid}.${ext}`;
        const objectKey = `uploads/${mediaType}/${filename}`;

        // Convert File to Buffer
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Get MIME type
        const contentType = getMimeType(file.name);

        // Upload to DigitalOcean Spaces
        const publicUrl = await uploadToSpaces(objectKey, buffer, contentType);

        uploadedFiles.push({
          path: publicUrl,
          rowIndex,
          originalName: file.name,
        });
      }
    }

    if (uploadedFiles.length === 0) {
      return NextResponse.json(
        { error: 'No files uploaded' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      files: uploadedFiles,
      count: uploadedFiles.length,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}

/**
 * Note: DELETE endpoint removed since files are now in cloud storage
 * Files in Spaces can be managed via DigitalOcean dashboard or separate cleanup job
 */
