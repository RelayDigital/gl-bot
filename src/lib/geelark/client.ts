import {
  GeeLarkResponse,
  PhoneListData,
  TaskQueryData,
  TaskCreateData,
  InstalledAppsData,
  PhoneStatusData,
  PhoneStatusQueryData,
  GeeLarkPhone,
  GroupListData,
  MarketplaceAppsData,
  GeeLarkGroup,
  MarketplaceApp,
  ScreenshotRequestData,
  ScreenshotResultData,
  TaskFlowListData,
  TaskFlow,
  PhoneUpdateData,
  ModifyPhoneParams,
} from './types';

/**
 * GeeLark API client with Bearer token authentication
 */
export class GeeLarkClient {
  private baseUrl: string;
  private token: string;

  constructor(token?: string, baseUrl?: string) {
    this.token = token || process.env.GEELARK_API_TOKEN || '';
    this.baseUrl = baseUrl || process.env.GEELARK_API_BASE_URL || 'https://openapi.geelark.com';

    if (!this.token) {
      throw new Error('GeeLark API token is required. Set GEELARK_API_TOKEN environment variable.');
    }
  }

  /**
   * Make an authenticated POST request to GeeLark API
   */
  private async request<T>(
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<GeeLarkResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`GeeLark API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * List phones in a group
   * POST /open/v1/phone/list
   */
  async listPhones(
    groupName: string,
    page: number = 1,
    pageSize: number = 100
  ): Promise<GeeLarkResponse<PhoneListData>> {
    return this.request<PhoneListData>('/open/v1/phone/list', {
      groupName,
      page,
      pageSize,
    });
  }

  /**
   * List all phones in a group (handles pagination)
   */
  async listAllPhones(groupName: string, pageSize: number = 100): Promise<GeeLarkPhone[]> {
    const allPhones: GeeLarkPhone[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.listPhones(groupName, page, pageSize);

      if (response.code !== 0) {
        throw new Error(`Failed to list phones: ${response.msg}`);
      }

      allPhones.push(...response.data.items);

      if (response.data.items.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return allPhones;
  }

  /**
   * Start phone environment(s)
   * POST /open/v1/phone/start
   */
  async startPhone(envId: string): Promise<GeeLarkResponse<null>> {
    return this.request<null>('/open/v1/phone/start', {
      ids: [envId],
    });
  }

  /**
   * Start multiple phone environments
   * POST /open/v1/phone/start
   */
  async startPhones(envIds: string[]): Promise<GeeLarkResponse<null>> {
    return this.request<null>('/open/v1/phone/start', {
      ids: envIds,
    });
  }

  /**
   * Stop phone environment(s)
   * POST /open/v1/phone/stop
   */
  async stopPhone(envId: string): Promise<GeeLarkResponse<null>> {
    return this.request<null>('/open/v1/phone/stop', {
      ids: [envId],
    });
  }

  /**
   * Stop multiple phone environments
   * POST /open/v1/phone/stop
   */
  async stopPhones(envIds: string[]): Promise<GeeLarkResponse<null>> {
    return this.request<null>('/open/v1/phone/stop', {
      ids: envIds,
    });
  }

  /**
   * Restart phone environment(s)
   * POST /open/v1/phone/restart
   */
  async restartPhone(envId: string): Promise<GeeLarkResponse<null>> {
    return this.request<null>('/open/v1/phone/restart', {
      ids: [envId],
    });
  }

  /**
   * Restart multiple phone environments
   * POST /open/v1/phone/restart
   */
  async restartPhones(envIds: string[]): Promise<GeeLarkResponse<null>> {
    return this.request<null>('/open/v1/phone/restart', {
      ids: envIds,
    });
  }

  /**
   * Get phone status
   * POST /open/v1/phone/status
   *
   * Response structure:
   * {
   *   "data": {
   *     "totalAmount": 1,
   *     "successAmount": 1,
   *     "failAmount": 0,
   *     "successDetails": [{"id": "...", "serialName": "...", "status": 0|1|2|3}]
   *   }
   * }
   *
   * Status values:
   *   0 = Started (running)
   *   1 = Starting (booting up)
   *   2 = Shut down (offline)
   *   3 = Expired
   */
  async getPhoneStatus(envId: string): Promise<GeeLarkResponse<PhoneStatusData>> {
    const response = await this.request<PhoneStatusQueryData>('/open/v1/phone/status', {
      ids: [envId],
    });

    // Extract from successDetails array
    if (response.code === 0 && response.data.successDetails?.length > 0) {
      return {
        code: response.code,
        msg: response.msg,
        data: response.data.successDetails[0],
      };
    }

    // Return error or empty response (status 2 = shut down/offline)
    return {
      code: response.code,
      msg: response.msg,
      data: { id: envId, status: 2 },
    };
  }

  /**
   * Get multiple phone statuses
   * POST /open/v1/phone/status
   */
  async getPhonesStatus(envIds: string[]): Promise<GeeLarkResponse<PhoneStatusQueryData>> {
    return this.request<PhoneStatusQueryData>('/open/v1/phone/status', {
      ids: envIds,
    });
  }

  /**
   * Install an app on a phone
   * POST /open/v1/app/install
   */
  async installApp(envId: string, appVersionId: string): Promise<GeeLarkResponse<null>> {
    return this.request<null>('/open/v1/app/install', {
      envId,
      appVersionId,
    });
  }

  /**
   * Install an app on multiple phones
   * POST /open/v1/app/install
   */
  async installAppOnPhones(envIds: string[], appVersionId: string): Promise<GeeLarkResponse<null>> {
    return this.request<null>('/open/v1/app/install', {
      envIds,
      appVersionId,
    });
  }

  /**
   * Uninstall an app from a phone
   * POST /open/v1/app/uninstall
   */
  async uninstallApp(envId: string, packageName: string): Promise<GeeLarkResponse<null>> {
    return this.request<null>('/open/v1/app/uninstall', {
      envId,
      packageName,
    });
  }

  /**
   * Get installed apps on a phone
   * POST /open/v1/app/list
   */
  async getInstalledApps(envId: string, page: number = 1, pageSize: number = 100): Promise<GeeLarkResponse<InstalledAppsData>> {
    return this.request<InstalledAppsData>('/open/v1/app/list', {
      envId,
      page,
      pageSize,
    });
  }

  /**
   * Start Instagram login RPA task
   * POST /open/v1/rpa/task/instagramLogin
   */
  async instagramLogin(
    envId: string,
    account: string,
    password: string
  ): Promise<GeeLarkResponse<TaskCreateData>> {
    return this.request<TaskCreateData>('/open/v1/rpa/task/instagramLogin', {
      id: envId,
      account,
      password,
      scheduleAt: Math.floor(Date.now() / 1000),
    });
  }

  /**
   * Start Instagram warmup RPA task
   * POST /open/v1/rpa/task/instagramWarmup
   *
   * @param envId - Cloud phone ID (required)
   * @param options - Optional warmup settings
   * @param options.browseVideo - Number of videos to view (1-100)
   * @param options.keyword - Search keyword
   * @param options.name - Task name (up to 128 chars)
   * @param options.remark - Remarks (up to 200 chars)
   * @param options.scheduleAt - Scheduled timestamp (defaults to now)
   */
  async instagramWarmup(
    envId: string,
    options: {
      browseVideo?: number;
      keyword?: string;
      name?: string;
      remark?: string;
      scheduleAt?: number;
    } = {}
  ): Promise<GeeLarkResponse<TaskCreateData>> {
    const body: Record<string, unknown> = {
      id: envId,
      scheduleAt: options.scheduleAt ?? Math.floor(Date.now() / 1000),
    };
    if (options.browseVideo !== undefined) body.browseVideo = options.browseVideo;
    if (options.keyword) body.keyword = options.keyword;
    if (options.name) body.name = options.name;
    if (options.remark) body.remark = options.remark;

    return this.request<TaskCreateData>('/open/v1/rpa/task/instagramWarmup', body);
  }

  /**
   * Query task status
   * POST /open/v1/task/query
   *
   * IMPORTANT: Gate on data.items[].status field, NOT msg field
   */
  async queryTask(taskId: string): Promise<GeeLarkResponse<TaskQueryData>> {
    return this.request<TaskQueryData>('/open/v1/task/query', {
      ids: [taskId],
    });
  }

  /**
   * Query multiple tasks at once
   */
  async queryTasks(taskIds: string[]): Promise<GeeLarkResponse<TaskQueryData>> {
    return this.request<TaskQueryData>('/open/v1/task/query', {
      ids: taskIds,
    });
  }

  // ==================== Phone Groups ====================

  /**
   * List phone groups
   * POST /open/v1/group/list
   */
  async listGroups(
    page: number = 1,
    pageSize: number = 100
  ): Promise<GeeLarkResponse<GroupListData>> {
    return this.request<GroupListData>('/open/v1/group/list', {
      page,
      pageSize,
    });
  }

  /**
   * List all phone groups (handles pagination)
   */
  async listAllGroups(): Promise<GeeLarkGroup[]> {
    const allGroups: GeeLarkGroup[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.listGroups(page, 100);

      if (response.code !== 0) {
        throw new Error(`Failed to list groups: ${response.msg}`);
      }

      allGroups.push(...response.data.list);

      if (response.data.list.length < 100) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return allGroups;
  }

  // ==================== Marketplace Apps ====================

  /**
   * List marketplace apps (app shop)
   * POST /open/v1/app/shop/list
   *
   * Example request:
   * { "key": "tiktok", "getUploadApp": false, "page": 1, "pageSize": 5 }
   *
   * @param keyword - Search keyword (optional)
   * @param getUploadApp - Get uploaded apps (default: false)
   * @param page - Page number (minimum 1)
   * @param pageSize - Items per page (1-200)
   */
  async listMarketplaceApps(
    keyword?: string,
    page: number = 1,
    pageSize: number = 100,
    getUploadApp: boolean = false
  ): Promise<GeeLarkResponse<MarketplaceAppsData>> {
    const body: Record<string, unknown> = {
      page,
      pageSize,
      getUploadApp,
    };
    if (keyword) {
      body.key = keyword;
    }
    return this.request<MarketplaceAppsData>('/open/v1/app/shop/list', body);
  }

  /**
   * Search marketplace apps by name
   */
  async searchApps(keyword: string): Promise<MarketplaceApp[]> {
    const response = await this.listMarketplaceApps(keyword, 1, 50);

    if (response.code !== 0) {
      throw new Error(`Failed to search apps: ${response.msg}`);
    }

    return response.data.items;
  }

  // ==================== Custom RPA Tasks ====================

  /**
   * List available task flows
   * POST /open/v1/task/flow/list
   *
   * Returns RPA task flows that can be used with createCustomTask.
   *
   * @param page - Page number (minimum 1)
   * @param pageSize - Items per page (1-100)
   */
  async listTaskFlows(
    page: number = 1,
    pageSize: number = 100
  ): Promise<GeeLarkResponse<TaskFlowListData>> {
    return this.request<TaskFlowListData>('/open/v1/task/flow/list', {
      page,
      pageSize,
    });
  }

  /**
   * List all task flows (handles pagination)
   */
  async listAllTaskFlows(): Promise<TaskFlow[]> {
    const allFlows: TaskFlow[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.listTaskFlows(page, 100);

      if (response.code !== 0) {
        throw new Error(`Failed to list task flows: ${response.msg}`);
      }

      allFlows.push(...response.data.items);

      if (response.data.items.length < 100) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return allFlows;
  }

  /**
   * Create a custom RPA task
   * POST /open/v1/task/rpa/add
   *
   * Requires a flowId from the Task Flow Query endpoint.
   * Use paramMap to pass parameters to the task flow.
   *
   * @param envId - Cloud phone ID (required)
   * @param flowId - Task flow ID from Task Flow Query (required)
   * @param options - Optional task settings
   * @param options.name - Task name (up to 32 chars)
   * @param options.remark - Remarks (up to 200 chars)
   * @param options.scheduleAt - Scheduled timestamp (defaults to now)
   * @param options.paramMap - Task flow parameters (object)
   */
  async createCustomTask(
    envId: string,
    flowId: string,
    options: {
      name?: string;
      remark?: string;
      scheduleAt?: number;
      paramMap?: Record<string, unknown>;
    } = {}
  ): Promise<GeeLarkResponse<TaskCreateData>> {
    const body: Record<string, unknown> = {
      id: envId,
      flowId,
      scheduleAt: options.scheduleAt ?? Math.floor(Date.now() / 1000),
    };

    if (options.name) body.name = options.name;
    if (options.remark) body.remark = options.remark;
    if (options.paramMap) body.paramMap = options.paramMap;

    return this.request<TaskCreateData>('/open/v1/task/rpa/add', body);
  }

  // ==================== App Lifecycle ====================

  /**
   * Start an application on a phone
   * POST /open/v1/app/start
   *
   * @param envId - Cloud phone ID (required)
   * @param appIdentifier - Either appVersionId or packageName (one required)
   */
  async startApp(
    envId: string,
    appIdentifier: { appVersionId: string } | { packageName: string }
  ): Promise<GeeLarkResponse<null>> {
    return this.request<null>('/open/v1/app/start', {
      envId,
      ...appIdentifier,
    });
  }

  // ==================== Instagram Content Publishing ====================

  /**
   * Publish Instagram Reels video
   * POST /open/v1/rpa/task/instagramPubReels
   *
   * @param envId - Cloud phone ID (required)
   * @param description - Caption, up to 2200 characters (required)
   * @param videos - Array of video file references (required, up to 10)
   * @param options - Optional task settings
   */
  async instagramPublishReelsVideo(
    envId: string,
    description: string,
    videos: string[],
    options: {
      name?: string;
      remark?: string;
      scheduleAt?: number;
    } = {}
  ): Promise<GeeLarkResponse<TaskCreateData>> {
    const body: Record<string, unknown> = {
      id: envId,
      description,
      video: videos, // Array of URLs ending in file extension
      scheduleAt: options.scheduleAt ?? Math.floor(Date.now() / 1000),
    };

    if (options.name) body.name = options.name;
    if (options.remark) body.remark = options.remark;

    // Debug: Log the exact request body
    console.log('[GeeLark API] instagramPubReels request:', JSON.stringify(body, null, 2));

    return this.request<TaskCreateData>('/open/v1/rpa/task/instagramPubReels', body);
  }

  /**
   * Publish Instagram Reels image carousel
   * POST /open/v1/rpa/task/instagramPubReelsImages
   *
   * @param envId - Cloud phone ID (required)
   * @param description - Caption, up to 2200 characters (required)
   * @param images - Array of image file references (required, up to 10)
   * @param options - Optional task settings
   */
  async instagramPublishReelsImages(
    envId: string,
    description: string,
    images: string[],
    options: {
      name?: string;
      remark?: string;
      scheduleAt?: number;
    } = {}
  ): Promise<GeeLarkResponse<TaskCreateData>> {
    const body: Record<string, unknown> = {
      id: envId,
      description,
      image: images,
      scheduleAt: options.scheduleAt ?? Math.floor(Date.now() / 1000),
    };

    if (options.name) body.name = options.name;
    if (options.remark) body.remark = options.remark;

    return this.request<TaskCreateData>('/open/v1/rpa/task/instagramPubReelsImages', body);
  }

  // ==================== Screenshot ====================

  /**
   * Request a screenshot from a cloud phone
   * POST /open/v1/phone/screenShot
   *
   * @param envId - Cloud phone ID (required)
   * @returns Task ID to poll for result
   *
   * Error codes:
   * - 42001: Cloud phone does not exist
   * - 42002: Cloud phone is not running
   */
  async requestScreenshot(envId: string): Promise<GeeLarkResponse<ScreenshotRequestData>> {
    return this.request<ScreenshotRequestData>('/open/v1/phone/screenShot', {
      id: envId,
    });
  }

  /**
   * Get screenshot result
   * POST /open/v1/phone/screenShot/result
   *
   * Must be retrieved within 30 minutes of requesting the screenshot.
   *
   * @param taskId - Screenshot task ID from requestScreenshot
   * @returns Status and download link
   *
   * Status values:
   * - 0: Acquisition failed
   * - 1: In progress
   * - 2: Execution succeeded (downloadLink available)
   * - 3: Execution failed
   */
  async getScreenshotResult(taskId: string): Promise<GeeLarkResponse<ScreenshotResultData>> {
    return this.request<ScreenshotResultData>('/open/v1/phone/screenShot/result', {
      taskId,
    });
  }

  // ==================== Phone Management ====================

  /**
   * Modify cloud phone information
   * POST /open/v1/phone/detail/update
   *
   * WARNING: Do not call this API while the phone is starting.
   *
   * Supported modifications:
   * - Cloud phone name (up to 100 characters)
   * - Cloud phone remark (up to 1500 characters)
   * - Cloud phone group
   * - Cloud phone tags
   * - Cloud phone proxy configuration
   *
   * @param params - Phone modification parameters
   * @returns Response with optional failDetails for tag failures
   *
   * Error codes:
   * - 42001: Cloud phone does not exist
   * - 43022: Tag does not exist
   * - 43032: Group does not exist
   */
  async modifyPhone(params: ModifyPhoneParams): Promise<GeeLarkResponse<PhoneUpdateData>> {
    return this.request<PhoneUpdateData>('/open/v1/phone/detail/update', params as unknown as Record<string, unknown>);
  }

  /**
   * Rename a cloud phone
   * Convenience method for the common case of just renaming
   *
   * WARNING: Do not call this API while the phone is starting.
   *
   * @param envId - Cloud phone ID
   * @param newName - New phone name (up to 100 characters)
   * @throws Error if name exceeds 100 characters
   */
  async renamePhone(envId: string, newName: string): Promise<GeeLarkResponse<PhoneUpdateData>> {
    if (newName.length > 100) {
      throw new Error(`Phone name exceeds 100 character limit: ${newName.length} characters`);
    }
    return this.modifyPhone({ id: envId, name: newName });
  }

  // ==================== Reddit Automation ====================

  /**
   * Start Reddit AI account warmup RPA task
   * POST /open/v1/rpa/task/redditWarmup
   *
   * @param envId - Cloud phone ID (required)
   * @param options - Optional warmup settings
   * @param options.keyword - Search keyword for browsing
   * @param options.name - Task name (up to 128 chars)
   * @param options.remark - Remarks (up to 200 chars)
   * @param options.scheduleAt - Scheduled timestamp (defaults to now)
   */
  async redditWarmup(
    envId: string,
    options: {
      keyword?: string;
      name?: string;
      remark?: string;
      scheduleAt?: number;
    } = {}
  ): Promise<GeeLarkResponse<TaskCreateData>> {
    const body: Record<string, unknown> = {
      id: envId,
      scheduleAt: options.scheduleAt ?? Math.floor(Date.now() / 1000),
    };
    if (options.keyword) body.keyword = options.keyword;
    if (options.name) body.name = options.name;
    if (options.remark) body.remark = options.remark;

    return this.request<TaskCreateData>('/open/v1/rpa/task/redditWarmup', body);
  }

  /**
   * Publish pictures and text on Reddit
   * POST /open/v1/rpa/task/redditImage
   *
   * @param envId - Cloud phone ID (required)
   * @param title - Post title (required)
   * @param community - Target subreddit/community name (required)
   * @param images - Array of image URLs (required)
   * @param options - Optional settings
   * @param options.description - Post description/body
   * @param options.name - Task name (up to 128 chars)
   * @param options.remark - Remarks (up to 200 chars)
   * @param options.scheduleAt - Scheduled timestamp (defaults to now)
   */
  async redditPublishImage(
    envId: string,
    title: string,
    community: string,
    images: string[],
    options: {
      description?: string;
      name?: string;
      remark?: string;
      scheduleAt?: number;
    } = {}
  ): Promise<GeeLarkResponse<TaskCreateData>> {
    const body: Record<string, unknown> = {
      id: envId,
      title,
      community,
      images,
      scheduleAt: options.scheduleAt ?? Math.floor(Date.now() / 1000),
    };
    if (options.description) body.description = options.description;
    if (options.name) body.name = options.name;
    if (options.remark) body.remark = options.remark;

    return this.request<TaskCreateData>('/open/v1/rpa/task/redditImage', body);
  }

  /**
   * Publish video on Reddit
   * POST /open/v1/rpa/task/redditVideo
   *
   * @param envId - Cloud phone ID (required)
   * @param title - Post title (required)
   * @param community - Target subreddit/community name (required)
   * @param video - Array of video URLs (required)
   * @param options - Optional settings
   * @param options.description - Post description/body
   * @param options.name - Task name (up to 128 chars)
   * @param options.remark - Remarks (up to 200 chars)
   * @param options.scheduleAt - Scheduled timestamp (defaults to now)
   */
  async redditPublishVideo(
    envId: string,
    title: string,
    community: string,
    video: string[],
    options: {
      description?: string;
      name?: string;
      remark?: string;
      scheduleAt?: number;
    } = {}
  ): Promise<GeeLarkResponse<TaskCreateData>> {
    const body: Record<string, unknown> = {
      id: envId,
      title,
      community,
      video,
      scheduleAt: options.scheduleAt ?? Math.floor(Date.now() / 1000),
    };
    if (options.description) body.description = options.description;
    if (options.name) body.name = options.name;
    if (options.remark) body.remark = options.remark;

    return this.request<TaskCreateData>('/open/v1/rpa/task/redditVideo', body);
  }
}

/**
 * Create a singleton client instance for server-side use
 */
let clientInstance: GeeLarkClient | null = null;

export function getGeeLarkClient(): GeeLarkClient {
  if (!clientInstance) {
    clientInstance = new GeeLarkClient();
  }
  return clientInstance;
}

/**
 * GeeLark API error class
 */
export class GeeLarkAPIError extends Error {
  constructor(
    public endpoint: string,
    public code: number,
    public apiMessage: string
  ) {
    super(`GeeLark API error on ${endpoint}: [${code}] ${apiMessage}`);
    this.name = 'GeeLarkAPIError';
  }
}
