/**
 * Target application for workflows
 */
export type TargetApp = 'instagram' | 'reddit';

/**
 * Target app configuration
 */
export interface TargetAppConfig {
  id: TargetApp;
  label: string;
  searchTerm: string;
  icon: string;
  phoneNameSuffix: string;
}

export const TARGET_APP_CONFIGS: Record<TargetApp, TargetAppConfig> = {
  instagram: {
    id: 'instagram',
    label: 'Instagram',
    searchTerm: 'instagram',
    icon: 'Instagram',
    phoneNameSuffix: ' Instagram',
  },
  reddit: {
    id: 'reddit',
    label: 'Reddit',
    searchTerm: 'reddit',
    icon: 'MessageSquare',
    phoneNameSuffix: ' Reddit',
  },
};

/**
 * Workflow types supported by the state machine
 */
export type WorkflowType =
  // Instagram workflows
  | 'warmup'
  | 'setup'
  | 'sister'
  | 'custom'
  | 'post'
  // Reddit workflows
  | 'reddit_warmup'
  | 'reddit_post';

/**
 * Workflow categories for grouping in UI
 */
export type WorkflowCategory = 'instagram' | 'reddit';

export const WORKFLOW_CATEGORIES: Record<WorkflowType, WorkflowCategory> = {
  // Instagram workflows
  warmup: 'instagram',
  setup: 'instagram',
  sister: 'instagram',
  custom: 'instagram',
  post: 'instagram',
  // Reddit workflows
  reddit_warmup: 'reddit',
  reddit_post: 'reddit',
};

export const WORKFLOW_CATEGORY_LABELS: Record<WorkflowCategory, string> = {
  instagram: 'Instagram Workflows',
  reddit: 'Reddit Workflows',
};

/**
 * Get the target app for a workflow type
 */
export function getWorkflowTargetApp(workflowType: WorkflowType): TargetApp {
  return WORKFLOW_CATEGORIES[workflowType];
}

export const WORKFLOW_LABELS: Record<WorkflowType, string> = {
  // Instagram
  warmup: 'Warmup',
  setup: 'Account Setup',
  sister: 'Sister Account',
  custom: 'Custom Workflow',
  post: 'Post Only',
  // Reddit
  reddit_warmup: 'Reddit Warmup',
  reddit_post: 'Reddit Post',
};

export const WORKFLOW_DESCRIPTIONS: Record<WorkflowType, string> = {
  // Instagram
  warmup: 'Login, warm up account with engagement, optionally publish posts',
  setup: 'Login, set profile picture, bio, create posts, story highlight, set private, enable 2FA',
  sister: 'Login, rename username, set profile picture, set bio (for existing accounts)',
  custom: 'Login, then run any combination of task flows you select',
  post: 'Login and publish posts (no warmup)',
  // Reddit
  reddit_warmup: 'Browse and engage with content to warm up account',
  reddit_post: 'Publish image or video posts to subreddits',
};

// ==================== Phone Verification ====================

/**
 * Phone naming convention for account detection
 * Phones with logged-in accounts are named "{username} {App}"
 * @deprecated Use getPhoneNameSuffix(targetApp) instead
 */
export const PHONE_NAME_SUFFIX = ' Instagram';
/** @deprecated Use getPhoneNamePattern(targetApp) instead */
export const PHONE_NAME_PATTERN = /^(.+) Instagram$/;

/**
 * Get phone name suffix for a target app
 */
export function getPhoneNameSuffix(targetApp: TargetApp): string {
  return TARGET_APP_CONFIGS[targetApp].phoneNameSuffix;
}

/**
 * Get phone name pattern for a target app
 */
export function getPhoneNamePattern(targetApp: TargetApp): RegExp {
  const suffix = TARGET_APP_CONFIGS[targetApp].phoneNameSuffix.trim();
  return new RegExp(`^(.+) ${suffix}$`);
}

/**
 * Result of parsing a phone's name for account detection
 */
export interface ParsedPhoneName {
  /** Whether the phone name matches the naming convention */
  hasAccountName: boolean;
  /** Extracted username from phone name (null if no match) */
  detectedUsername: string | null;
  /** Original phone name */
  originalName: string;
}

