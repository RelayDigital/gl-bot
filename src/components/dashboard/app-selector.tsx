'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, AlertCircle } from 'lucide-react';
import { MarketplaceApp, AppVersion } from '@/lib/geelark/types';
import { TargetApp, TARGET_APP_CONFIGS } from '@/lib/state-machine/types';

interface AppSelectorProps {
  apiToken: string;
  selectedAppId: string;
  selectedAppName: string;
  selectedVersionId: string;
  selectedVersion: string;
  onSelect: (appId: string, appName: string, versionId: string, version: string) => void;
  disabled?: boolean;
  /** Target app to search for (auto-searches when changed) */
  targetApp?: TargetApp;
}

export function AppSelector({
  apiToken,
  selectedAppId,
  selectedAppName,
  selectedVersionId,
  selectedVersion,
  onSelect,
  disabled,
  targetApp = 'instagram',
}: AppSelectorProps) {
  const targetAppConfig = TARGET_APP_CONFIGS[targetApp];
  const [apps, setApps] = useState<MarketplaceApp[]>([]);
  const [searchTerm, setSearchTerm] = useState(targetAppConfig.searchTerm);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAutoSearched, setHasAutoSearched] = useState(false);

  // Get versions from the selected app
  const selectedApp = apps.find((a) => a.id === selectedAppId);
  const versions = selectedApp?.appVersionList || [];

  const fetchApps = useCallback(async () => {
    if (!apiToken) {
      setError('API token required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (searchTerm) {
        params.set('key', searchTerm);
      }

      const response = await fetch(`/api/geelark/marketplace?${params}`, {
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch apps');
      }

      const apps = Array.isArray(data.apps) ? data.apps : [];
      setApps(apps);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch apps');
    } finally {
      setIsLoading(false);
    }
  }, [apiToken, searchTerm]);

  // Reset when token changes
  useEffect(() => {
    setApps([]);
    setError(null);
    setHasAutoSearched(false);
  }, [apiToken]);

  // Update search term when target app changes
  useEffect(() => {
    setSearchTerm(targetAppConfig.searchTerm);
    setHasAutoSearched(false);
  }, [targetApp, targetAppConfig.searchTerm]);

  // Auto-search when token is available and we haven't searched yet
  useEffect(() => {
    if (apiToken && !hasAutoSearched && !isLoading && apps.length === 0) {
      setHasAutoSearched(true);
      fetchApps();
    }
  }, [apiToken, hasAutoSearched, isLoading, apps.length, fetchApps]);

  const handleAppSelect = (appId: string) => {
    const app = apps.find((a) => a.id === appId);
    if (app) {
      // Clear version when app changes
      onSelect(app.id, app.appName, '', '');
    }
  };

  const handleVersionSelect = (versionId: string) => {
    const version = versions.find((v) => v.id === versionId);
    if (version) {
      onSelect(selectedAppId, selectedAppName, version.id, version.versionName);
    }
  };

  const handleSearch = () => {
    fetchApps();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      fetchApps();
    }
  };

  const hasToken = Boolean(apiToken);

  return (
    <div className="space-y-4">
      {/* Search Apps */}
      <div className="space-y-2">
        <Label>Search {targetAppConfig.label} App</Label>
        <div className="flex gap-2">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search marketplace..."
            disabled={disabled || !hasToken}
            className="flex-1"
          />
          <Button
            variant="outline"
            onClick={handleSearch}
            disabled={disabled || isLoading || !hasToken}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-1 text-xs text-red-500">
          <AlertCircle className="h-3 w-3" />
          {error}
        </div>
      )}

      {/* App Selector */}
      <div className="space-y-2">
        <Label>Select App</Label>
        <Select
          value={selectedAppId}
          onValueChange={handleAppSelect}
          disabled={disabled || isLoading || !hasToken || apps.length === 0}
        >
          <SelectTrigger>
            <SelectValue placeholder={hasToken ? 'Search and select an app' : 'Enter API token first'}>
              {selectedAppName || 'Select an app'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {apps.length === 0 && !isLoading && (
              <div className="p-2 text-sm text-muted-foreground text-center">
                {hasToken ? 'Click search to find apps' : 'Enter API token first'}
              </div>
            )}
            {apps.map((app) => (
              <SelectItem key={app.id} value={app.id}>
                <span className="flex items-center gap-2">
                  <span>{app.appName}</span>
                  <Badge variant="outline" className="text-xs">
                    {app.appVersionList.length} versions
                  </Badge>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Version Selector */}
      <div className="space-y-2">
        <Label>Select Version</Label>
        <Select
          value={selectedVersionId}
          onValueChange={handleVersionSelect}
          disabled={disabled || !selectedAppId || versions.length === 0}
        >
          <SelectTrigger>
            <SelectValue placeholder={selectedAppId ? 'Select a version' : 'Select an app first'}>
              {selectedVersion ? `v${selectedVersion}` : 'Select a version'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {versions.length === 0 && selectedAppId && (
              <div className="p-2 text-sm text-muted-foreground text-center">
                No versions available
              </div>
            )}
            {versions.map((version) => (
              <SelectItem key={version.id} value={version.id}>
                <span className="flex items-center gap-2">
                  <span>v{version.versionName}</span>
                  <Badge variant="outline" className="text-xs">
                    Code: {version.versionCode}
                  </Badge>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedVersionId && (
          <p className="text-xs text-muted-foreground">
            Version ID: <code className="bg-muted px-1 rounded">{selectedVersionId}</code>
          </p>
        )}
      </div>

      {!hasToken && (
        <p className="text-xs text-muted-foreground">
          Enter your GeeLark API token to search and select apps
        </p>
      )}
    </div>
  );
}
