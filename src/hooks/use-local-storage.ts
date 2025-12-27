'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  WorkflowType,
  SetupFlowIds,
  WarmupProtocolConfig,
  DEFAULT_WARMUP_PROTOCOL,
  TargetApp,
} from '@/lib/state-machine/types';

/**
 * Hook to persist state to localStorage
 *
 * @param key - localStorage key
 * @param initialValue - default value if no stored value exists
 * @returns [value, setValue, removeValue]
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  // State to store value
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize from localStorage after mount (SSR-safe)
  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        setStoredValue(JSON.parse(item));
      }
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
    }
    setIsInitialized(true);
  }, [key]);

  // Persist to localStorage when value changes
  useEffect(() => {
    if (!isInitialized) return;

    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, storedValue, isInitialized]);

  // Setter function
  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setStoredValue((prev) => {
      const newValue = value instanceof Function ? value(prev) : value;
      return newValue;
    });
  }, []);

  // Remove from localStorage
  const removeValue = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
      setStoredValue(initialValue);
    } catch (error) {
      console.warn(`Error removing localStorage key "${key}":`, error);
    }
  }, [key, initialValue]);

  return [storedValue, setValue, removeValue];
}

/**
 * Default config values for the workflow
 */
export interface SavedConfig {
  // API Token
  apiToken: string;
  // Target application (Instagram, Reddit, etc.)
  targetApp: TargetApp;
  // Phone group
  groupId: string;
  groupName: string;
  // Target app selection
  appId: string;
  appName: string;
  appVersionId: string;
  appVersion: string;
  // Legacy Instagram app fields (for backwards compatibility)
  /** @deprecated Use appId instead */
  igAppId: string;
  /** @deprecated Use appName instead */
  igAppName: string;
  /** @deprecated Use appVersionId instead */
  igAppVersionId: string;
  /** @deprecated Use appVersion instead */
  igAppVersion: string;
  // Account data
  accountData: string;
  // Workflow settings
  concurrencyLimit: number;
  maxRetriesPerStage: number;
  baseBackoffSeconds: number;
  pollIntervalSeconds: number;
  pollTimeoutSeconds: number;
  // Custom login flow (for 2FA support)
  customLoginFlowId: string;
  customLoginFlowTitle: string;
  customLoginFlowParams: string[];
  // Workflow type selection
  workflowType: WorkflowType;
  // Setup workflow flow IDs
  setupFlowIds: SetupFlowIds;
  // Setup workflow flow titles (for display)
  setupFlowTitles: Record<keyof SetupFlowIds, string>;
  // Custom workflow task order (array of task keys in execution order)
  customTaskOrder: (keyof SetupFlowIds)[];
  // Warmup protocol configuration
  warmupProtocol: WarmupProtocolConfig;
}

export const defaultConfig: SavedConfig = {
  apiToken: '',
  targetApp: 'instagram',
  groupId: '',
  groupName: '',
  appId: '',
  appName: '',
  appVersionId: '',
  appVersion: '',
  // Legacy fields (backwards compatibility)
  igAppId: '',
  igAppName: '',
  igAppVersionId: '',
  igAppVersion: '',
  accountData: '',
  concurrencyLimit: 5,
  maxRetriesPerStage: 3,
  baseBackoffSeconds: 2,
  pollIntervalSeconds: 5,
  pollTimeoutSeconds: 300,
  customLoginFlowId: '',
  customLoginFlowTitle: '',
  customLoginFlowParams: [],
  workflowType: 'warmup',
  setupFlowIds: {},
  setupFlowTitles: {
    renameUsername: '',
    editDisplayName: '',
    setProfilePicture: '',
    setBio: '',
    createPost: '',
    createStoryHighlight: '',
    setPrivate: '',
    enable2FA: '',
  },
  customTaskOrder: [],
  warmupProtocol: DEFAULT_WARMUP_PROTOCOL,
};

/**
 * Helper to deep merge warmup protocol config
 */