/**
 * Phone-to-account verification result
 */
export interface PhoneVerificationResult {
  envId: string;
  serialName: string;
  phoneName: string;
  /** Expected account based on phone_index mapping */
  expectedAccount: AccountData | null;
  /** Detected account from phone name parsing */
  detectedUsername: string | null;
  /** Verification status */
  status: 'matched' | 'mismatched' | 'clean';
  /** Reason for mismatch (if applicable) */
  mismatchReason?: string;
}

/**
 * Phone assignment after verification
 */
export interface PhoneAssignment {
  /** Phones that match their expected account or are clean with assigned account */
  matchedPhones: PhoneVerificationResult[];
  /** Phones with wrong account logged in */
  mismatchedPhones: PhoneVerificationResult[];
  /** Clean phones available as backups (no account detected) */
  backupPhones: PhoneVerificationResult[];
  /** Accounts that need to be reassigned to backup phones */
  pendingAccounts: AccountData[];
}

/**
 * Phone state machine states
 * Each phone progresses through these states independently
 *
 * Shared states (all workflows): INIT → START_ENV → CONFIRM_ENV_RUNNING → INSTALL_IG → CONFIRM_IG_INSTALLED → LOGIN → POLL_LOGIN_TASK
 * Warmup workflow: WARMUP → POLL_WARMUP_TASK → PUBLISH_POST_1/2 → DONE
 * Setup workflow: WARMUP → SET_PROFILE_PICTURE → SET_BIO → SETUP_POST_1/2 → CREATE_STORY_HIGHLIGHT → SET_PRIVATE → ENABLE_2FA → DONE
 * Sister workflow: RENAME_USERNAME → SET_PROFILE_PICTURE → SET_BIO → DONE
 */
export type PhoneState =
  // Shared states (all workflows)
  | 'IDLE'
  | 'INIT'
  | 'START_ENV'
  | 'CONFIRM_ENV_RUNNING'
  | 'INSTALL_APP'           // Generic app install (IG or Reddit)
  | 'CONFIRM_APP_INSTALLED' // Generic app confirm
  | 'INSTALL_IG'            // @deprecated - use INSTALL_APP
  | 'CONFIRM_IG_INSTALLED'  // @deprecated - use CONFIRM_APP_INSTALLED
  | 'LOGIN'
  | 'POLL_LOGIN_TASK'
  | 'RENAME_PHONE' // Rename phone after login to "{username} {App}"
  // Instagram Warmup workflow states
  | 'WARMUP'
  | 'POLL_WARMUP_TASK'
  | 'PUBLISH_POST_1'
  | 'POLL_POST_1_TASK'
  | 'PUBLISH_POST_2'
  | 'POLL_POST_2_TASK'
  // Instagram Setup workflow states
  | 'SET_PROFILE_PICTURE'
  | 'POLL_PROFILE_PICTURE_TASK'
  | 'SET_BIO'
  | 'POLL_BIO_TASK'
  | 'SETUP_POST_1'
  | 'POLL_SETUP_POST_1_TASK'
  | 'SETUP_POST_2'
  | 'POLL_SETUP_POST_2_TASK'
  | 'CREATE_STORY_HIGHLIGHT'
  | 'POLL_STORY_HIGHLIGHT_TASK'
  | 'SET_PRIVATE'
  | 'POLL_SET_PRIVATE_TASK'
  | 'ENABLE_2FA'
  | 'POLL_2FA_TASK'
  // Instagram Sister workflow states
  | 'RENAME_USERNAME'
  | 'POLL_RENAME_USERNAME_TASK'
  | 'EDIT_DISPLAY_NAME'
  | 'POLL_EDIT_DISPLAY_NAME_TASK'
  // Reddit workflow states
  | 'REDDIT_WARMUP'
  | 'POLL_REDDIT_WARMUP_TASK'
  | 'REDDIT_POST'
  | 'POLL_REDDIT_POST_TASK'
  // Terminal states
  | 'DONE'
  | 'FAILED';

/**
 * Retryable states that support exponential backoff
 */
