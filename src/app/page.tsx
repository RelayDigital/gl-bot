'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ConfigPanel } from '@/components/dashboard/config-panel';
import { RunControl } from '@/components/dashboard/run-control';
import { PhoneGrid } from '@/components/dashboard/phone-grid';
import { LogsPanel } from '@/components/dashboard/logs-panel';
import { ResultsSummary } from '@/components/dashboard/results-summary';
import { useSSE } from '@/hooks/use-sse';
import { useIsRunning } from '@/hooks/use-workflow';
import { useSavedConfig, SavedConfig } from '@/hooks/use-local-storage';

export default function Dashboard() {
  // Connect to SSE for real-time updates
  useSSE();

  // Get saved config and running state
  const [savedConfig] = useSavedConfig();
  const [config, setConfig] = useState<SavedConfig>(savedConfig);
  const isRunning = useIsRunning();

  // Sync config from localStorage on mount
  useEffect(() => {
    setConfig(savedConfig);
  }, [savedConfig]);

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">GL Bot</h1>
              <p className="text-sm text-muted-foreground">
                Multi-Platform Automation State Machine
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Config Panel */}
        <ConfigPanel onConfigChange={setConfig} disabled={isRunning} />

        {/* Run Control */}
        <div className="flex items-center gap-4">
          <RunControl config={config} />
        </div>

        <Separator />

        {/* Tabbed Content */}
        <Tabs defaultValue="phones" className="space-y-4">
          <TabsList>
            <TabsTrigger value="phones">Phones</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
          </TabsList>

          <TabsContent value="phones" className="mt-4">
            <PhoneGrid />
          </TabsContent>

          <TabsContent value="logs" className="mt-4">
            <LogsPanel />
          </TabsContent>

          <TabsContent value="results" className="mt-4">
            <ResultsSummary />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
