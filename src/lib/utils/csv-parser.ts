/**
 * CSV Parser with header detection and mapping support
 */

import { SetupData, PostContent, RedditPostContent, WorkflowType } from '@/lib/state-machine/types';

export interface CSVParseResult {
  headers: string[];
  rows: Record<string, string>[];
  rawRows: string[][];
}

/**
 * Parse a CSV string into headers and rows
 * Handles both comma and tab separators, and quoted fields
 */
export function parseCSV(content: string): CSVParseResult {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length === 0) {
    return { headers: [], rows: [], rawRows: [] };
  }

  // Detect separator (tab or comma)
  const firstLine = lines[0];
  const separator = firstLine.includes('\t') ? '\t' : ',';

  // Parse all lines
  const rawRows = lines.map((line) => parseLine(line, separator));

  // First row is headers
  const headers = rawRows[0] || [];
  const dataRows = rawRows.slice(1);

  // Convert to objects
  const rows = dataRows.map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, i) => {
      obj[header] = row[i] || '';
    });
    return obj;
  });

  return { headers, rows, rawRows: dataRows };
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseLine(line: string, separator: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else if (char === '"') {
        // End of quoted field
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        // Start of quoted field
        inQuotes = true;
      } else if (char === separator) {
        // End of field
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }

  // Add last field
  result.push(current.trim());

  return result;
}

/**
 * Required fields for account data
 */
export const REQUIRED_FIELDS = ['username', 'password'] as const;
export const OPTIONAL_FIELDS = [
  'twoFactorSecret',
  'runWarmup',
  'warmupBrowseVideo',
  'accountType',
  // Setup workflow fields
  'profilePictureUrl',
  'bio',
  'post1Description',
  'post1MediaUrls',
  'post2Description',
  'post2MediaUrls',
  'highlightTitle',
  'highlightCoverUrl',
  // Sister workflow fields
  'newUsername',
  'newDisplayName',
  // Reddit workflow fields
  'redditWarmupKeyword',
  'redditPost1Title',
  'redditPost1Description',
  'redditPost1Community',
  'redditPost1MediaUrls',
  'redditPost2Title',
  'redditPost2Description',
  'redditPost2Community',
  'redditPost2MediaUrls',
] as const;
export const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS] as const;

export type AccountField = (typeof ALL_FIELDS)[number];

/**
 * Fields specific to each workflow type
 */
export const WARMUP_FIELDS: AccountField[] = [
  'runWarmup',
  'warmupBrowseVideo',
  'accountType',
];

export const SETUP_FIELDS: AccountField[] = [
  'profilePictureUrl',
  'bio',
  'post1Description',
  'post1MediaUrls',
  'post2Description',
  'post2MediaUrls',
  'highlightTitle',
  'highlightCoverUrl',
];

export const SISTER_FIELDS: AccountField[] = [
  'newUsername',
  'newDisplayName',
  'profilePictureUrl',
  'bio',
];

export const REDDIT_WARMUP_FIELDS: AccountField[] = [
  'runWarmup',
  'redditWarmupKeyword',
];

export const REDDIT_POST_FIELDS: AccountField[] = [
  'runWarmup',
  'redditWarmupKeyword',
  'redditPost1Title',
  'redditPost1Description',
  'redditPost1Community',
  'redditPost1MediaUrls',
  'redditPost2Title',
  'redditPost2Description',
  'redditPost2Community',
  'redditPost2MediaUrls',
];

/**
 * Get fields relevant to a workflow type
 */
export function getWorkflowFields(workflowType: WorkflowType): {
  required: AccountField[];
  recommended: AccountField[];
  optional: AccountField[];
} {
  const baseRequired: AccountField[] = ['username', 'password'];

  if (workflowType === 'setup') {
    return {
      required: baseRequired,
      recommended: SETUP_FIELDS,
      optional: ['twoFactorSecret', ...WARMUP_FIELDS, 'newUsername'],
    };
  }

  if (workflowType === 'sister') {
    return {
      required: baseRequired,
      recommended: SISTER_FIELDS,
      optional: ['twoFactorSecret', ...WARMUP_FIELDS, ...SETUP_FIELDS.filter(f => !SISTER_FIELDS.includes(f))],
    };
  }

  if (workflowType === 'custom') {
    // Custom workflow - all fields are optional, user selects what they need
    return {
      required: baseRequired,
      recommended: [], // No recommended since it's fully customizable
      optional: ['twoFactorSecret', ...WARMUP_FIELDS, ...SETUP_FIELDS, 'newUsername', 'newDisplayName'],
    };
  }

  if (workflowType === 'reddit_warmup') {
    return {
      required: baseRequired,
      recommended: REDDIT_WARMUP_FIELDS,
      optional: ['twoFactorSecret'],
    };
  }

  if (workflowType === 'reddit_post') {
    return {
      required: baseRequired,
      recommended: REDDIT_POST_FIELDS,
      optional: ['twoFactorSecret'],
    };
  }

  // Instagram Warmup workflow (default)
  return {
    required: baseRequired,
    recommended: WARMUP_FIELDS,
    optional: ['twoFactorSecret', ...SETUP_FIELDS, 'newUsername'],
  };
}