export type RetryableState =
  // Shared states
  | 'START_ENV'
  | 'CONFIRM_ENV_RUNNING'
  | 'INSTALL_APP'
  | 'CONFIRM_APP_INSTALLED'
  | 'INSTALL_IG'           // @deprecated
  | 'CONFIRM_IG_INSTALLED' // @deprecated
  | 'LOGIN'
  | 'RENAME_PHONE'
  // Instagram Warmup workflow states
  | 'WARMUP'
  | 'PUBLISH_POST_1'
  | 'PUBLISH_POST_2'
  // Instagram Setup workflow states
  | 'SET_PROFILE_PICTURE'
  | 'SET_BIO'
  | 'SETUP_POST_1'
  | 'SETUP_POST_2'
  | 'CREATE_STORY_HIGHLIGHT'
  | 'SET_PRIVATE'
  | 'ENABLE_2FA'
  // Instagram Sister workflow states
  | 'RENAME_USERNAME'
  | 'EDIT_DISPLAY_NAME'
  // Reddit workflow states
  | 'REDDIT_WARMUP'
  | 'REDDIT_POST';

/**
 * Instagram post content data for publishing
 */
export interface PostContent {
  description: string;
  mediaUrls: string[]; // Video or image URLs/file references
  type: 'video' | 'images';
}

/**
 * Reddit post content data for publishing
 */
export interface RedditPostContent {
  title: string;           // Post title (required)
  description?: string;    // Post body/description (optional)
  community: string;       // Target subreddit (without r/ prefix)
  mediaUrls: string[];     // Video or image URLs
  type: 'video' | 'images';
}

/**
 * Setup workflow data for account profile configuration
 */
export interface SetupData {
  profilePictureUrl?: string;
  bio?: string;
  post1?: PostContent;
  post2?: PostContent;
  highlightTitle?: string;
  highlightCoverUrl?: string;
  /** New username for Sister workflow (rename existing account) */
  newUsername?: string;
  /** New display name for Sister workflow (edit display name) */
  newDisplayName?: string;
}

/**
 * Account data from the sheet
 */
export interface AccountData {
  row_number: number;
  username: string;
  password: string;
  /** 2FA secret for TOTP code generation (used with custom 2FA login flow) */
  twoFactorSecret?: string;
  /** Target app for this account (defaults based on workflow) */
  targetApp?: TargetApp;
  /** Assigned device ID (for tracking 1:1 device-account mapping) */
  assignedDeviceId?: string;
  /** Assigned proxy configuration */
  assignedProxy?: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    type?: 'http' | 'socks5';
  };
  flags: {
    runWarmup?: boolean;
    warmupBrowseVideo?: number;
    accountType?: 'reels' | 'posts';
    /** Reddit warmup keyword for browsing */
    redditWarmupKeyword?: string;
  };
  /** Instagram posts to publish (up to 2) - for Warmup workflow */
  posts?: PostContent[];
  /** Setup workflow data (profile picture, bio, posts, highlight) */
  setup?: SetupData;
  /** Reddit posts to publish */
  redditPosts?: RedditPostContent[];
}

/**
 * GeeLark task status values
 * 1 = Waiting, 2 = In Progress, 3 = Completed, 4 = Failed, 7 = Cancelled
 */
export type TaskStatusValue = 1 | 2 | 3 | 4 | 7 | null;

/**
 * Screenshot captured at a workflow step
 */
export interface WorkflowScreenshot {
  step: string;
  url: string;
  capturedAt: number;
}

/**
 * Represents a single phone job with its state and metadata
 */
