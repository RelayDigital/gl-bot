'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWorkflow, useWorkflowStatus, useIsRunning } from '@/hooks/use-workflow';
import { SavedConfig } from '@/hooks/use-local-storage';
import { TARGET_APP_CONFIGS } from '@/lib/state-machine/types';
import { Play, X, Loader2, Wifi, WifiOff, Power, RotateCcw } from 'lucide-react';

interface RunControlProps {
  config: SavedConfig;
}

export function RunControl({ config }: RunControlProps) {
  const { state, actions } = useWorkflow();
  const status = useWorkflowStatus();
  const isRunning = useIsRunning();
  const [isLoading, setIsLoading] = useState(false);

  const handleStart = async () => {
    // Validate config
    if (!config.apiToken) {
      alert('Please enter your GeeLark API token');
      return;
    }
    if (!config.groupName) {
      alert('Please select a phone group');
      return;
    }
    const targetApp = config.targetApp || 'instagram';
    const targetAppConfig = TARGET_APP_CONFIGS[targetApp];
    if (!config.appVersionId && !config.igAppVersionId) {
      alert(`Please select a ${targetAppConfig.label} app and version`);
      return;
    }
    if (!config.accountData.trim()) {
      alert('Please enter account data');
      return;
    }

    // Validate Setup workflow requirements - at least one operation should be selected
    if (config.workflowType === 'setup') {
      const hasAnyFlow = config.setupFlowIds?.setProfilePicture ||
                         config.setupFlowIds?.setBio ||
                         config.setupFlowIds?.createPost ||
                         config.setupFlowIds?.createStoryHighlight ||
                         config.setupFlowIds?.setPrivate ||
                         config.setupFlowIds?.enable2FA;
      if (!hasAnyFlow) {
        alert('Setup workflow requires at least one task flow to be selected.\n\nPlease select at least one flow in the Workflow Task Flows section.');
        return;
      }
    }

    // Validate Sister workflow requirements - at least one operation should be selected
    if (config.workflowType === 'sister') {
      const hasAnyFlow = config.setupFlowIds?.renameUsername ||
                         config.setupFlowIds?.editDisplayName ||
                         config.setupFlowIds?.setProfilePicture ||
                         config.setupFlowIds?.setBio;
      if (!hasAnyFlow) {
        alert('Sister workflow requires at least one task flow to be selected:\n\n• Rename Username\n• Edit Display Name\n• Set Profile Picture\n• Set Bio\n\nPlease select at least one flow in the Workflow Task Flows section.');
        return;
      }
    }

    // Validate Custom workflow requirements - at least one operation should be selected
    if (config.workflowType === 'custom') {
      const hasAnyFlow = config.setupFlowIds?.renameUsername ||
                         config.setupFlowIds?.editDisplayName ||
                         config.setupFlowIds?.setProfilePicture ||
                         config.setupFlowIds?.setBio ||
                         config.setupFlowIds?.createPost ||
                         config.setupFlowIds?.createStoryHighlight ||
                         config.setupFlowIds?.setPrivate ||
                         config.setupFlowIds?.enable2FA;
      if (!hasAnyFlow) {
        alert('Custom workflow requires at least one task flow to be selected.\n\nPlease select at least one flow in the Workflow Task Flows section.');
        return;
      }
    }

    setIsLoading(true);
    try {
      await actions.startWorkflow({
        apiToken: config.apiToken,
        groupName: config.groupName,
        accountData: config.accountData,
        igAppVersionId: config.appVersionId || config.igAppVersionId,
        concurrencyLimit: config.concurrencyLimit,
        maxRetriesPerStage: config.maxRetriesPerStage,
        baseBackoffSeconds: config.baseBackoffSeconds,
        pollIntervalSeconds: config.pollIntervalSeconds,
        pollTimeoutSeconds: config.pollTimeoutSeconds,
        customLoginFlowId: config.customLoginFlowId || undefined,
        customLoginFlowParams: config.customLoginFlowParams?.length ? config.customLoginFlowParams : undefined,
        workflowType: config.workflowType,
        setupFlowIds: config.workflowType !== 'warmup' ? config.setupFlowIds : undefined,
      });
    } catch (error) {
      console.error('Failed to start workflow:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    setIsLoading(true);
    try {
      await actions.stopWorkflow();
    } catch (error) {
      console.error('Failed to stop workflow:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const [isStoppingPhones, setIsStoppingPhones] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const handleClear = async () => {
    setIsClearing(true);
    try {
      await actions.clearWorkflow();
    } catch (error) {
      console.error('Failed to clear workflow:', error);
    } finally {
      setIsClearing(false);
    }
  };

  const handleStopAllPhones = async () => {
    if (!config.apiToken) {
      alert('Please enter your GeeLark API token');
      return;
    }
    if (!config.groupName) {
      alert('Please select a phone group');
      return;
    }

    if (!confirm(`Stop all phones in group "${config.groupName}"?`)) {
      return;
    }

    setIsStoppingPhones(true);
    try {
      const response = await fetch('/api/geelark/phones/stop-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiToken}`,
        },
        body: JSON.stringify({ groupName: config.groupName }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to stop phones');
      }

      alert(data.message || `Stopped ${data.stoppedCount} phones`);
    } catch (error) {
      console.error('Failed to stop all phones:', error);
      alert(error instanceof Error ? error.message : 'Failed to stop phones');
    } finally {
      setIsStoppingPhones(false);
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'running':
        return 'bg-green-500';
      case 'stopping':
        return 'bg-yellow-500';
      case 'completed':
        return 'bg-blue-500';
      case 'stopped':
        return 'bg-orange-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="flex items-center gap-4">
      {/* Status Badge */}
      <Badge variant="outline" className={`${getStatusColor()} text-white`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>

      {/* Connection Status */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        {state.isConnected ? (
          <>
            <Wifi className="h-4 w-4 text-green-500" />
            <span>Connected</span>
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4 text-red-500" />
            <span>Disconnected</span>
          </>
        )}
      </div>

      {/* Error Display */}
      {state.error && (
        <span className="text-sm text-red-500 max-w-xs truncate" title={state.error}>
          {state.error}
        </span>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Control Buttons */}
      {status === 'idle' && (
        <Button
          onClick={handleStart}
          disabled={isLoading}
          className="gap-2"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Start Workflow
        </Button>
      )}

      {/* Cancel button when workflow is running or stopping */}
      {(status === 'running' || status === 'stopping') && (
        <Button
          onClick={handleStop}
          disabled={isLoading || status === 'stopping'}
          variant="destructive"
          className="gap-2"
        >
          {isLoading || status === 'stopping' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <X className="h-4 w-4" />
          )}
          Cancel
        </Button>
      )}

      {/* Clear Workflow button when completed or stopped */}
      {(status === 'completed' || status === 'stopped') && (
        <Button
          onClick={handleClear}
          disabled={isClearing}
          variant="outline"
          className="gap-2"
        >
          {isClearing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4" />
          )}
          Clear Workflow
        </Button>
      )}

      {/* Stop All Phones Button */}
      <Button
        onClick={handleStopAllPhones}
        disabled={isStoppingPhones || isRunning}
        variant="outline"
        className="gap-2"
        title="Stop all cloud phones in the selected group"
      >
        {isStoppingPhones ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Power className="h-4 w-4" />
        )}
        Stop All Phones
      </Button>
    </div>
  );
}