/**
 * Get field category for a specific field and workflow
 */
export function getFieldCategory(
  field: AccountField,
  workflowType: WorkflowType
): 'required' | 'recommended' | 'optional' {
  const categories = getWorkflowFields(workflowType);

  if (categories.required.includes(field)) return 'required';
  if (categories.recommended.includes(field)) return 'recommended';
  return 'optional';
}

export interface HeaderMapping {
  [key: string]: AccountField | null;
}

/**
 * Auto-detect header mappings based on common patterns
 */
export function autoDetectMappings(headers: string[]): HeaderMapping {
  const mapping: HeaderMapping = {};

  const patterns: Record<AccountField, RegExp[]> = {
    username: [/^user(name)?$/i, /^account$/i, /^email$/i, /^login$/i, /^ig[_-]?user(name)?$/i],
    password: [/^pass(word)?$/i, /^pwd$/i, /^ig[_-]?pass(word)?$/i],
    twoFactorSecret: [/^(two[_-]?factor|2fa)[_-]?secret$/i, /^totp[_-]?secret$/i, /^2fa$/i, /^secret[_-]?key$/i, /^auth[_-]?secret$/i, /^otp[_-]?secret$/i],
    runWarmup: [/^(run[_-]?)?warmup$/i, /^do[_-]?warmup$/i, /^enable[_-]?warmup$/i],
    warmupBrowseVideo: [/^(warmup[_-]?)?browse[_-]?video$/i, /^video[_-]?count$/i, /^videos?$/i],
    accountType: [/^(account[_-]?)?type$/i, /^content[_-]?type$/i, /^reels?$/i, /^posts?$/i],
    // Setup workflow patterns
    profilePictureUrl: [/^profile[_-]?(picture|pic|photo)[_-]?url$/i, /^avatar[_-]?url$/i, /^pfp[_-]?url$/i],
    bio: [/^bio$/i, /^description$/i, /^about$/i, /^profile[_-]?bio$/i],
    post1Description: [/^post[_-]?1[_-]?(desc|description|caption)?$/i, /^first[_-]?post[_-]?(desc|description|caption)?$/i],
    post1MediaUrls: [/^post[_-]?1[_-]?(media|urls?|images?|videos?)$/i, /^first[_-]?post[_-]?(media|urls?)$/i],
    post2Description: [/^post[_-]?2[_-]?(desc|description|caption)?$/i, /^second[_-]?post[_-]?(desc|description|caption)?$/i],
    post2MediaUrls: [/^post[_-]?2[_-]?(media|urls?|images?|videos?)$/i, /^second[_-]?post[_-]?(media|urls?)$/i],
    highlightTitle: [/^highlight[_-]?(title|name)$/i, /^story[_-]?highlight[_-]?(title|name)?$/i],
    highlightCoverUrl: [/^highlight[_-]?(cover|image)[_-]?url$/i, /^story[_-]?highlight[_-]?(cover|image)?$/i],
    // Sister workflow patterns
    newUsername: [/^new[_-]?user(name)?$/i, /^sister[_-]?user(name)?$/i, /^rename[_-]?to$/i, /^target[_-]?user(name)?$/i],
    newDisplayName: [/^new[_-]?display[_-]?name$/i, /^display[_-]?name$/i, /^name$/i, /^full[_-]?name$/i],
    // Reddit workflow patterns
    redditWarmupKeyword: [/^reddit[_-]?(warmup[_-]?)?keyword$/i, /^warmup[_-]?keyword$/i, /^browse[_-]?keyword$/i],
    redditPost1Title: [/^reddit[_-]?post[_-]?1[_-]?title$/i, /^post[_-]?1[_-]?title$/i, /^first[_-]?post[_-]?title$/i],
    redditPost1Description: [/^reddit[_-]?post[_-]?1[_-]?(desc|description|body)$/i, /^post[_-]?1[_-]?body$/i],
    redditPost1Community: [/^reddit[_-]?post[_-]?1[_-]?(community|subreddit)$/i, /^subreddit[_-]?1$/i, /^community[_-]?1$/i],
    redditPost1MediaUrls: [/^reddit[_-]?post[_-]?1[_-]?(media|urls?|images?|videos?)$/i],
    redditPost2Title: [/^reddit[_-]?post[_-]?2[_-]?title$/i, /^post[_-]?2[_-]?title$/i, /^second[_-]?post[_-]?title$/i],
    redditPost2Description: [/^reddit[_-]?post[_-]?2[_-]?(desc|description|body)$/i, /^post[_-]?2[_-]?body$/i],
    redditPost2Community: [/^reddit[_-]?post[_-]?2[_-]?(community|subreddit)$/i, /^subreddit[_-]?2$/i, /^community[_-]?2$/i],
    redditPost2MediaUrls: [/^reddit[_-]?post[_-]?2[_-]?(media|urls?|images?|videos?)$/i],
  };

  for (const header of headers) {
    for (const [field, regexes] of Object.entries(patterns)) {
      if (regexes.some((regex) => regex.test(header))) {
        mapping[header] = field as AccountField;
        break;
      }
    }

    // If no match, set to null
    if (!(header in mapping)) {
      mapping[header] = null;
    }
  }

  return mapping;
}