export interface PhoneJob {
  envId: string;
  serialName: string;
  phone_index: number;
  account: AccountData | null;
  state: PhoneState;
  attempts: Partial<Record<RetryableState, number>>;
  tasks: {
    // Shared
    loginTaskId: string | null;
    // Instagram Warmup workflow
    warmupTaskId: string | null;
    post1TaskId: string | null;
    post2TaskId: string | null;
    // Instagram Setup workflow
    profilePictureTaskId: string | null;
    bioTaskId: string | null;
    setupPost1TaskId: string | null;
    setupPost2TaskId: string | null;
    storyHighlightTaskId: string | null;
    setPrivateTaskId: string | null;
    enable2FATaskId: string | null;
    // Instagram Sister workflow
    renameUsernameTaskId: string | null;
    editDisplayNameTaskId: string | null;
    // Reddit workflow
    redditWarmupTaskId: string | null;
    redditPostTaskId: string | null;
  };
  /** Current GeeLark task status (1=Waiting, 2=In Progress, 3=Completed, 4=Failed, 7=Cancelled) */
  currentTaskStatus: TaskStatusValue;
  /** Type of task currently being tracked */
  currentTaskType: 'login' | 'warmup' | 'publish' | 'setup' | null;
  /** Screenshots captured at various workflow steps */
  screenshots: WorkflowScreenshot[];
  lastError: string | null;
  timestamps: {
    startedAt: number;
    updatedAt: number;
    stateEnteredAt: number;
  };
  progress: {
    currentStep: number;
    totalSteps: number;
  };
  /** Username generation state for smart retries when username is taken */
  usernameGeneration?: {
    /** Generated username candidates based on display name */
    generatedUsernames: string[];
    /** Set of usernames that have been attempted */
    attemptedUsernames: string[];
    /** Current username being tried */
    currentUsername: string | null;
    /** Original username from account data (if any) */
    originalUsername: string | null;
  };
  /** Phone verification result (if verification was performed) */
  verification?: PhoneVerificationResult;
  /** Whether this phone was swapped in as a backup */
  isBackupPhone?: boolean;
  /** Original phone that was replaced (if this is a backup) */
  replacedPhoneEnvId?: string;
}

/**
 * Setup workflow task flow IDs for custom GeeLark RPA tasks
 */
export interface SetupFlowIds {
  setProfilePicture?: string;
  setBio?: string;
  createPost?: string;
  createStoryHighlight?: string;
  setPrivate?: string;
  enable2FA?: string;
  /** Sister workflow: Rename username */
  renameUsername?: string;
  /** Sister workflow: Edit display name */
  editDisplayName?: string;
}

/**
 * Selected warmup day for the current run
 */
export type WarmupDay = 'day0' | 'day1_2' | 'day3_7';

/**
 * Warmup protocol configuration for new Instagram accounts
 *
 * The protocol defines a graduated engagement strategy:
 * - Day 0: Initial setup with minimal engagement
 * - Day 1-2: Light engagement to establish activity
 * - Day 3-7: Increased engagement with optional posting
 */
export interface WarmupProtocolConfig {
  /** Which day's settings to use for this warmup run */
  selectedDay: WarmupDay;
  /** Day 0 settings (immediately after account creation) */
  day0: {
    /** Wait time before starting warmup (minutes) */
    waitMinutes: { min: number; max: number };
    /** Whether to add profile photo on Day 0 */
    addProfilePhoto: boolean;
    /** Whether to add bio on Day 0 */
    addBio: boolean;
    /** Number of accounts to follow */
    followCount: { min: number; max: number };
    /** Scroll/browse duration (minutes) */
    scrollMinutes: { min: number; max: number };
  };
  /** Day 1-2 settings (light warmup phase) */
  day1_2: {
    /** Scroll/browse duration (minutes) */
    scrollMinutes: { min: number; max: number };
    /** Number of posts to like */
    likeCount: { min: number; max: number };
    /** Number of accounts to follow */
    followCount: { min: number; max: number };
  };
  /** Day 3-7 settings (increased activity phase) */
  day3_7: {
    /** Whether to post a photo (optional) */
    postPhoto: boolean;
    /** Maximum follows per day */
    maxFollowsPerDay: number;
    /** Maximum likes per day */
    maxLikesPerDay: number;
  };
}

/**
 * Labels for warmup day selection
 */
export const WARMUP_DAY_LABELS: Record<WarmupDay, string> = {
  day0: 'Day 0 (After Creation)',
  day1_2: 'Day 1-2 (Light Warmup)',
  day3_7: 'Day 3-7 (Full Activity)',
};

/**
 * Descriptions for warmup day selection
 */
export const WARMUP_DAY_DESCRIPTIONS: Record<WarmupDay, string> = {
  day0: 'Add profile photo, bio, follow 3-5 accounts, scroll 2-3 min',
  day1_2: 'Scroll 3-5 min, like 2-3 posts, follow up to 5 accounts',
  day3_7: 'Optional photo post, follow max 15/day, like max 20/day',
};

