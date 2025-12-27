/**
 * GeeLark API response wrapper
 */
export interface GeeLarkResponse<T = unknown> {
  code: number;
  msg: string;
  data: T;
}

/**
 * Phone from list endpoint
 */
export interface GeeLarkPhone {
  id: string;
  serialName: string;
  /** Phone display name (can be renamed via API) */
  name?: string;
  groupId?: string;
  groupName?: string;
  status?: number;
  openStatus?: number;
}

/**
 * Phone list response data
 */
export interface PhoneListData {
  items: GeeLarkPhone[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Task query response item
 *
 * From Query Task documentation
 */
export interface TaskQueryItem {
  id: string;
  planName?: string;
  taskType?: number;
  serialName?: string;
  envId?: string;
  scheduleAt?: number;
  status: number;
  failCode?: number;
  failDesc?: string;
  cost?: number;
  shareLink?: string;
}

/**
 * Task query response data
 */
export interface TaskQueryData {
  total: number;
  items: TaskQueryItem[];
}

/**
 * Task creation response data
 */
export interface TaskCreateData {
  taskId: string;
}

/**
 * Installed app info
 */
export interface InstalledApp {
  appId: string;
  appVersionId: string;
  packageName: string;
  appName: string;
}

/**
 * Installed apps response data
 */
export interface InstalledAppsData {
  apps: InstalledApp[];
}

/**
 * Phone status response data from /open/v1/phone/status
 *
 * Status values:
 * 0 = Started (running)
 * 1 = Starting
 * 2 = Shut down (offline)
 * 3 = Expired
 */
export interface PhoneStatusData {
  id: string;
  serialName?: string;
  status: number;
}

/**
 * Phone status query response wrapper
 */
export interface PhoneStatusQueryData {
  totalAmount: number;
  successAmount: number;
  failAmount: number;
  successDetails: PhoneStatusData[];
}

/**
 * Phone group from groups list endpoint
 */
export interface GeeLarkGroup {
  id: string;
  name: string;
  phoneCount?: number;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Phone groups list response data
 */
export interface GroupListData {
  list: GeeLarkGroup[];
  total?: number;
}

/**
 * App version info (from appVersionList)
 */
export interface AppVersion {
  id: string;
  versionCode: number;
  versionName: string;
}

/**
 * Marketplace app info
 */
export interface MarketplaceApp {
  id: string;
  appName: string;
  appIcon?: string;
  appVersionList: AppVersion[];
}

/**
 * Marketplace apps list response data
 */
export interface MarketplaceAppsData {
  items: MarketplaceApp[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Known GeeLark error codes
 *
 * Global errors (40xxx):
 * - 40000: Unknown error
 * - 40001: Failed to read request body
 * - 40004: Request parameter validation failed
 * - 40005: Requested resource does not exist
 * - 40006: Partial success (batch APIs)
 * - 40007: Rate limited (resets next minute)
 * - 40008: Invalid pagination parameters
 * - 41001: Balance not enough
 * - 47002: Too many concurrent requests
 *
 * Cloud phone errors (42xxx):
 * - 42001: Cloud phone does not exist
 * - 42002: Cloud phone not in running state
 * - 42003: App is currently being installed
 * - 42004: Higher version already installed
 * - 42005: App not installed (Start Application endpoint)
 * - 42006: App does not exist (Install Application / RPA endpoints)
 */
export const GEELARK_ERROR_CODES = {
  SUCCESS: 0,

  // Global errors
  UNKNOWN_ERROR: 40000,
  FAILED_READ_BODY: 40001,
  PARAM_VALIDATION_FAILED: 40004,
  RESOURCE_NOT_FOUND: 40005,
  PARTIAL_SUCCESS: 40006,
  RATE_LIMITED: 40007,
  INVALID_PAGINATION: 40008,
  BALANCE_NOT_ENOUGH: 41001,
  TOO_MANY_CONCURRENT: 47002,

  // Cloud phone errors
  ENV_NOT_EXIST: 42001,
  ENV_NOT_RUNNING: 42002,
  APP_BEING_INSTALLED: 42003,
  APP_HIGHER_VERSION_EXISTS: 42004,
  APP_NOT_INSTALLED_START: 42005, // Start Application endpoint
  APP_NOT_INSTALLED: 42006,       // Install/RPA endpoints
} as const;

/**
 * Phone status values from /open/v1/phone/status
 */
export const PHONE_STATUS = {
  STARTED: 0,      // Running
  STARTING: 1,     // Booting up
  SHUT_DOWN: 2,    // Offline
  EXPIRED: 3,      // Expired
} as const;

/**
 * Known task statuses from GeeLark API
 *
 * From Query Task documentation:
 * 1 = Waiting
 * 2 = In progress
 * 3 = Completed
 * 4 = Failed
 * 7 = Cancelled
 */
export const TASK_STATUS = {
  WAITING: 1,
  IN_PROGRESS: 2,
  COMPLETED: 3,
  FAILED: 4,
  CANCELLED: 7,
} as const;

/**
 * Check if task status is terminal (completed, failed, or cancelled)
 */
export function isTerminalTaskStatus(status: number | string): boolean {
  const numStatus = typeof status === 'string' ? parseInt(status, 10) : status;
  return (
    numStatus === TASK_STATUS.COMPLETED ||
    numStatus === TASK_STATUS.FAILED ||
    numStatus === TASK_STATUS.CANCELLED
  );
}

/**
 * Check if task succeeded (status = 3)
 */
export function isTaskSuccess(status: number | string): boolean {
  const numStatus = typeof status === 'string' ? parseInt(status, 10) : status;
  return numStatus === TASK_STATUS.COMPLETED;
}

/**
 * Check if task failed (status = 4 or 7)
 */
export function isTaskFailed(status: number | string): boolean {
  const numStatus = typeof status === 'string' ? parseInt(status, 10) : status;
  return numStatus === TASK_STATUS.FAILED || numStatus === TASK_STATUS.CANCELLED;
}

/**
 * Screenshot request response data
 */
export interface ScreenshotRequestData {
  taskId: string;
}

/**
 * Screenshot result response data
 *
 * Status values:
 * 0 = Acquisition failed
 * 1 = In progress
 * 2 = Execution succeeded
 * 3 = Execution failed
 */
export interface ScreenshotResultData {
  status: number;
  downloadLink?: string;
}

/**
 * Screenshot status values
 */
export const SCREENSHOT_STATUS = {
  ACQUISITION_FAILED: 0,
  IN_PROGRESS: 1,
  SUCCEEDED: 2,
  EXECUTION_FAILED: 3,
} as const;

/**
 * Task flow from task flow query endpoint
 */
export interface TaskFlow {
  id: string;
  title: string;
  desc: string;
  params: string[];
}

/**
 * Task flow list response data
 */
export interface TaskFlowListData {
  total: number;
  page: number;
  pageSize: number;
  items: TaskFlow[];
}

/**
 * Phone update response data from /open/v1/phone/detail/update
 */
export interface PhoneUpdateData {
  /** Tag addition failure details (if any) */
  failDetails?: Array<{
    code: number;
    id: number;
    msg: string;
  }>;
}

/**
 * Parameters for modifying phone information
 */
export interface ModifyPhoneParams {
  /** Cloud phone ID (required) */
  id: string;
  /** New phone name (up to 100 characters) */
  name?: string;
  /** New phone remark (up to 1500 characters) */
  remark?: string;
  /** New group ID */
  groupId?: string;
  /** New tag IDs */
  tagIds?: string[];
  /** Proxy ID */
  proxyId?: string;
}
