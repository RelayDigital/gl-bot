'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useSavedConfig, SavedConfig } from '@/hooks/use-local-storage';
import { CSVUpload } from './csv-upload';
import { GroupSelector } from './group-selector';
import { AppSelector } from './app-selector';
import { TaskFlowSelector } from './task-flow-selector';
import { AccountDataPreview } from './account-data-preview';
import { WorkflowPreview } from './workflow-preview';
import { WorkflowTypeSelector } from './workflow-type-selector';
import { SetupFlowSelectors } from './setup-flow-selectors';
import { CustomTaskBuilder } from './custom-task-builder';
import { WarmupProtocolConfigPanel } from './warmup-protocol-config';
import { BulkMediaUpload } from './bulk-media-upload';
import { MediaStatus } from './media-status';
import { X, Eye, EyeOff, Key, Code, Table } from 'lucide-react';
import {
  WorkflowType,
  SetupFlowIds,
  WarmupProtocolConfig,
  TargetApp,
  TARGET_APP_CONFIGS,
  getWorkflowTargetApp,
} from '@/lib/state-machine/types';

interface ConfigPanelProps {
  onConfigChange?: (config: SavedConfig) => void;
  disabled?: boolean;
}

export function ConfigPanel({ onConfigChange, disabled }: ConfigPanelProps) {
  const [savedConfig, setSavedConfig] = useSavedConfig();
  const [config, setConfig] = useState<SavedConfig>(savedConfig);
  const [accountCount, setAccountCount] = useState(0);
  const [showToken, setShowToken] = useState(false);
  const [showRawData, setShowRawData] = useState(false);

  // Sync with saved config on mount
  useEffect(() => {
    setConfig(savedConfig);
    // Count accounts in saved config
    const lines = savedConfig.accountData.trim().split('\n').filter(Boolean);
    setAccountCount(lines.length);
  }, [savedConfig]);

  // Update saved config and notify parent
  const updateConfig = useCallback((updates: Partial<SavedConfig>) => {
    setConfig((prev) => {
      const newConfig = { ...prev, ...updates };
      setSavedConfig(newConfig);
      onConfigChange?.(newConfig);
      return newConfig;
    });
  }, [setSavedConfig, onConfigChange]);

  // Handle CSV upload with mapped accounts
  const handleAccountsLoaded = useCallback((
    accounts: {
      username: string;
      password: string;
      twoFactorSecret?: string;
      flags: Record<string, unknown>;
      setup?: {
        newUsername?: string;
        newDisplayName?: string;
        profilePictureUrl?: string;
        bio?: string;
        post1?: { description: string; mediaUrls: string[]; type: string };
        post2?: { description: string; mediaUrls: string[]; type: string };
        highlightTitle?: string;
        highlightCoverUrl?: string;
      };
    }[]
  ) => {
    // Convert mapped accounts back to TSV format for storage
    // Column order: username, password, twoFactorSecret, runWarmup, browseVideo, accountType,
    //               newUsername, newDisplayName, profilePictureUrl, bio,
    //               post1Desc, post1Media, post2Desc, post2Media, highlightTitle, highlightCover
    const tsvLines = accounts.map((acc) => {
      const parts = [
        acc.username,
        acc.password,
        acc.twoFactorSecret || '',
        acc.flags.runWarmup !== undefined ? String(acc.flags.runWarmup) : 'true',
        acc.flags.warmupBrowseVideo !== undefined ? String(acc.flags.warmupBrowseVideo) : '5',
        acc.flags.accountType || '',
        // Sister/Setup workflow fields
        acc.setup?.newUsername || '',
        acc.setup?.newDisplayName || '',
        acc.setup?.profilePictureUrl || '',
        acc.setup?.bio || '',
        // Post fields
        acc.setup?.post1?.description || '',
        acc.setup?.post1?.mediaUrls?.join(';') || '',
        acc.setup?.post2?.description || '',
        acc.setup?.post2?.mediaUrls?.join(';') || '',
        // Highlight fields
        acc.setup?.highlightTitle || '',
        acc.setup?.highlightCoverUrl || '',
      ];
      return parts.join('\t');
    });

    const accountData = tsvLines.join('\n');
    updateConfig({ accountData });
    setAccountCount(accounts.length);
  }, [updateConfig]);

  // Handle manual text changes
  const handleAccountDataChange = (value: string) => {
    updateConfig({ accountData: value });
    const lines = value.trim().split('\n').filter(Boolean);
    setAccountCount(lines.length);
  };

  // Clear account data
  const handleClearAccounts = () => {
    updateConfig({ accountData: '' });
    setAccountCount(0);
  };

  // Handle generated bios - updates account data with AI-generated bios
  const handleBiosGenerated = useCallback((bios: string[]) => {
    // Parse current account data
    const lines = config.accountData.trim().split('\n').filter(Boolean);

    const updatedLines = lines.map((line, index) => {
      const bio = bios[index];
      if (!bio) return line;

      const parts = line.split('\t');

      // Ensure we have enough columns (16 total)
      // Column 9 is bio
      while (parts.length < 16) {
        parts.push('');
      }

      parts[9] = bio;
      return parts.join('\t');
    });

    const newAccountData = updatedLines.join('\n');
    updateConfig({ accountData: newAccountData });
  }, [config.accountData, updateConfig]);

  // Handle bulk media upload - updates account data with uploaded file URLs and AI descriptions
  const handleMediaUploaded = useCallback((
    mediaType: 'profilePicture' | 'post1Media' | 'post2Media' | 'highlightCover',
    urls: Map<number, string>,
    descriptions?: Map<number, string>
  ) => {
    // Parse current account data
    const lines = config.accountData.trim().split('\n').filter(Boolean);

    const updatedLines = lines.map((line, index) => {
      const url = urls.get(index);
      const description = descriptions?.get(index);
      if (!url && !description) return line;

      const parts = line.split('\t');

      // Ensure we have enough columns (16 total)
      while (parts.length < 16) {
        parts.push('');
      }

      // Map media type to column index
      // Column order: 0-username, 1-password, 2-twoFactorSecret, 3-runWarmup, 4-browseVideo, 5-accountType,
      //               6-newUsername, 7-newDisplayName, 8-profilePictureUrl, 9-bio,
      //               10-post1Desc, 11-post1Media, 12-post2Desc, 13-post2Media, 14-highlightTitle, 15-highlightCover
      switch (mediaType) {
        case 'profilePicture':
          if (url) parts[8] = url;
          break;
        case 'post1Media':
          // Set description (replace existing)
          if (description) parts[10] = description;
          // Set media URL (replace existing to avoid duplicates)
          if (url) parts[11] = url;
          break;
        case 'post2Media':
          // Set description (replace existing)
          if (description) parts[12] = description;
          // Set media URL (replace existing to avoid duplicates)
          if (url) parts[13] = url;
          break;
        case 'highlightCover':
          if (url) parts[15] = url;
          break;
      }

      return parts.join('\t');
    });

    const newAccountData = updatedLines.join('\n');
    updateConfig({ accountData: newAccountData });
  }, [config.accountData, updateConfig]);

  // Handle group selection
  const handleGroupSelect = (groupId: string, groupName: string) => {
    updateConfig({ groupId, groupName });
  };

  // Handle app selection
  const handleAppSelect = (
    appId: string,
    appName: string,
    versionId: string,
    version: string
  ) => {
    updateConfig({
      appId,
      appName,
      appVersionId: versionId,
      appVersion: version,
      // Keep legacy fields in sync
      igAppId: appId,
      igAppName: appName,
      igAppVersionId: versionId,
      igAppVersion: version,
    });
  };

  // Handle workflow type change - updates target app automatically
  const handleWorkflowTypeChange = (workflowType: WorkflowType) => {
    const targetApp = getWorkflowTargetApp(workflowType);
    updateConfig({ workflowType, targetApp });
  };

  // Get target app config for display
  const targetAppConfig = TARGET_APP_CONFIGS[config.targetApp || 'instagram'];

  const hasToken = Boolean(config.apiToken);

  return (
    <div className="space-y-4">
      {/* API Token Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Key className="h-4 w-4" />
            GL API Token
          </CardTitle>
          <CardDescription>
            Your API token is used to fetch phone groups and marketplace apps from GeeLark
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showToken ? 'text' : 'password'}
                value={config.apiToken}
                onChange={(e) => updateConfig({ apiToken: e.target.value })}
                placeholder="Enter your GeeLark API token"
                disabled={disabled}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            {hasToken && (
              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                Connected
              </Badge>
            )}
          </div>
          {!hasToken && (
            <p className="text-xs text-muted-foreground mt-2">
              Get your API token from your GeeLark dashboard settings
            </p>
          )}
        </CardContent>
      </Card>

      {/* Main Configuration Card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Workflow Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Workflow Type Selection */}
          <WorkflowTypeSelector
            value={config.workflowType}
            onChange={handleWorkflowTypeChange}
            disabled={disabled}
          />

          {/* Target App Selection - prominently displayed */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Target Application</Label>
                <p className="text-xs text-muted-foreground">
                  This workflow runs on {targetAppConfig.label}
                </p>
              </div>
              <Badge variant="secondary" className="text-sm px-3 py-1">
                {targetAppConfig.label}
              </Badge>
            </div>

            {/* App Selector */}
            <AppSelector
              apiToken={config.apiToken}
              selectedAppId={config.appId}
              selectedAppName={config.appName}
              selectedVersionId={config.appVersionId}
              selectedVersion={config.appVersion}
              onSelect={handleAppSelect}
              disabled={disabled}
              targetApp={config.targetApp || 'instagram'}
            />
          </div>

          {/* Warmup Protocol Settings - shown for warmup workflow */}
          {config.workflowType === 'warmup' && (
            <WarmupProtocolConfigPanel
              config={config.warmupProtocol}
              onChange={(warmupProtocol: WarmupProtocolConfig) =>
                updateConfig({ warmupProtocol })
              }
              disabled={disabled}
              accountCount={accountCount}
              onBiosGenerated={handleBiosGenerated}
            />
          )}

          <Separator />

          {/* Phone Group Selection */}
          <GroupSelector
            apiToken={config.apiToken}
            selectedGroupId={config.groupId}
            selectedGroupName={config.groupName}
            onSelect={handleGroupSelect}
            disabled={disabled}
          />

          {/* Workflow Task Flows - SetupFlowSelectors for setup/sister, CustomTaskBuilder for custom */}
          {(config.workflowType === 'setup' || config.workflowType === 'sister') && (
            <>
              <Separator />
              <SetupFlowSelectors
                apiToken={config.apiToken}
                workflowType={config.workflowType}
                setupFlowIds={config.setupFlowIds}
                setupFlowTitles={config.setupFlowTitles}
                onSelect={(key, flowId, flowTitle) =>
                  updateConfig({
                    setupFlowIds: {
                      ...config.setupFlowIds,
                      [key]: flowId,
                    },
                    setupFlowTitles: {
                      ...config.setupFlowTitles,
                      [key]: flowTitle,
                    },
                  })
                }
                disabled={disabled}
              />
            </>
          )}

          {/* Custom Task Builder for custom workflow */}
          {config.workflowType === 'custom' && (
            <>
              <Separator />
              <CustomTaskBuilder
                apiToken={config.apiToken}
                setupFlowIds={config.setupFlowIds}
                setupFlowTitles={config.setupFlowTitles}
                customTaskOrder={config.customTaskOrder}
                onFlowSelect={(key, flowId, flowTitle) =>
                  updateConfig({
                    setupFlowIds: {
                      ...config.setupFlowIds,
                      [key]: flowId,
                    },
                    setupFlowTitles: {
                      ...config.setupFlowTitles,
                      [key]: flowTitle,
                    },
                  })
                }
                onTaskOrderChange={(taskOrder) =>
                  updateConfig({ customTaskOrder: taskOrder })
                }
                disabled={disabled}
              />
            </>
          )}

          <Separator />

          {/* Account Data Section */}
          <div className="space-y-3">
            {/* Header Row */}
            <div className="flex items-center justify-between">
              <Label htmlFor="accountData">Account Data</Label>
              <div className="flex items-center gap-2">
                <CSVUpload
                  onAccountsLoaded={handleAccountsLoaded}
                  disabled={disabled}
                  workflowType={config.workflowType}
                  setupFlowIds={config.setupFlowIds}
                  hasCustomLoginFlow={!!config.customLoginFlowId}
                />
                {/* Show bulk upload for workflows that use media */}
                {accountCount > 0 && (
                  <BulkMediaUpload
                    accountCount={accountCount}
                    onFilesUploaded={handleMediaUploaded}
                    disabled={disabled}
                  />
                )}
              </div>
            </div>

            {/* Data Controls Row - only shown when data exists */}
            {accountCount > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">{accountCount} accounts</Badge>
                <MediaStatus accountData={config.accountData} accountCount={accountCount} />
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowRawData(!showRawData)}
                  className="h-7 px-2 gap-1"
                >
                  {showRawData ? (
                    <>
                      <Table className="h-3 w-3" />
                      Table
                    </>
                  ) : (
                    <>
                      <Code className="h-3 w-3" />
                      Raw
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAccounts}
                  disabled={disabled}
                  className="h-7 px-2"
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              </div>
            )}

            {/* Formatted Table View */}
            {!showRawData && (
              <AccountDataPreview
                accountData={config.accountData}
                workflowType={config.workflowType}
                onAccountDataChange={disabled ? undefined : handleAccountDataChange}
              />
            )}

            {/* Raw Textarea View */}
            {showRawData && (
              <Textarea
                id="accountData"
                value={config.accountData}
                onChange={(e) => handleAccountDataChange(e.target.value)}
                placeholder={`username\tpassword\trunWarmup\tbrowseVideo\taccountType\nuser1\tpass1\ttrue\t5\treels\nuser2\tpass2\ttrue\t5\tposts`}
                rows={8}
                className="font-mono text-sm"
                disabled={disabled}
              />
            )}

            <p className="text-xs text-muted-foreground">
              Upload a CSV file or paste data manually. Order matches phone order (Phone 1 = row 1).
            </p>
          </div>

          <Separator />

          {/* Advanced Settings */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Advanced Settings</Label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label htmlFor="concurrency" className="text-xs text-muted-foreground">
                  Concurrency
                </Label>
                <Input
                  id="concurrency"
                  type="number"
                  min={1}
                  max={20}
                  value={config.concurrencyLimit}
                  onChange={(e) =>
                    updateConfig({ concurrencyLimit: parseInt(e.target.value) || 5 })
                  }
                  disabled={disabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxRetries" className="text-xs text-muted-foreground">
                  Max Retries
                </Label>
                <Input
                  id="maxRetries"
                  type="number"
                  min={1}
                  max={10}
                  value={config.maxRetriesPerStage}
                  onChange={(e) =>
                    updateConfig({
                      maxRetriesPerStage: parseInt(e.target.value) || 3,
                    })
                  }
                  disabled={disabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="backoff" className="text-xs text-muted-foreground">
                  Backoff (s)
                </Label>
                <Input
                  id="backoff"
                  type="number"
                  min={1}
                  max={60}
                  value={config.baseBackoffSeconds}
                  onChange={(e) =>
                    updateConfig({
                      baseBackoffSeconds: parseInt(e.target.value) || 2,
                    })
                  }
                  disabled={disabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pollInterval" className="text-xs text-muted-foreground">
                  Poll (s)
                </Label>
                <Input
                  id="pollInterval"
                  type="number"
                  min={1}
                  max={60}
                  value={config.pollIntervalSeconds}
                  onChange={(e) =>
                    updateConfig({
                      pollIntervalSeconds: parseInt(e.target.value) || 5,
                    })
                  }
                  disabled={disabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timeout" className="text-xs text-muted-foreground">
                  Timeout (s)
                </Label>
                <Input
                  id="timeout"
                  type="number"
                  min={30}
                  max={1800}
                  value={config.pollTimeoutSeconds}
                  onChange={(e) =>
                    updateConfig({
                      pollTimeoutSeconds: parseInt(e.target.value) || 300,
                    })
                  }
                  disabled={disabled}
                />
              </div>
            </div>

            {/* Custom Login Flow (for 2FA) */}
            <div className="pt-2">
              <TaskFlowSelector
                apiToken={config.apiToken}
                selectedFlowId={config.customLoginFlowId}
                selectedFlowTitle={config.customLoginFlowTitle}
                onSelect={(flowId, flowTitle, params) =>
                  updateConfig({
                    customLoginFlowId: flowId,
                    customLoginFlowTitle: flowTitle,
                    customLoginFlowParams: params,
                  })
                }
                onClear={() =>
                  updateConfig({
                    customLoginFlowId: '',
                    customLoginFlowTitle: '',
                    customLoginFlowParams: [],
                  })
                }
                disabled={disabled}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Workflow Preview */}
      <WorkflowPreview config={config} />
    </div>
  );
}