/**
 * Default warmup protocol configuration
 * Based on the recommended warmup SOP for new Instagram accounts
 */
export const DEFAULT_WARMUP_PROTOCOL: WarmupProtocolConfig = {
  selectedDay: 'day1_2', // Most common warmup scenario
  day0: {
    waitMinutes: { min: 3, max: 5 },
    addProfilePhoto: true,
    addBio: true,
    followCount: { min: 3, max: 5 },
    scrollMinutes: { min: 2, max: 3 },
  },
  day1_2: {
    scrollMinutes: { min: 3, max: 5 },
    likeCount: { min: 2, max: 3 },
    followCount: { min: 0, max: 5 },
  },
  day3_7: {
    postPhoto: false, // Optional
    maxFollowsPerDay: 15,
    maxLikesPerDay: 20,
  },
};

/**
 * Workflow configuration
 */
export interface WorkflowConfig {
  apiToken: string;
  groupName: string;
  sheetRows: AccountData[];
  igAppVersionId: string;
  concurrencyLimit: number;
  maxRetriesPerStage: number;
  baseBackoffSeconds: number;
  pollIntervalSeconds: number;
  pollTimeoutSeconds: number;
  /** Optional custom login flow ID for 2FA login (uses /open/v1/task/rpa/add instead of instagramLogin) */
  customLoginFlowId?: string;
  /** Parameter names expected by the custom login flow (from Task Flow Query) */
  customLoginFlowParams?: string[];
  /** Workflow type to run (warmup or setup) */
  workflowType: WorkflowType;
  /** Custom task flow IDs for Setup workflow operations */
  setupFlowIds?: SetupFlowIds;
  /** Warmup protocol configuration with engagement limits */
  warmupProtocol?: WarmupProtocolConfig;
}

/**
 * Overall workflow state
 */
export type WorkflowStatus = 'idle' | 'running' | 'stopping' | 'stopped' | 'completed';

export interface WorkflowState {
  status: WorkflowStatus;
  phones: Map<string, PhoneJob>;
  logs: LogEntry[];
  startedAt: number | null;
  completedAt: number | null;
}

/**
 * Log entry structure
 */
export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  phoneId?: string;
  phoneName?: string;
  state?: PhoneState;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * SSE event types
 */
export type WorkflowEventType = 'phone_update' | 'log' | 'workflow_status' | 'results';

export interface WorkflowEvent {
  type: WorkflowEventType;
  payload: PhoneJob | LogEntry | { status: WorkflowStatus } | ResultsSummary;
}

/**
 * Results summary
 */
export interface ResultsSummary {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  pending: number;
  failedPhones: Array<{
    envId: string;
    serialName: string;
    username: string | null;
    error: string;
  }>;
}

/**
 * State transition map - defines valid transitions
 * Note: Actual transitions may be overridden by workflow strategies
 */
