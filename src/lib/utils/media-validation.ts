/**
 * Media URL validation utilities
 *
 * Validates that media URLs are accessible before attempting to publish.
 * This catches issues like deleted files or incorrect URLs early.
 */

export interface MediaValidationResult {
  url: string;
  isAccessible: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * Check if a media URL is accessible via HEAD request
 */
export async function validateMediaUrl(url: string): Promise<MediaValidationResult> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      // Short timeout since we're just checking accessibility
      signal: AbortSignal.timeout(10000),
    });

    return {
      url,
      isAccessible: response.ok,
      statusCode: response.status,
      error: response.ok ? undefined : `HTTP ${response.status} ${response.statusText}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      url,
      isAccessible: false,
      error: errorMessage,
    };
  }
}

/**
 * Validate multiple media URLs
 * Returns results for all URLs
 */
export async function validateMediaUrls(urls: string[]): Promise<{
  allValid: boolean;
  results: MediaValidationResult[];
  invalidUrls: MediaValidationResult[];
}> {
  const results = await Promise.all(urls.map(validateMediaUrl));
  const invalidUrls = results.filter(r => !r.isAccessible);

  return {
    allValid: invalidUrls.length === 0,
    results,
    invalidUrls,
  };
}

/**
 * Format validation errors for logging
 */
export function formatValidationErrors(invalidUrls: MediaValidationResult[]): string {
  if (invalidUrls.length === 0) return '';

  const errors = invalidUrls.map(r => {
    const shortUrl = r.url.length > 60 ? `...${r.url.slice(-57)}` : r.url;
    return `  - ${shortUrl}: ${r.error || 'Unknown error'}`;
  });

  return `Invalid media URLs:\n${errors.join('\n')}`;
}
