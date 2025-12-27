import { GeeLarkPhone } from '@/lib/geelark/types';
import { AccountData, PhoneJob, TOTAL_STEPS } from '@/lib/state-machine/types';

/**
 * Video file extensions for detecting video media
 */
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v', '.wmv', '.flv', '.3gp'];

/**
 * Check if media string contains video file(s)
 * Handles semicolon-separated URLs
 */
function isVideoMedia(media: string | undefined): boolean {
  if (!media) return false;
  const lowerMedia = media.toLowerCase();
  return VIDEO_EXTENSIONS.some(ext => lowerMedia.includes(ext));
}

/**
 * Extract numeric suffix from a serial name
 * Examples:
 *   "Phone 1" -> 1
 *   "Phone_001" -> 1
 *   "Device42" -> 42
 *   "Phone" -> 0 (no number)
 */
export function extractNumericSuffix(serialName: string): number {
  // Match trailing digits
  const match = serialName.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Sort phones by serial name numeric suffix
 * This ensures deterministic ordering across runs
 */
export function sortPhonesBySerialName(phones: GeeLarkPhone[]): GeeLarkPhone[] {
  return [...phones].sort((a, b) => {
    const numA = extractNumericSuffix(a.serialName);
    const numB = extractNumericSuffix(b.serialName);
    return numA - numB;
  });
}

/**
 * Match phones to accounts by index
 *
 * Deterministic mapping rule:
 * - Sort phones by serialName numeric suffix
 * - Assign phone_index = position_in_sorted_list + 1
 * - Join to sheet row where row_number == phone_index
 *
 * @param phones - Unsorted phones from GeeLark API
 * @param accounts - Account data from sheet
 * @returns Map of envId to AccountData (or null if no match)
 */
export function matchPhonesToAccounts(
  phones: GeeLarkPhone[],
  accounts: AccountData[]
): Map<string, AccountData | null> {
  const sortedPhones = sortPhonesBySerialName(phones);
  const mapping = new Map<string, AccountData | null>();

  sortedPhones.forEach((phone, index) => {
    // phone_index is 1-based (matches row_number)
    const phoneIndex = index + 1;
    const account = accounts.find((a) => a.row_number === phoneIndex) || null;
    mapping.set(phone.id, account);
  });

  return mapping;
}

/**
 * Create initial PhoneJob objects from phones and accounts
 *
 * IMPORTANT: The number of accounts constrains the workflow.
 * Only phones that have a matching account will be processed.
 * If there are 50 phones but only 10 accounts, only 10 phones are created.
 *
 * @param phones - Phones from GeeLark API (will be sorted)
 * @param accounts - Account data from sheet
 * @returns Array of initialized PhoneJob objects (one per account)
 */
export function createPhoneJobs(
  phones: GeeLarkPhone[],
  accounts: AccountData[]
): PhoneJob[] {
  const sortedPhones = sortPhonesBySerialName(phones);
  const now = Date.now();

  // Only process phones up to the number of accounts
  // This ensures we never process more phones than we have accounts for
  const phonesToProcess = sortedPhones.slice(0, accounts.length);

  return phonesToProcess.map((phone, index) => {
    const phoneIndex = index + 1;
    const account = accounts.find((a) => a.row_number === phoneIndex) || null;

    const job: PhoneJob = {
      envId: phone.id,
      serialName: phone.serialName,
      phone_index: phoneIndex,
      account,
      state: 'IDLE',
      attempts: {},
      tasks: {
        // Shared
        loginTaskId: null,
        // Instagram Warmup workflow
        warmupTaskId: null,
        post1TaskId: null,
        post2TaskId: null,
        // Instagram Setup workflow
        profilePictureTaskId: null,
        bioTaskId: null,
        setupPost1TaskId: null,
        setupPost2TaskId: null,
        storyHighlightTaskId: null,
        setPrivateTaskId: null,
        enable2FATaskId: null,
        // Instagram Sister workflow
        renameUsernameTaskId: null,
        editDisplayNameTaskId: null,
        // Reddit workflow
        redditWarmupTaskId: null,
        redditPostTaskId: null,
      },
      currentTaskStatus: null,
      currentTaskType: null,
      screenshots: [],
      lastError: null,
      timestamps: {
        startedAt: now,
        updatedAt: now,
        stateEnteredAt: now,
      },
      progress: {
        currentStep: 0,
        totalSteps: TOTAL_STEPS, // Will be updated by PhoneStateMachine based on workflow type
      },
    };

    return job;
  });
}

/**
 * Parse TSV (tab-separated values) string into AccountData array
 *
 * Expected format per line:
 *   username\tpassword[\ttwoFactorSecret\trunWarmup\tbrowseVideo\taccountType]
 *
 * @param tsv - Tab-separated string
 * @returns Array of AccountData
 */
export function parseTSV(tsv: string): AccountData[] {
  const lines = tsv.trim().split('\n');

  return lines.map((line, index) => {
    const parts = line.split('\t').map((p) => p.trim());
    const [username, password, twoFactorSecret, runWarmupStr, browseVideoStr, accountType] = parts;

    return {
      row_number: index + 1,
      username: username || '',
      password: password || '',
      twoFactorSecret: twoFactorSecret || undefined,
      flags: {
        runWarmup: runWarmupStr?.toLowerCase() === 'true' || runWarmupStr === '1',
        warmupBrowseVideo: browseVideoStr ? parseInt(browseVideoStr, 10) : undefined,
        accountType: (accountType as 'reels' | 'posts') || undefined,
      },
    };
  });
}

/**
 * Parse CSV string into AccountData array
 * Handles both comma and tab separators
 * Automatically skips header rows (lines starting with common header names)
 *
 * Column order: username, password, twoFactorSecret, runWarmup, browseVideo, accountType,
 *               newUsername, newDisplayName, profilePictureUrl, bio,
 *               post1Desc, post1Media, post2Desc, post2Media, highlightTitle, highlightCover
 *
 * @param csv - CSV or TSV string
 * @returns Array of AccountData
 */
export function parseCSV(csv: string): AccountData[] {
  const lines = csv.trim().split('\n');
  const headerPatterns = ['username', 'user', 'email', 'account', 'login'];

  // Filter out header rows
  const dataLines = lines.filter((line) => {
    const firstValue = line.split(/[,\t]/)[0].trim().toLowerCase();
    return !headerPatterns.includes(firstValue);
  });

  return dataLines.map((line, index) => {
    // Detect separator (tab or comma)
    const separator = line.includes('\t') ? '\t' : ',';
    const parts = line.split(separator).map((p) => p.trim());

    // Core fields (indices 0-5)
    const [username, password, twoFactorSecret, runWarmupStr, browseVideoStr, accountType] = parts;

    // Setup/Sister fields (indices 6-15)
    const newUsername = parts[6] || '';
    const newDisplayName = parts[7] || '';
    const profilePictureUrl = parts[8] || '';
    const bio = parts[9] || '';
    const post1Desc = parts[10] || '';
    const post1Media = parts[11] || '';
    const post2Desc = parts[12] || '';
    const post2Media = parts[13] || '';
    const highlightTitle = parts[14] || '';
    const highlightCoverUrl = parts[15] || '';

    // Build setup object only if any setup fields are present
    const hasSetupFields = newUsername || newDisplayName || profilePictureUrl || bio ||
                           post1Desc || post1Media || post2Desc || post2Media ||
                           highlightTitle || highlightCoverUrl;

    const setup = hasSetupFields ? {
      newUsername: newUsername || undefined,
      newDisplayName: newDisplayName || undefined,
      profilePictureUrl: profilePictureUrl || undefined,
      bio: bio || undefined,
      post1: (post1Desc || post1Media) ? {
        description: post1Desc,
        mediaUrls: post1Media ? post1Media.split(';').filter(Boolean) : [],
        type: isVideoMedia(post1Media) ? 'video' as const : 'images' as const,
      } : undefined,
      post2: (post2Desc || post2Media) ? {
        description: post2Desc,
        mediaUrls: post2Media ? post2Media.split(';').filter(Boolean) : [],
        type: isVideoMedia(post2Media) ? 'video' as const : 'images' as const,
      } : undefined,
      highlightTitle: highlightTitle || undefined,
      highlightCoverUrl: highlightCoverUrl || undefined,
    } : undefined;

    // Build posts array for warmup workflow (uses account.posts)
    // Setup/sister workflows use account.setup.post1/post2 instead
    const posts: { description: string; mediaUrls: string[]; type: 'video' | 'images' }[] = [];
    if (post1Desc || post1Media) {
      posts.push({
        description: post1Desc,
        mediaUrls: post1Media ? post1Media.split(';').filter(Boolean) : [],
        type: isVideoMedia(post1Media) ? 'video' : 'images',
      });
    }
    if (post2Desc || post2Media) {
      posts.push({
        description: post2Desc,
        mediaUrls: post2Media ? post2Media.split(';').filter(Boolean) : [],
        type: isVideoMedia(post2Media) ? 'video' : 'images',
      });
    }

    return {
      row_number: index + 1,
      username: username || '',
      password: password || '',
      twoFactorSecret: twoFactorSecret || undefined,
      flags: {
        runWarmup: runWarmupStr?.toLowerCase() === 'true' || runWarmupStr === '1',
        warmupBrowseVideo: browseVideoStr ? parseInt(browseVideoStr, 10) : undefined,
        accountType: (accountType as 'reels' | 'posts') || undefined,
      },
      posts: posts.length > 0 ? posts : undefined,
      setup,
    };
  });
}