export const STATE_TRANSITIONS: Record<PhoneState, PhoneState | null> = {
  // Shared states
  IDLE: 'INIT',
  INIT: 'START_ENV',
  START_ENV: 'CONFIRM_ENV_RUNNING',
  CONFIRM_ENV_RUNNING: 'INSTALL_IG',
  INSTALL_APP: 'CONFIRM_APP_INSTALLED',
  CONFIRM_APP_INSTALLED: 'LOGIN',
  INSTALL_IG: 'CONFIRM_IG_INSTALLED',
  CONFIRM_IG_INSTALLED: 'LOGIN',
  LOGIN: 'POLL_LOGIN_TASK',
  POLL_LOGIN_TASK: 'RENAME_PHONE', // Then workflow strategy determines next state
  RENAME_PHONE: 'WARMUP', // Workflow strategy determines actual next state
  // Instagram Warmup workflow states
  WARMUP: 'POLL_WARMUP_TASK',
  POLL_WARMUP_TASK: 'PUBLISH_POST_1', // or skip to DONE if no posts
  PUBLISH_POST_1: 'POLL_POST_1_TASK',
  POLL_POST_1_TASK: 'PUBLISH_POST_2', // or skip to DONE if no second post
  PUBLISH_POST_2: 'POLL_POST_2_TASK',
  POLL_POST_2_TASK: 'DONE',
  // Instagram Setup workflow states
  SET_PROFILE_PICTURE: 'POLL_PROFILE_PICTURE_TASK',
  POLL_PROFILE_PICTURE_TASK: 'SET_BIO', // or skip to next available step
  SET_BIO: 'POLL_BIO_TASK',
  POLL_BIO_TASK: 'SETUP_POST_1',
  SETUP_POST_1: 'POLL_SETUP_POST_1_TASK',
  POLL_SETUP_POST_1_TASK: 'SETUP_POST_2',
  SETUP_POST_2: 'POLL_SETUP_POST_2_TASK',
  POLL_SETUP_POST_2_TASK: 'CREATE_STORY_HIGHLIGHT',
  CREATE_STORY_HIGHLIGHT: 'POLL_STORY_HIGHLIGHT_TASK',
  POLL_STORY_HIGHLIGHT_TASK: 'SET_PRIVATE',
  SET_PRIVATE: 'POLL_SET_PRIVATE_TASK',
  POLL_SET_PRIVATE_TASK: 'ENABLE_2FA',
  ENABLE_2FA: 'POLL_2FA_TASK',
  POLL_2FA_TASK: 'DONE',
  // Instagram Sister workflow states
  RENAME_USERNAME: 'POLL_RENAME_USERNAME_TASK',
  POLL_RENAME_USERNAME_TASK: 'EDIT_DISPLAY_NAME',
  EDIT_DISPLAY_NAME: 'POLL_EDIT_DISPLAY_NAME_TASK',
  POLL_EDIT_DISPLAY_NAME_TASK: 'SET_PROFILE_PICTURE', // Then continues to profile setup
  // Reddit workflow states
  REDDIT_WARMUP: 'POLL_REDDIT_WARMUP_TASK',
  POLL_REDDIT_WARMUP_TASK: 'REDDIT_POST', // or skip to DONE if no posts
  REDDIT_POST: 'POLL_REDDIT_POST_TASK',
  POLL_REDDIT_POST_TASK: 'DONE',
  // Terminal states
  DONE: null,
  FAILED: null,
};

/**
 * State to step number mapping for progress tracking
 * Setup workflow has more steps, so step numbers are workflow-specific
 */
export const STATE_STEP_MAP: Record<PhoneState, number> = {
  // Shared states (0-8)
  IDLE: 0,
  INIT: 1,
  START_ENV: 2,
  CONFIRM_ENV_RUNNING: 3,
  INSTALL_APP: 4,           // Generic install
  CONFIRM_APP_INSTALLED: 5, // Generic install confirm
  INSTALL_IG: 4,            // @deprecated
  CONFIRM_IG_INSTALLED: 5,  // @deprecated
  LOGIN: 6,
  POLL_LOGIN_TASK: 7,
  RENAME_PHONE: 8,
  // Instagram Warmup workflow states (9-14)
  WARMUP: 9,
  POLL_WARMUP_TASK: 10,
  PUBLISH_POST_1: 11,
  POLL_POST_1_TASK: 12,
  PUBLISH_POST_2: 13,
  POLL_POST_2_TASK: 14,
  // Instagram Setup workflow states (9-22)
  SET_PROFILE_PICTURE: 9,
  POLL_PROFILE_PICTURE_TASK: 10,
  SET_BIO: 11,
  POLL_BIO_TASK: 12,
  SETUP_POST_1: 13,
  POLL_SETUP_POST_1_TASK: 14,
  SETUP_POST_2: 15,
  POLL_SETUP_POST_2_TASK: 16,
  CREATE_STORY_HIGHLIGHT: 17,
  POLL_STORY_HIGHLIGHT_TASK: 18,
  SET_PRIVATE: 19,
  POLL_SET_PRIVATE_TASK: 20,
  ENABLE_2FA: 21,
  POLL_2FA_TASK: 22,
  // Instagram Sister workflow states (9-16) - reuses some step numbers
  RENAME_USERNAME: 9,
  POLL_RENAME_USERNAME_TASK: 10,
  EDIT_DISPLAY_NAME: 11,
  POLL_EDIT_DISPLAY_NAME_TASK: 12,
  // Note: Sister reuses SET_PROFILE_PICTURE (13), SET_BIO (15) step numbers
  // Reddit workflow states (9-12)
  REDDIT_WARMUP: 9,
  POLL_REDDIT_WARMUP_TASK: 10,
  REDDIT_POST: 11,
  POLL_REDDIT_POST_TASK: 12,
  // Terminal states
  DONE: 23,
  FAILED: 23,
};