/**
 * Apply header mapping to convert CSV rows to account data format
 */
export function applyMapping(
  rows: Record<string, string>[],
  mapping: HeaderMapping
): {
  username: string;
  password: string;
  twoFactorSecret?: string;
  flags: Record<string, unknown>;
  setup?: SetupData;
  redditPosts?: RedditPostContent[];
}[] {
  // Find which headers map to which fields
  const fieldToHeader: Partial<Record<AccountField, string>> = {};
  for (const [header, field] of Object.entries(mapping)) {
    if (field) {
      fieldToHeader[field] = header;
    }
  }

  return rows.map((row) => {
    const username = fieldToHeader.username ? row[fieldToHeader.username] || '' : '';
    const password = fieldToHeader.password ? row[fieldToHeader.password] || '' : '';
    const twoFactorSecret = fieldToHeader.twoFactorSecret ? row[fieldToHeader.twoFactorSecret] || undefined : undefined;

    const flags: Record<string, unknown> = {};

    if (fieldToHeader.runWarmup) {
      const value = row[fieldToHeader.runWarmup]?.toLowerCase();
      flags.runWarmup = value === 'true' || value === '1' || value === 'yes';
    }

    if (fieldToHeader.warmupBrowseVideo) {
      const value = parseInt(row[fieldToHeader.warmupBrowseVideo] || '0', 10);
      if (!isNaN(value) && value > 0) {
        flags.warmupBrowseVideo = value;
      }
    }

    if (fieldToHeader.accountType) {
      const value = row[fieldToHeader.accountType]?.toLowerCase();
      if (value === 'reels' || value === 'posts') {
        flags.accountType = value;
      }
    }

    // Reddit warmup keyword
    if (fieldToHeader.redditWarmupKeyword) {
      const value = row[fieldToHeader.redditWarmupKeyword]?.trim();
      if (value) {
        flags.redditWarmupKeyword = value;
      }
    }

    // Build Setup data if any Setup fields are present
    const setup = buildSetupData(row, fieldToHeader);

    // Build Reddit posts if any Reddit post fields are present
    const redditPosts = buildRedditPosts(row, fieldToHeader);

    return { username, password, twoFactorSecret, flags, setup, redditPosts };
  });
}

/**
 * Build SetupData from CSV row if Setup fields are present
 */
function buildSetupData(
  row: Record<string, string>,
  fieldToHeader: Partial<Record<AccountField, string>>
): SetupData | undefined {
  const setup: SetupData = {};

  // New username (for sister workflow)
  if (fieldToHeader.newUsername) {
    const value = row[fieldToHeader.newUsername]?.trim();
    if (value) setup.newUsername = value;
  }

  // New display name (for sister workflow)
  if (fieldToHeader.newDisplayName) {
    const value = row[fieldToHeader.newDisplayName]?.trim();
    if (value) setup.newDisplayName = value;
  }

  // Profile picture
  if (fieldToHeader.profilePictureUrl) {
    const value = row[fieldToHeader.profilePictureUrl]?.trim();
    if (value) setup.profilePictureUrl = value;
  }

  // Bio
  if (fieldToHeader.bio) {
    const value = row[fieldToHeader.bio]?.trim();
    if (value) setup.bio = value;
  }

  // Post 1
  if (fieldToHeader.post1Description || fieldToHeader.post1MediaUrls) {
    const desc = fieldToHeader.post1Description ? row[fieldToHeader.post1Description]?.trim() || '' : '';
    const mediaUrls = fieldToHeader.post1MediaUrls ? parseMediaUrls(row[fieldToHeader.post1MediaUrls]) : [];
    if (desc || mediaUrls.length > 0) {
      setup.post1 = buildPostContent(desc, mediaUrls);
    }
  }

  // Post 2
  if (fieldToHeader.post2Description || fieldToHeader.post2MediaUrls) {
    const desc = fieldToHeader.post2Description ? row[fieldToHeader.post2Description]?.trim() || '' : '';
    const mediaUrls = fieldToHeader.post2MediaUrls ? parseMediaUrls(row[fieldToHeader.post2MediaUrls]) : [];
    if (desc || mediaUrls.length > 0) {
      setup.post2 = buildPostContent(desc, mediaUrls);
    }
  }

  // Highlight
  if (fieldToHeader.highlightTitle) {
    const title = row[fieldToHeader.highlightTitle]?.trim();
    if (title) {
      setup.highlightTitle = title;
      if (fieldToHeader.highlightCoverUrl) {
        const coverUrl = row[fieldToHeader.highlightCoverUrl]?.trim();
        if (coverUrl) setup.highlightCoverUrl = coverUrl;
      }
    }
  }

  // Return undefined if no setup data was found
  const hasSetupData = Object.keys(setup).length > 0;
  return hasSetupData ? setup : undefined;
}

