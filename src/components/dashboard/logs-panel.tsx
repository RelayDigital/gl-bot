'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLogs } from '@/hooks/use-workflow';
import { LogEntry } from '@/lib/state-machine/types';
import { Filter, X } from 'lucide-react';

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function LogEntryRow({ log }: { log: LogEntry }) {
  const levelColors: Record<string, string> = {
    info: 'text-blue-400',
    warn: 'text-yellow-400',
    error: 'text-red-400',
    debug: 'text-gray-500',
  };

  return (
    <div className="font-mono text-xs py-0.5 flex gap-2">
      <span className="text-gray-500 shrink-0">
        {formatTime(log.timestamp)}
      </span>
      <span className={`shrink-0 w-12 ${levelColors[log.level] || 'text-gray-500'}`}>
        [{log.level.toUpperCase()}]
      </span>
      {log.phoneName && (
        <span className="text-purple-400 shrink-0">[{log.phoneName}]</span>
      )}
      <span className="text-gray-200 break-all">{log.message}</span>
    </div>
  );
}

export function LogsPanel() {
  const logs = useLogs();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAutoScrollRef = useRef(true);
  const [phoneFilter, setPhoneFilter] = useState<string>('all');
  const [levelFilter, setLevelFilter] = useState<string>('all');

  // Extract unique phone names from logs
  const phoneNames = useMemo(() => {
    const names = new Set<string>();
    for (const log of logs) {
      if (log.phoneName) {
        names.add(log.phoneName);
      }
    }
    return Array.from(names).sort();
  }, [logs]);

  // Filter logs based on selection
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Phone filter
      if (phoneFilter !== 'all') {
        if (phoneFilter === 'orchestrator') {
          if (log.phoneName) return false;
        } else {
          if (log.phoneName !== phoneFilter) return false;
        }
      }

      // Level filter
      if (levelFilter !== 'all' && log.level !== levelFilter) {
        return false;
      }

      return true;
    });
  }, [logs, phoneFilter, levelFilter]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (isAutoScrollRef.current && scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector(
        '[data-radix-scroll-area-viewport]'
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [filteredLogs]);

  // Detect if user has scrolled up
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const isAtBottom =
      Math.abs(target.scrollHeight - target.scrollTop - target.clientHeight) < 50;
    isAutoScrollRef.current = isAtBottom;
  };

  const hasActiveFilters = phoneFilter !== 'all' || levelFilter !== 'all';

  const clearFilters = () => {
    setPhoneFilter('all');
    setLevelFilter('all');
  };

  if (logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] rounded-md border border-gray-700 bg-gray-900 text-gray-500 font-mono text-sm">
        No logs yet. Start a workflow to see logs.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Filter controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-gray-500" />

        {/* Phone filter */}
        <Select value={phoneFilter} onValueChange={setPhoneFilter}>
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder="Filter by phone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="orchestrator">Orchestrator Only</SelectItem>
            {phoneNames.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Level filter */}
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue placeholder="Log level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="error">Errors</SelectItem>
            <SelectItem value="warn">Warnings</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="debug">Debug</SelectItem>
          </SelectContent>
        </Select>

        {/* Clear filters button */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-8 px-2 text-xs gap-1"
          >
            <X className="h-3 w-3" />
            Clear
          </Button>
        )}

        {/* Log count */}
        <span className="text-xs text-gray-500 ml-auto">
          {filteredLogs.length === logs.length
            ? `${logs.length} logs`
            : `${filteredLogs.length} / ${logs.length} logs`}
        </span>
      </div>

      {/* Logs display */}
      <ScrollArea
        ref={scrollRef}
        className="h-[400px] rounded-md border border-gray-700 bg-gray-900 p-2"
        onScrollCapture={handleScroll}
      >
        <div className="space-y-0">
          {filteredLogs.length === 0 ? (
            <div className="text-gray-500 text-xs py-4 text-center">
              No logs match the current filters
            </div>
          ) : (
            filteredLogs.map((log) => (
              <LogEntryRow key={log.id} log={log} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