/** Total steps for Instagram Warmup workflow */
export const WARMUP_TOTAL_STEPS = 15;

/** Total steps for Instagram Setup workflow */
export const SETUP_TOTAL_STEPS = 23;

/** Total steps for Instagram Sister workflow */
export const SISTER_TOTAL_STEPS = 15;

/** Total steps for Reddit Warmup workflow */
export const REDDIT_WARMUP_TOTAL_STEPS = 11;

/** Total steps for Reddit Post workflow */
export const REDDIT_POST_TOTAL_STEPS = 13;

/** Get total steps based on workflow type */
export function getTotalSteps(workflowType: WorkflowType): number {
  switch (workflowType) {
    case 'setup':
      return SETUP_TOTAL_STEPS;
    case 'sister':
      return SISTER_TOTAL_STEPS;
    case 'reddit_warmup':
      return REDDIT_WARMUP_TOTAL_STEPS;
    case 'reddit_post':
      return REDDIT_POST_TOTAL_STEPS;
    default:
      return WARMUP_TOTAL_STEPS;
  }
}

/** @deprecated Use getTotalSteps(workflowType) instead */
export const TOTAL_STEPS = 15;

/**
 * Terminal states where processing stops
 */
export const TERMINAL_STATES: PhoneState[] = ['DONE', 'FAILED'];

/**
 * Human-readable state labels for UI
 */
export const STATE_LABELS: Record<PhoneState, string> = {
  // Shared states
  IDLE: 'Idle',
  INIT: 'Initializing',
  START_ENV: 'Starting Environment',
  CONFIRM_ENV_RUNNING: 'Confirming Environment',
  INSTALL_APP: 'Installing App',
  CONFIRM_APP_INSTALLED: 'Confirming Install',
  INSTALL_IG: 'Installing Instagram',       // @deprecated
  CONFIRM_IG_INSTALLED: 'Confirming Install', // @deprecated
  LOGIN: 'Logging In',
  POLL_LOGIN_TASK: 'Verifying Login',
  RENAME_PHONE: 'Renaming Phone',
  // Instagram Warmup workflow states
  WARMUP: 'Warming Up',
  POLL_WARMUP_TASK: 'Verifying Warmup',
  PUBLISH_POST_1: 'Publishing Post 1',
  POLL_POST_1_TASK: 'Verifying Post 1',
  PUBLISH_POST_2: 'Publishing Post 2',
  POLL_POST_2_TASK: 'Verifying Post 2',
  // Instagram Setup workflow states
  SET_PROFILE_PICTURE: 'Setting Profile Picture',
  POLL_PROFILE_PICTURE_TASK: 'Verifying Profile Picture',
  SET_BIO: 'Setting Bio',
  POLL_BIO_TASK: 'Verifying Bio',
  SETUP_POST_1: 'Creating Post 1',
  POLL_SETUP_POST_1_TASK: 'Verifying Post 1',
  SETUP_POST_2: 'Creating Post 2',
  POLL_SETUP_POST_2_TASK: 'Verifying Post 2',
  CREATE_STORY_HIGHLIGHT: 'Creating Story Highlight',
  POLL_STORY_HIGHLIGHT_TASK: 'Verifying Highlight',
  SET_PRIVATE: 'Setting Private',
  POLL_SET_PRIVATE_TASK: 'Verifying Private',
  ENABLE_2FA: 'Enabling 2FA',
  POLL_2FA_TASK: 'Verifying 2FA',
  // Instagram Sister workflow states
  RENAME_USERNAME: 'Renaming Username',
  POLL_RENAME_USERNAME_TASK: 'Verifying Username',
  EDIT_DISPLAY_NAME: 'Editing Display Name',
  POLL_EDIT_DISPLAY_NAME_TASK: 'Verifying Display Name',
  // Reddit workflow states
  REDDIT_WARMUP: 'Browsing Reddit',
  POLL_REDDIT_WARMUP_TASK: 'Verifying Warmup',
  REDDIT_POST: 'Publishing to Reddit',
  POLL_REDDIT_POST_TASK: 'Verifying Post',
  // Terminal states
  DONE: 'Completed',
  FAILED: 'Failed',
};