/**
 * Parse media URLs from a string (comma or semicolon separated)
 */
function parseMediaUrls(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;]/)
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
}

/**
 * Build PostContent from description and media URLs
 * Determines type based on first media URL extension
 */
function buildPostContent(description: string, mediaUrls: string[]): PostContent {
  // Determine type based on file extension of first media URL
  let type: 'video' | 'images' = 'images';
  if (mediaUrls.length > 0) {
    const firstUrl = mediaUrls[0].toLowerCase();
    if (firstUrl.includes('.mp4') || firstUrl.includes('.mov') || firstUrl.includes('.webm')) {
      type = 'video';
    }
  }

  return { description, mediaUrls, type };
}

/**
 * Build RedditPostContent array from CSV row if Reddit post fields are present
 */
function buildRedditPosts(
  row: Record<string, string>,
  fieldToHeader: Partial<Record<AccountField, string>>
): RedditPostContent[] | undefined {
  const posts: RedditPostContent[] = [];

  // Reddit Post 1
  if (fieldToHeader.redditPost1Title || fieldToHeader.redditPost1MediaUrls) {
    const title = fieldToHeader.redditPost1Title ? row[fieldToHeader.redditPost1Title]?.trim() || '' : '';
    const description = fieldToHeader.redditPost1Description ? row[fieldToHeader.redditPost1Description]?.trim() : undefined;
    const community = fieldToHeader.redditPost1Community ? row[fieldToHeader.redditPost1Community]?.trim() || '' : '';
    const mediaUrls = fieldToHeader.redditPost1MediaUrls ? parseMediaUrls(row[fieldToHeader.redditPost1MediaUrls]) : [];

    if (title && community && mediaUrls.length > 0) {
      posts.push(buildRedditPostContent(title, description, community, mediaUrls));
    }
  }

  // Reddit Post 2
  if (fieldToHeader.redditPost2Title || fieldToHeader.redditPost2MediaUrls) {
    const title = fieldToHeader.redditPost2Title ? row[fieldToHeader.redditPost2Title]?.trim() || '' : '';
    const description = fieldToHeader.redditPost2Description ? row[fieldToHeader.redditPost2Description]?.trim() : undefined;
    const community = fieldToHeader.redditPost2Community ? row[fieldToHeader.redditPost2Community]?.trim() || '' : '';
    const mediaUrls = fieldToHeader.redditPost2MediaUrls ? parseMediaUrls(row[fieldToHeader.redditPost2MediaUrls]) : [];

    if (title && community && mediaUrls.length > 0) {
      posts.push(buildRedditPostContent(title, description, community, mediaUrls));
    }
  }

  return posts.length > 0 ? posts : undefined;
}

/**
 * Build RedditPostContent from title, description, community, and media URLs
 * Determines type based on first media URL extension
 */
function buildRedditPostContent(
  title: string,
  description: string | undefined,
  community: string,
  mediaUrls: string[]
): RedditPostContent {
  // Determine type based on file extension of first media URL
  let type: 'video' | 'images' = 'images';
  if (mediaUrls.length > 0) {
    const firstUrl = mediaUrls[0].toLowerCase();
    if (firstUrl.includes('.mp4') || firstUrl.includes('.mov') || firstUrl.includes('.webm')) {
      type = 'video';
    }
  }

  return { title, description, community, mediaUrls, type };
}

/**
 * Validate that required fields are mapped
 */
export function validateMapping(mapping: HeaderMapping): { valid: boolean; missing: string[] } {
  const mappedFields = new Set(Object.values(mapping).filter(Boolean));
  const missing: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    if (!mappedFields.has(field)) {
      missing.push(field);
    }
  }

  return { valid: missing.length === 0, missing };
}

/**
 * Read file as text
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
