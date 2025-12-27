'use client';

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CheckCircle2, XCircle, Video, User, KeyRound, AtSign, Type, Image, FileText } from 'lucide-react';

interface AccountDataPreviewProps {
  accountData: string;
  maxRows?: number;
}

interface ParsedAccount {
  rowNumber: number;
  username: string;
  password: string;
  twoFactorSecret: string;
  runWarmup: boolean;
  browseVideo: number;
  accountType: string;
  // Sister/Setup workflow fields
  newUsername: string;
  newDisplayName: string;
  profilePictureUrl: string;
  bio: string;
}

/**
 * Parse account data from TSV format
 * Column order: username, password, twoFactorSecret, runWarmup, browseVideo, accountType,
 *               newUsername, newDisplayName, profilePictureUrl, bio, ...
 */
function parseAccountData(data: string): ParsedAccount[] {
  if (!data.trim()) return [];

  const lines = data.trim().split('\n').filter(Boolean);
  return lines.map((line, idx) => {
    const parts = line.split('\t');
    return {
      rowNumber: idx + 1,
      username: parts[0] || '',
      password: parts[1] || '',
      twoFactorSecret: parts[2] || '',
      runWarmup: parts[3] !== 'false',
      browseVideo: parseInt(parts[4]) || 5,
      accountType: parts[5] || '',
      // Sister/Setup workflow fields (indices 6-9)
      newUsername: parts[6] || '',
      newDisplayName: parts[7] || '',
      profilePictureUrl: parts[8] || '',
      bio: parts[9] || '',
    };
  });
}

function maskPassword(password: string): string {
  if (!password) return '—';
  if (password.length <= 3) return '•'.repeat(password.length);
  return password.slice(0, 2) + '•'.repeat(Math.min(password.length - 2, 6));
}

export function AccountDataPreview({ accountData, maxRows = 50 }: AccountDataPreviewProps) {
  const accounts = useMemo(() => parseAccountData(accountData), [accountData]);
  const displayAccounts = accounts.slice(0, maxRows);
  const hasMore = accounts.length > maxRows;

  if (accounts.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground border rounded-md bg-muted/20">
        <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No accounts loaded</p>
        <p className="text-xs mt-1">Upload a CSV file or paste account data</p>
      </div>
    );
  }

  // Check if any sister/setup fields are used
  const hasSisterFields = accounts.some(a => a.newUsername || a.newDisplayName || a.profilePictureUrl || a.bio);

  return (
    <div className="border rounded-md">
      <ScrollArea className="h-[280px]">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow className="border-b bg-muted/50">
              <TableHead className="w-12 text-center">#</TableHead>
              <TableHead>Username</TableHead>
              <TableHead className="w-24">Password</TableHead>
              <TableHead className="w-16 text-center">2FA</TableHead>
              {hasSisterFields ? (
                <>
                  <TableHead className="w-28">New Username</TableHead>
                  <TableHead className="w-28">Display Name</TableHead>
                  <TableHead className="w-16 text-center">Pic</TableHead>
                  <TableHead className="w-16 text-center">Bio</TableHead>
                </>
              ) : (
                <>
                  <TableHead className="w-20 text-center">Warmup</TableHead>
                  <TableHead className="w-20 text-center">Videos</TableHead>
                  <TableHead className="w-20">Type</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayAccounts.map((account) => (
              <TableRow key={account.rowNumber} className="hover:bg-muted/30">
                <TableCell className="text-center text-muted-foreground font-mono text-xs">
                  {account.rowNumber}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {account.username || <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {maskPassword(account.password)}
                </TableCell>
                <TableCell className="text-center">
                  {account.twoFactorSecret ? (
                    <span title="2FA secret configured">
                      <KeyRound className="h-4 w-4 text-blue-500 mx-auto" />
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                {hasSisterFields ? (
                  <>
                    <TableCell className="font-mono text-xs">
                      {account.newUsername ? (
                        <span className="flex items-center gap-1">
                          <AtSign className="h-3 w-3 text-muted-foreground" />
                          {account.newUsername}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {account.newDisplayName ? (
                        <span className="flex items-center gap-1">
                          <Type className="h-3 w-3 text-muted-foreground" />
                          {account.newDisplayName.length > 15
                            ? account.newDisplayName.slice(0, 15) + '...'
                            : account.newDisplayName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {account.profilePictureUrl ? (
                        <Image className="h-4 w-4 text-green-500 mx-auto" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {account.bio ? (
                        <FileText className="h-4 w-4 text-green-500 mx-auto" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="text-center">
                      {account.runWarmup ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground mx-auto" />
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {account.runWarmup ? (
                        <Badge variant="secondary" className="gap-1 font-mono">
                          <Video className="h-3 w-3" />
                          {account.browseVideo}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {account.accountType ? (
                        <Badge variant="outline" className="text-xs capitalize">
                          {account.accountType}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
      {hasMore && (
        <div className="text-center py-2 text-xs text-muted-foreground border-t bg-muted/30">
          Showing {maxRows} of {accounts.length} accounts
        </div>
      )}
    </div>
  );
}
