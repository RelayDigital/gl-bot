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
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, AlertCircle, X, Plus, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { TaskFlow } from '@/lib/geelark/types';
import { SetupFlowIds } from '@/lib/state-machine/types';

interface CustomTaskBuilderProps {
  apiToken: string;
  setupFlowIds: SetupFlowIds;
  setupFlowTitles: Record<keyof SetupFlowIds, string>;
  customTaskOrder: (keyof SetupFlowIds)[];
  onFlowSelect: (
    key: keyof SetupFlowIds,
    flowId: string | undefined,
    flowTitle: string
  ) => void;
  onTaskOrderChange: (taskOrder: (keyof SetupFlowIds)[]) => void;
  disabled?: boolean;
}

interface TaskConfig {
  key: keyof SetupFlowIds;
  label: string;
  description: string;
}

/**
 * All available task types for custom workflows
 */
const ALL_TASKS: TaskConfig[] = [
  {
    key: 'renameUsername',
    label: 'Rename Username',
    description: 'Change the account username',
  },
  {
    key: 'editDisplayName',
    label: 'Edit Display Name',
    description: 'Edit the account display name',
  },
  {
    key: 'setProfilePicture',
    label: 'Set Profile Picture',
    description: 'Set the account profile picture',
  },
  {
    key: 'setBio',
    label: 'Set Bio',
    description: 'Set the account bio/description',
  },
  {
    key: 'createPost',
    label: 'Create Post',
    description: 'Create feed posts',
  },
  {
    key: 'createStoryHighlight',
    label: 'Create Story Highlight',
    description: 'Create story highlights',
  },
  {
    key: 'setPrivate',
    label: 'Set Private',
    description: 'Set account to private',
  },
  {
    key: 'enable2FA',
    label: 'Enable 2FA',
    description: 'Enable two-factor authentication',
  },
];

export function CustomTaskBuilder({
  apiToken,
  setupFlowIds,
  setupFlowTitles,
  customTaskOrder,
  onFlowSelect,
  onTaskOrderChange,
  disabled,
}: CustomTaskBuilderProps) {
  const [taskFlows, setTaskFlows] = useState<TaskFlow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

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

  // Auto-fetch when token is available
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

  // Get tasks that are not yet in the order
  const availableTasks = ALL_TASKS.filter(t => !customTaskOrder.includes(t.key));

  const handleAddTask = (taskKey: keyof SetupFlowIds) => {
    onTaskOrderChange([...customTaskOrder, taskKey]);
  };

  const handleRemoveTask = (index: number) => {
    const taskKey = customTaskOrder[index];
    const newOrder = customTaskOrder.filter((_, i) => i !== index);
    onTaskOrderChange(newOrder);
    // Also clear the flow selection
    onFlowSelect(taskKey, undefined, '');
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newOrder = [...customTaskOrder];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    onTaskOrderChange(newOrder);
  };

  const handleMoveDown = (index: number) => {
    if (index === customTaskOrder.length - 1) return;
    const newOrder = [...customTaskOrder];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    onTaskOrderChange(newOrder);
  };

  const handleFlowSelect = (taskKey: keyof SetupFlowIds, flowId: string) => {
    if (flowId === '__none__') {
      onFlowSelect(taskKey, undefined, '');
      return;
    }
    const flow = taskFlows.find((f) => f.id === flowId);
    if (flow) {
      onFlowSelect(taskKey, flow.id, flow.title);
    }
  };

  const getTaskConfig = (key: keyof SetupFlowIds) => {
    return ALL_TASKS.find(t => t.key === key);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Custom Workflow Tasks</Label>
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

      {/* Task List */}
      <div className="space-y-2">
        {customTaskOrder.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg">
            No tasks added yet. Add tasks below to build your custom workflow.
          </div>
        ) : (
          customTaskOrder.map((taskKey, index) => {
            const taskConfig = getTaskConfig(taskKey);
            if (!taskConfig) return null;

            return (
              <div
                key={`${taskKey}-${index}`}
                className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30"
              >
                {/* Order controls */}
                <div className="flex flex-col gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMoveUp(index)}
                    disabled={disabled || index === 0}
                    className="h-5 w-5 p-0"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMoveDown(index)}
                    disabled={disabled || index === customTaskOrder.length - 1}
                    className="h-5 w-5 p-0"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </div>

                {/* Step number */}
                <Badge variant="outline" className="shrink-0">
                  {index + 1}
                </Badge>

                {/* Task info and flow selector */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{taskConfig.label}</span>
                  </div>
                  <Select
                    value={setupFlowIds?.[taskKey] || '__none__'}
                    onValueChange={(value) => handleFlowSelect(taskKey, value)}
                    disabled={disabled || isLoading || !hasToken}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select flow...">
                        {setupFlowTitles?.[taskKey] || (
                          <span className="text-muted-foreground">Select a flow...</span>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        <span className="text-muted-foreground">None (skip this step)</span>
                      </SelectItem>
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
                </div>

                {/* Remove button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveTask(index)}
                  disabled={disabled}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })
        )}
      </div>

      {/* Add task dropdown */}
      {availableTasks.length > 0 && (
        <div className="flex items-center gap-2">
          <Select
            onValueChange={(value) => handleAddTask(value as keyof SetupFlowIds)}
            disabled={disabled}
          >
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Add a task...">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Plus className="h-4 w-4" />
                  Add a task...
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {availableTasks.map((task) => (
                <SelectItem key={task.key} value={task.key}>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{task.label}</span>
                    <span className="text-xs text-muted-foreground">{task.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Add tasks to your workflow and reorder them using the arrow buttons. Each task needs a flow assigned.
      </p>
    </div>
  );
}