function mergeWarmupProtocol(
  saved: Partial<WarmupProtocolConfig> | undefined
): WarmupProtocolConfig {
  if (!saved) return DEFAULT_WARMUP_PROTOCOL;

  return {
    selectedDay: saved.selectedDay ?? DEFAULT_WARMUP_PROTOCOL.selectedDay,
    day0: {
      ...DEFAULT_WARMUP_PROTOCOL.day0,
      ...(saved.day0 || {}),
      waitMinutes: {
        ...DEFAULT_WARMUP_PROTOCOL.day0.waitMinutes,
        ...(saved.day0?.waitMinutes || {}),
      },
      followCount: {
        ...DEFAULT_WARMUP_PROTOCOL.day0.followCount,
        ...(saved.day0?.followCount || {}),
      },
      scrollMinutes: {
        ...DEFAULT_WARMUP_PROTOCOL.day0.scrollMinutes,
        ...(saved.day0?.scrollMinutes || {}),
      },
    },
    day1_2: {
      ...DEFAULT_WARMUP_PROTOCOL.day1_2,
      ...(saved.day1_2 || {}),
      scrollMinutes: {
        ...DEFAULT_WARMUP_PROTOCOL.day1_2.scrollMinutes,
        ...(saved.day1_2?.scrollMinutes || {}),
      },
      likeCount: {
        ...DEFAULT_WARMUP_PROTOCOL.day1_2.likeCount,
        ...(saved.day1_2?.likeCount || {}),
      },
      followCount: {
        ...DEFAULT_WARMUP_PROTOCOL.day1_2.followCount,
        ...(saved.day1_2?.followCount || {}),
      },
    },
    day3_7: {
      ...DEFAULT_WARMUP_PROTOCOL.day3_7,
      ...(saved.day3_7 || {}),
    },
  };
}

/**
 * Hook to persist workflow config
 * Merges loaded config with defaults to handle missing fields from older saved configs
 */
export function useSavedConfig(): [SavedConfig, (value: SavedConfig | ((prev: SavedConfig) => SavedConfig)) => void, () => void] {
  const [rawConfig, setConfig, removeConfig] = useLocalStorage<Partial<SavedConfig>>('gl-bot-config', defaultConfig);

  // Memoize merged config to prevent infinite update loops
  const mergedConfig = useMemo<SavedConfig>(() => {
    // Migrate from legacy igApp* fields to new app* fields
    const appId = rawConfig.appId || rawConfig.igAppId || defaultConfig.appId;
    const appName = rawConfig.appName || rawConfig.igAppName || defaultConfig.appName;
    const appVersionId = rawConfig.appVersionId || rawConfig.igAppVersionId || defaultConfig.appVersionId;
    const appVersion = rawConfig.appVersion || rawConfig.igAppVersion || defaultConfig.appVersion;

    return {
      ...defaultConfig,
      ...rawConfig,
      // Use migrated app fields
      appId,
      appName,
      appVersionId,
      appVersion,
      // Keep legacy fields in sync for backwards compatibility
      igAppId: appId,
      igAppName: appName,
      igAppVersionId: appVersionId,
      igAppVersion: appVersion,
      // Ensure nested objects are properly merged
      setupFlowIds: {
        ...defaultConfig.setupFlowIds,
        ...(rawConfig.setupFlowIds || {}),
      },
      setupFlowTitles: {
        ...defaultConfig.setupFlowTitles,
        ...(rawConfig.setupFlowTitles || {}),
      },
      // Ensure customTaskOrder is an array
      customTaskOrder: rawConfig.customTaskOrder || defaultConfig.customTaskOrder,
      // Deep merge warmup protocol config
      warmupProtocol: mergeWarmupProtocol(rawConfig.warmupProtocol),
    };
  }, [rawConfig]);

  return [mergedConfig, setConfig as (value: SavedConfig | ((prev: SavedConfig) => SavedConfig)) => void, removeConfig];
}

/**
 * Hook to get just the API token
 */
export function useApiToken() {
  const [config, setConfig] = useSavedConfig();

  const setToken = useCallback((token: string) => {
    setConfig((prev) => ({ ...prev, apiToken: token }));
  }, [setConfig]);

  return [config.apiToken, setToken] as const;
}
