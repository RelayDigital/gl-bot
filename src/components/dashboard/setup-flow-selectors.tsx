'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, AlertCircle, X } from 'lucide-react';
import { TaskFlow } from '@/lib/geelark/types';
import { SetupFlowIds, WorkflowType } from '@/lib/state-machine/types';

interface SetupFlowSelectorsProps {
  apiToken: string;
  workflowType: WorkflowType;
  setupFlowIds: SetupFlowIds;
  setupFlowTitles: Record<keyof SetupFlowIds, string>;
  onSelect: (
    key: keyof SetupFlowIds,
    flowId: string | undefined,
    flowTitle: string
  ) => void;
  disabled?: boolean;
}

interface FlowConfig {
  key: keyof SetupFlowIds;
  label: string;
  description: string;
}

/**
 * All available task flows
 */
const ALL_FLOWS: FlowConfig[] = [
  {
    key: 'renameUsername',
    label: 'Rename Username',
    description: 'Task flow to rename the account username',
  },
  {
    key: 'editDisplayName',
    label: 'Edit Display Name',
    description: 'Task flow to edit the account display name',
  },
  {
    key: 'setProfilePicture',
    label: 'Set Profile Picture',
    description: 'Task flow to set the account profile picture',
  },
  {
    key: 'setBio',
    label: 'Set Bio',
    description: 'Task flow to set the account bio/description',
  },
  {
    key: 'createPost',
    label: 'Create Post',
    description: 'Task flow to create feed posts',
  },
  {
    key: 'createStoryHighlight',
    label: 'Create Story Highlight',
    description: 'Task flow to create story highlights',
  },
  {
    key: 'setPrivate',
    label: 'Set Private',
    description: 'Task flow to set account to private',
  },
  {
    key: 'enable2FA',
    label: 'Enable 2FA',
    description: 'Task flow to enable two-factor authentication',
  },
];

/**
 * Get flows relevant to a specific workflow type
 */
function getFlowsForWorkflowType(workflowType: WorkflowType): FlowConfig[] {
  switch (workflowType) {
    case 'setup':
      // Setup workflow: profile, bio, posts, highlight, private, 2FA
      return ALL_FLOWS.filter(f =>
        ['setProfilePicture', 'setBio', 'createPost', 'createStoryHighlight', 'setPrivate', 'enable2FA'].includes(f.key)
      );
    case 'sister':
      // Sister workflow: rename, display name, profile, bio only
      return ALL_FLOWS.filter(f =>
        ['renameUsername', 'editDisplayName', 'setProfilePicture', 'setBio'].includes(f.key)
      );
    case 'custom':
      // Custom workflow: all flows available
      return ALL_FLOWS;
    default:
      // Warmup and others: no task flows needed
      return [];
  }
}

export function SetupFlowSelectors({
  apiToken,
  workflowType,
  setupFlowIds,
  setupFlowTitles,
  onSelect,
  disabled,
}: SetupFlowSelectorsProps) {
  const [taskFlows, setTaskFlows] = useState<TaskFlow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  // Get flows relevant to the current workflow type
  const relevantFlows = useMemo(() => getFlowsForWorkflowType(workflowType), [workflowType]);

  const fetchTaskFlows = useCallback(async () => {
    if (!apiToken) {
      setError('API token required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/geelark/task-flows', {
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch task flows');
      }

      setTaskFlows(data.taskFlows || []);
      setHasFetched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch task flows');
    } finally {
      setIsLoading(false);
    }
  }, [apiToken]);

  // Auto-fetch when token is available and we haven't fetched yet
  useEffect(() => {
    if (apiToken && !hasFetched && !isLoading) {
      fetchTaskFlows();
    }
  }, [apiToken, hasFetched, isLoading, fetchTaskFlows]);

  // Reset when token changes
  useEffect(() => {
    setHasFetched(false);
    setTaskFlows([]);
    setError(null);
  }, [apiToken]);

  const hasToken = Boolean(apiToken);

  // Don't render if no flows are relevant to this workflow type
  if (relevantFlows.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Workflow Task Flows</Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchTaskFlows}
          disabled={!hasToken || isLoading || disabled}
          className="h-6 px-2"
        >
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          <span className="ml-1 text-xs">Refresh Flows</span>
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-1 text-xs text-red-500">
          <AlertCircle className="h-3 w-3" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {relevantFlows.map((flowConfig) => (
          <SetupFlowItem
            key={flowConfig.key}
            flowConfig={flowConfig}
            taskFlows={taskFlows}
            selectedFlowId={setupFlowIds?.[flowConfig.key]}
            selectedFlowTitle={setupFlowTitles?.[flowConfig.key] || ''}
            onSelect={(flowId, title) => onSelect(flowConfig.key, flowId, title)}
            disabled={disabled || isLoading || !hasToken}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Select which operations to perform. Each selected flow will run in sequence.
      </p>
    </div>
  );
}

interface SetupFlowItemProps {
  flowConfig: FlowConfig;
  taskFlows: TaskFlow[];
  selectedFlowId: string | undefined;
  selectedFlowTitle: string;
  onSelect: (flowId: string | undefined, title: string) => void;
  disabled?: boolean;
}

function SetupFlowItem({
  flowConfig,
  taskFlows,
  selectedFlowId,
  selectedFlowTitle,
  onSelect,
  disabled,
}: SetupFlowItemProps) {
  const handleSelect = (flowId: string) => {
    if (flowId === '__none__') {
      onSelect(undefined, '');
      return;
    }
    const flow = taskFlows.find((f) => f.id === flowId);
    if (flow) {
      onSelect(flow.id, flow.title);
    }
  };

  const selectedFlow = taskFlows.find((f) => f.id === selectedFlowId);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">
          {flowConfig.label}
        </Label>
        {selectedFlowId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelect(undefined, '')}
            disabled={disabled}
            className="h-5 w-5 p-0 ml-auto"
            title="Clear selection"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      <Select
        value={selectedFlowId || '__none__'}
        onValueChange={handleSelect}
        disabled={disabled}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Select flow...">
            {selectedFlowTitle ? (
              <span className="flex items-center gap-2">
                {selectedFlowTitle}
                {selectedFlow?.params && selectedFlow.params.length > 0 && (
                  <Badge variant="secondary" className="ml-auto text-xs px-1">
                    {selectedFlow.params.length}p
                  </Badge>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">None (skip)</span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">
            <span className="text-muted-foreground">None (skip this step)</span>
          </SelectItem>
          {taskFlows.length === 0 && (
            <div className="p-2 text-xs text-muted-foreground text-center">
              No task flows found
            </div>
          )}
          {taskFlows.map((flow) => (
            <SelectItem key={flow.id} value={flow.id}>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-xs">{flow.title}</span>
                {flow.params && flow.params.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Params: {flow.params.join(', ')}
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <p className="text-xs text-muted-foreground">{flowConfig.description}</p>
    </div>
  );
}
