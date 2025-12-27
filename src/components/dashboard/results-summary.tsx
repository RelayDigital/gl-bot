'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useResults, usePhones } from '@/hooks/use-workflow';
import { CheckCircle, XCircle, Clock, Circle } from 'lucide-react';

export function ResultsSummary() {
  const results = useResults();
  const phones = usePhones();

  // Calculate results from phones if no results summary yet
  const stats = results || {
    total: phones.length,
    completed: phones.filter((p) => p.state === 'DONE').length,
    failed: phones.filter((p) => p.state === 'FAILED').length,
    inProgress: phones.filter(
      (p) => !['IDLE', 'DONE', 'FAILED'].includes(p.state)
    ).length,
    pending: phones.filter((p) => p.state === 'IDLE').length,
    failedPhones: phones
      .filter((p) => p.state === 'FAILED')
      .map((p) => ({
        envId: p.envId,
        serialName: p.serialName,
        username: p.account?.username || null,
        error: p.lastError || 'Unknown error',
      })),
  };

  if (stats.total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        No results yet. Start a workflow to see results.
      </div>
    );
  }

  const successRate =
    stats.total > 0
      ? Math.round((stats.completed / stats.total) * 100)
      : 0;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Circle className="h-4 w-4" />
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-500 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {stats.completed}
            </div>
            <p className="text-xs text-muted-foreground">{successRate}% success</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-500 flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{stats.failed}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-500 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              In Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">
              {stats.inProgress}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.pending} pending
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Failed Phones List */}
      {stats.failedPhones.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-500">
              Failed Phones ({stats.failedPhones.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {stats.failedPhones.map((phone) => (
                  <div
                    key={phone.envId}
                    className="flex items-start gap-2 p-2 rounded bg-red-500/10 border border-red-500/20"
                  >
                    <Badge variant="outline" className="shrink-0">
                      {phone.serialName}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      {phone.username && (
                        <p className="text-sm font-medium truncate">
                          {phone.username}
                        </p>
                      )}
                      <p className="text-xs text-red-500 break-words">
                        {phone.error}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
