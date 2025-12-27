import { S3Client, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';

// DigitalOcean Spaces configuration
const SPACES_CONFIG = {
  bucket: 'glbot-media-public',
  region: 'nyc3',
  endpoint: 'https://nyc3.digitaloceanspaces.com',
  publicUrl: 'https://glbot-media-public.nyc3.digitaloceanspaces.com',
  accessKeyId: 'DO00DY96XYPHKG344UVA',
  secretAccessKey: '+ST+vk32ZdYL4lLp8PMpybg9Bkam2r8kkXaJAfA50K0',
};

// Create S3 client for DigitalOcean Spaces
const s3Client = new S3Client({
  endpoint: SPACES_CONFIG.endpoint,
  region: SPACES_CONFIG.region,
  credentials: {
    accessKeyId: SPACES_CONFIG.accessKeyId,
    secretAccessKey: SPACES_CONFIG.secretAccessKey,
  },
  forcePathStyle: false,
});

/**
 * Upload a file to DigitalOcean Spaces
 * @param key - The object key (path) in the bucket, e.g., "uploads/post1Media/abc123.mp4"
 * @param body - The file content as Buffer
 * @param contentType - MIME type of the file
 * @returns Public URL of the uploaded file
 */
export async function uploadToSpaces(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: SPACES_CONFIG.bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    ACL: 'public-read', // Make file publicly accessible
  });

  await s3Client.send(command);

  // Return the public URL
  return `${SPACES_CONFIG.publicUrl}/${key}`;
}

/**
 * Get the public URL for a key
 */
export function getPublicUrl(key: string): string {
  return `${SPACES_CONFIG.publicUrl}/${key}`;
}

/**
 * Get MIME type from file extension
 */
export function getMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    // Video
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
    m4v: 'video/x-m4v',
    wmv: 'video/x-ms-wmv',
    flv: 'video/x-flv',
    '3gp': 'video/3gpp',
    // Image
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

/**
 * Extract the object key from a public URL
 */
export function getKeyFromUrl(url: string): string | null {
  if (!url.startsWith(SPACES_CONFIG.publicUrl)) {
    return null;
  }
  return url.replace(`${SPACES_CONFIG.publicUrl}/`, '');
}

/**
 * Delete a single file from DigitalOcean Spaces
 * @param key - The object key to delete
 */
export async function deleteFromSpaces(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: SPACES_CONFIG.bucket,
    Key: key,
  });

  await s3Client.send(command);
}

/**
 * Delete multiple files from DigitalOcean Spaces
 * @param keys - Array of object keys to delete
 */
export async function deleteMultipleFromSpaces(keys: string[]): Promise<void> {
  if (keys.length === 0) return;

  // S3 DeleteObjects supports up to 1000 keys per request
  const batchSize = 1000;
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    const command = new DeleteObjectsCommand({
      Bucket: SPACES_CONFIG.bucket,
      Delete: {
        Objects: batch.map(key => ({ Key: key })),
        Quiet: true,
      },
    });

    await s3Client.send(command);
  }
}

/**
 * Delete files from Spaces given their public URLs
 * @param urls - Array of public URLs to delete
 */
export async function deleteByUrls(urls: string[]): Promise<void> {
  const keys = urls
    .map(url => getKeyFromUrl(url))
    .filter((key): key is string => key !== null);

  await deleteMultipleFromSpaces(keys);
}