/**
 * State colors for UI badges
 */
export const STATE_COLORS: Record<PhoneState, string> = {
  // Shared states
  IDLE: 'bg-gray-500!',
  INIT: 'bg-blue-500!',
  START_ENV: 'bg-blue-500!',
  CONFIRM_ENV_RUNNING: 'bg-blue-500!',
  INSTALL_APP: 'bg-purple-500!',
  CONFIRM_APP_INSTALLED: 'bg-purple-500!',
  INSTALL_IG: 'bg-purple-500!',             // @deprecated
  CONFIRM_IG_INSTALLED: 'bg-purple-500!',   // @deprecated
  LOGIN: 'bg-orange-500!',
  POLL_LOGIN_TASK: 'bg-orange-500!',
  RENAME_PHONE: 'bg-lime-500!',
  // Instagram Warmup workflow states
  WARMUP: 'bg-yellow-500!',
  POLL_WARMUP_TASK: 'bg-yellow-500!',
  PUBLISH_POST_1: 'bg-pink-500!',
  POLL_POST_1_TASK: 'bg-pink-500!',
  PUBLISH_POST_2: 'bg-pink-500!',
  POLL_POST_2_TASK: 'bg-pink-500!',
  // Instagram Setup workflow states
  SET_PROFILE_PICTURE: 'bg-cyan-500!',
  POLL_PROFILE_PICTURE_TASK: 'bg-cyan-500!',
  SET_BIO: 'bg-teal-500!',
  POLL_BIO_TASK: 'bg-teal-500!',
  SETUP_POST_1: 'bg-pink-500!',
  POLL_SETUP_POST_1_TASK: 'bg-pink-500!',
  SETUP_POST_2: 'bg-pink-500!',
  POLL_SETUP_POST_2_TASK: 'bg-pink-500!',
  CREATE_STORY_HIGHLIGHT: 'bg-indigo-500!',
  POLL_STORY_HIGHLIGHT_TASK: 'bg-indigo-500!',
  SET_PRIVATE: 'bg-violet-500!',
  POLL_SET_PRIVATE_TASK: 'bg-violet-500!',
  ENABLE_2FA: 'bg-amber-500!',
  POLL_2FA_TASK: 'bg-amber-500!',
  // Instagram Sister workflow states
  RENAME_USERNAME: 'bg-rose-500!',
  POLL_RENAME_USERNAME_TASK: 'bg-rose-500!',
  EDIT_DISPLAY_NAME: 'bg-fuchsia-500!',
  POLL_EDIT_DISPLAY_NAME_TASK: 'bg-fuchsia-500!',
  // Reddit workflow states (orange-red theme for Reddit)
  REDDIT_WARMUP: 'bg-orange-600!',
  POLL_REDDIT_WARMUP_TASK: 'bg-orange-600!',
  REDDIT_POST: 'bg-red-500!',
  POLL_REDDIT_POST_TASK: 'bg-red-500!',
  // Terminal states
  DONE: 'bg-green-500!',
  FAILED: 'bg-red-500!',
};

/**
 * Task status labels for UI
 * Maps GeeLark task status values to human-readable labels
 */
export const TASK_STATUS_LABELS: Record<number, string> = {
  1: 'Waiting',
  2: 'In Progress',
  3: 'Completed',
  4: 'Failed',
  7: 'Cancelled',
};

/**
 * Task status colors for UI badges
 */
export const TASK_STATUS_COLORS: Record<number, string> = {
  1: 'bg-gray-500',    // Waiting
  2: 'bg-blue-500',    // In Progress
  3: 'bg-green-500',   // Completed
  4: 'bg-red-500',     // Failed
  7: 'bg-orange-500',  // Cancelled
};
