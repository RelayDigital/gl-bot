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
import { Loader2, RefreshCw, AlertCircle, X } from 'lucide-react';
import { TaskFlow } from '@/lib/geelark/types';

interface TaskFlowSelectorProps {
  apiToken: string;
  selectedFlowId: string;
  selectedFlowTitle: string;
  onSelect: (flowId: string, flowTitle: string, params: string[]) => void;
  onClear: () => void;
  disabled?: boolean;
}

export function TaskFlowSelector({
  apiToken,
  selectedFlowId,
  selectedFlowTitle,
  onSelect,
  onClear,
  disabled,
}: TaskFlowSelectorProps) {
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

  const handleSelect = (flowId: string) => {
    if (flowId === '__none__') {
      onClear();
      return;
    }
    const flow = taskFlows.find((f) => f.id === flowId);
    if (flow) {
      onSelect(flow.id, flow.title, flow.params);
    }
  };

  const hasToken = Boolean(apiToken);
  const selectedFlow = taskFlows.find((f) => f.id === selectedFlowId);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">
          Custom Login Flow (for 2FA)
        </Label>
        <div className="flex items-center gap-1">
          {selectedFlowId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              disabled={disabled}
              className="h-6 px-2"
              title="Clear selection"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
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
            <span className="ml-1 text-xs">Refresh</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-1 text-xs text-red-500">
          <AlertCircle className="h-3 w-3" />
          {error}
        </div>
      )}

      <Select
        value={selectedFlowId || '__none__'}
        onValueChange={handleSelect}
        disabled={disabled || isLoading || !hasToken}
      >
        <SelectTrigger>
          <SelectValue placeholder={hasToken ? 'None (use built-in login)' : 'Enter API token first'}>
            {selectedFlowTitle ? (
              <span className="flex items-center gap-2">
                {selectedFlowTitle}
                {selectedFlow?.params && selectedFlow.params.length > 0 && (
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {selectedFlow.params.length} params
                  </Badge>
                )}
              </span>
            ) : (
              'None (use built-in login)'
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">
            <span className="text-muted-foreground">None (use built-in login)</span>
          </SelectItem>
          {taskFlows.length === 0 && !isLoading && hasToken && (
            <div className="p-2 text-sm text-muted-foreground text-center">
              No task flows found
            </div>
          )}
          {taskFlows.map((flow) => (
            <SelectItem key={flow.id} value={flow.id}>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{flow.title}</span>
                {flow.desc && (
                  <span className="text-xs text-muted-foreground truncate max-w-[250px]">
                    {flow.desc}
                  </span>
                )}
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

      <p className="text-xs text-muted-foreground">
        Optional: Select a custom RPA flow for 2FA login support
      </p>
    </div>
  );
}
