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
import { Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { GeeLarkGroup } from '@/lib/geelark/types';

interface GroupSelectorProps {
  apiToken: string;
  selectedGroupId: string;
  selectedGroupName: string;
  onSelect: (groupId: string, groupName: string) => void;
  disabled?: boolean;
}

export function GroupSelector({
  apiToken,
  selectedGroupId,
  selectedGroupName,
  onSelect,
  disabled,
}: GroupSelectorProps) {
  const [groups, setGroups] = useState<GeeLarkGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchGroups = useCallback(async () => {
    if (!apiToken) {
      setError('API token required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/geelark/groups', {
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch groups');
      }

      setGroups(data.groups || []);
      setHasFetched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch groups');
    } finally {
      setIsLoading(false);
    }
  }, [apiToken]);

  // Auto-fetch when token is available and we haven't fetched yet
  useEffect(() => {
    if (apiToken && !hasFetched && !isLoading) {
      fetchGroups();
    }
  }, [apiToken, hasFetched, isLoading, fetchGroups]);

  // Reset when token changes
  useEffect(() => {
    setHasFetched(false);
    setGroups([]);
    setError(null);
  }, [apiToken]);

  const handleSelect = (groupId: string) => {
    const group = groups.find((g) => g.id === groupId);
    if (group) {
      onSelect(group.id, group.name);
    }
  };

  const hasToken = Boolean(apiToken);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Phone Group</Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchGroups}
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

      {error && (
        <div className="flex items-center gap-1 text-xs text-red-500">
          <AlertCircle className="h-3 w-3" />
          {error}
        </div>
      )}

      <Select
        value={selectedGroupId}
        onValueChange={handleSelect}
        disabled={disabled || isLoading || !hasToken}
      >
        <SelectTrigger>
          <SelectValue placeholder={hasToken ? 'Select a phone group' : 'Enter API token first'}>
            {selectedGroupName && (
              <span className="flex items-center gap-2">
                {selectedGroupName}
                {groups.find((g) => g.id === selectedGroupId)?.phoneCount !== undefined && (
                  <Badge variant="secondary" className="ml-auto">
                    {groups.find((g) => g.id === selectedGroupId)?.phoneCount} phones
                  </Badge>
                )}
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {groups.length === 0 && !isLoading && (
            <div className="p-2 text-sm text-muted-foreground text-center">
              {hasToken ? 'No groups found. Click Refresh to load.' : 'Enter API token first'}
            </div>
          )}
          {groups.map((group) => (
            <SelectItem key={group.id} value={group.id}>
              <span className="flex items-center justify-between w-full gap-4">
                <span>{group.name}</span>
                {group.phoneCount !== undefined && (
                  <Badge variant="outline" className="text-xs">
                    {group.phoneCount} phones
                  </Badge>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!hasToken && (
        <p className="text-xs text-muted-foreground">
          Enter your GeeLark API token above to load phone groups
        </p>
      )}
    </div>
  );
}
