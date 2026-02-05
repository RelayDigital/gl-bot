'use client';

import { useMemo, useState, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CheckCircle2,
  XCircle,
  Video,
  User,
  KeyRound,
  AtSign,
  Type,
  Image,
  FileText,
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { WorkflowType } from '@/lib/state-machine/types';
import { generateUsernames } from '@/lib/utils/username-generator';

interface AccountDataPreviewProps {
  accountData: string;
  maxRows?: number;
  workflowType?: WorkflowType;
  onAccountDataChange?: (value: string) => void;
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

interface ModelProfile {
  displayName: string;
  profilePictureUrl?: string;
  bio?: string;
  lastUsername?: string;
  updatedAt: number;
}

const COLUMN_COUNT = 16;
const COLUMN_INDEX = {
  username: 0,
  password: 1,
  twoFactorSecret: 2,
  runWarmup: 3,
  browseVideo: 4,
  accountType: 5,
  newUsername: 6,
  newDisplayName: 7,
  profilePictureUrl: 8,
  bio: 9,
} as const;

const MODEL_PROFILES_KEY = 'glbot.modelProfiles.v1';

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

export function AccountDataPreview({
  accountData,
  maxRows = 50,
  workflowType,
  onAccountDataChange,
}: AccountDataPreviewProps) {
  const accounts = useMemo(() => parseAccountData(accountData), [accountData]);
  const displayAccounts = accounts.slice(0, maxRows);
  const hasMore = accounts.length > maxRows;
  const isEditable = typeof onAccountDataChange === 'function';
  const [bioVariants, setBioVariants] = useState<Map<number, { options: string[]; index: number }>>(new Map());
  const [bioLoading, setBioLoading] = useState<Map<number, boolean>>(new Map());
  const [bioErrors, setBioErrors] = useState<Map<number, string>>(new Map());
  const [profileLoading, setProfileLoading] = useState<Map<number, boolean>>(new Map());
  const [profileErrors, setProfileErrors] = useState<Map<number, string>>(new Map());
  const [draftValues, setDraftValues] = useState<Map<string, string>>(new Map());
  const [modelProfiles, setModelProfiles] = useState<Map<string, ModelProfile>>(new Map());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(MODEL_PROFILES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ModelProfile[];
      const next = new Map<string, ModelProfile>();
      parsed.forEach((profile) => {
        if (profile?.displayName) {
          next.set(profile.displayName.toLowerCase(), profile);
        }
      });
      setModelProfiles(next);
    } catch {
      // ignore
    }
  }, []);

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
  const showSetupFields = workflowType === 'setup' || workflowType === 'sister' || workflowType === 'custom' || hasSisterFields;

  const updateCell = (rowIndex: number, columnIndex: number, value: string) => {
    if (!onAccountDataChange) return;
    const lines = accountData.split('\n');
    if (rowIndex < 0 || rowIndex >= lines.length) return;

    const parts = lines[rowIndex].split('\t');
    while (parts.length < COLUMN_COUNT) {
      parts.push('');
    }
    parts[columnIndex] = value;
    lines[rowIndex] = parts.join('\t');
    onAccountDataChange(lines.join('\n'));
  };

  const updateDraft = (rowIndex: number, columnIndex: number, value: string) => {
    const key = `${rowIndex}:${columnIndex}`;
    setDraftValues(prev => {
      const next = new Map(prev);
      next.set(key, value);
      return next;
    });
  };

  const commitDraft = (rowIndex: number, columnIndex: number) => {
    const key = `${rowIndex}:${columnIndex}`;
    const value = draftValues.get(key);
    if (value === undefined) return;
    updateCell(rowIndex, columnIndex, value);
    setDraftValues(prev => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  };

  const getDraftValue = (rowIndex: number, columnIndex: number, fallback: string) => {
    const key = `${rowIndex}:${columnIndex}`;
    return draftValues.get(key) ?? fallback;
  };

  const normalizeDisplayName = (value: string) => value.trim().toLowerCase();

  const persistProfiles = (profiles: Map<string, ModelProfile>) => {
    if (typeof window === 'undefined') return;
    try {
      const payload = Array.from(profiles.values());
      window.localStorage.setItem(MODEL_PROFILES_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  };

  const upsertProfile = (profile: ModelProfile) => {
    const key = normalizeDisplayName(profile.displayName);
    if (!key) return;
    setModelProfiles(prev => {
      const next = new Map(prev);
      const existing = next.get(key);
      const merged: ModelProfile = {
        displayName: profile.displayName,
        profilePictureUrl: profile.profilePictureUrl || existing?.profilePictureUrl,
        bio: profile.bio || existing?.bio,
        lastUsername: profile.lastUsername || existing?.lastUsername,
        updatedAt: Date.now(),
      };
      next.set(key, merged);
      persistProfiles(next);
      return next;
    });
  };

  const applyProfileToRow = (rowIndex: number, profile: ModelProfile) => {
    const row = accounts[rowIndex];
    if (!row) return;
    if (!row.profilePictureUrl && profile.profilePictureUrl) {
      updateCell(rowIndex, COLUMN_INDEX.profilePictureUrl, profile.profilePictureUrl);
    }
    if (!row.bio && profile.bio) {
      updateCell(rowIndex, COLUMN_INDEX.bio, profile.bio);
    }
    const currentNewUsername = getDraftValue(rowIndex, COLUMN_INDEX.newUsername, row.newUsername);
    if (!currentNewUsername) {
      const candidates = generateUsernames(profile.displayName, 10);
      const generated =
        candidates.find(name => name && name !== profile.lastUsername) ||
        profile.lastUsername ||
        candidates[0];
      if (generated) {
        updateCell(rowIndex, COLUMN_INDEX.newUsername, generated);
        upsertProfile({ ...profile, lastUsername: generated, updatedAt: Date.now() });
      }
    }
  };

  const handleDisplayNameCommitted = (rowIndex: number, displayName: string) => {
    const trimmed = displayName.trim();
    if (!trimmed) return;
    const key = normalizeDisplayName(trimmed);
    const existing = modelProfiles.get(key);
    const row = accounts[rowIndex];
    const profile: ModelProfile = {
      displayName: trimmed,
      profilePictureUrl: row?.profilePictureUrl,
      bio: row?.bio,
      lastUsername: row?.newUsername,
      updatedAt: Date.now(),
    };
    if (existing) {
      applyProfileToRow(rowIndex, existing);
      upsertProfile({
        ...existing,
        ...profile,
        displayName: trimmed,
        updatedAt: Date.now(),
      });
    } else {
      upsertProfile(profile);
      applyProfileToRow(rowIndex, profile);
    }
  };

  const updateBioError = (rowIndex: number, message: string | null) => {
    setBioErrors(prev => {
      const next = new Map(prev);
      if (message) {
        next.set(rowIndex, message);
      } else {
        next.delete(rowIndex);
      }
      return next;
    });
  };

  const updateProfileError = (rowIndex: number, message: string | null) => {
    setProfileErrors(prev => {
      const next = new Map(prev);
      if (message) {
        next.set(rowIndex, message);
      } else {
        next.delete(rowIndex);
      }
      return next;
    });
  };

  const setRowLoading = (
    setter: Dispatch<SetStateAction<Map<number, boolean>>>,
    rowIndex: number,
    loading: boolean
  ) => {
    setter(prev => {
      const next = new Map(prev);
      if (loading) {
        next.set(rowIndex, true);
      } else {
        next.delete(rowIndex);
      }
      return next;
    });
  };

  const generateBioVariations = async (rowIndex: number, count = 3) => {
    if (!isEditable) return;
    setRowLoading(setBioLoading, rowIndex, true);
    updateBioError(rowIndex, null);

    try {
      const response = await fetch('/api/ai/generate-descriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count,
          provider: 'openai',
          tone: 'flirty',
          length: 'short',
          emojiLevel: 'lots',
          includeHashtags: false,
          includeCallToAction: true,
          contentType: 'bio',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate bios');
      }

      const data = await response.json();
      if (data.descriptions && Array.isArray(data.descriptions) && data.descriptions.length > 0) {
        const options = data.descriptions;
        setBioVariants(prev => {
          const next = new Map(prev);
          next.set(rowIndex, { options, index: 0 });
          return next;
        });
        updateCell(rowIndex, COLUMN_INDEX.bio, options[0]);
        const row = accounts[rowIndex];
        const displayName = getDraftValue(
          rowIndex,
          COLUMN_INDEX.newDisplayName,
          row?.newDisplayName || ''
        );
        if (displayName) {
          upsertProfile({
            displayName,
            profilePictureUrl: row?.profilePictureUrl,
            bio: options[0],
            lastUsername: row?.newUsername,
            updatedAt: Date.now(),
          });
        }
      }
    } catch (error) {
      updateBioError(rowIndex, error instanceof Error ? error.message : 'Failed to generate bios');
    } finally {
      setRowLoading(setBioLoading, rowIndex, false);
    }
  };

  const cycleBio = (rowIndex: number, direction: -1 | 1) => {
    const entry = bioVariants.get(rowIndex);
    if (!entry || entry.options.length === 0) return;
    const nextIndex = (entry.index + direction + entry.options.length) % entry.options.length;
    setBioVariants(prev => {
      const next = new Map(prev);
      next.set(rowIndex, { options: entry.options, index: nextIndex });
      return next;
    });
    updateCell(rowIndex, COLUMN_INDEX.bio, entry.options[nextIndex]);
  };

  const handleProfilePictureUpload = async (rowIndex: number, file: File) => {
    if (!isEditable) return;
    setRowLoading(setProfileLoading, rowIndex, true);
    updateProfileError(rowIndex, null);

    try {
      const formData = new FormData();
      formData.append('mediaType', 'profilePicture');
      formData.append('file_0', file);
      formData.append('row_0', String(rowIndex));

      const response = await fetch('/api/uploads', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const result = await response.json();
      const uploaded = result.files?.[0];
      if (uploaded?.path) {
        updateCell(rowIndex, COLUMN_INDEX.profilePictureUrl, uploaded.path);
        const row = accounts[rowIndex];
        const displayName = getDraftValue(
          rowIndex,
          COLUMN_INDEX.newDisplayName,
          row?.newDisplayName || ''
        );
        if (displayName) {
          upsertProfile({
            displayName,
            profilePictureUrl: uploaded.path,
            bio: row?.bio,
            lastUsername: row?.newUsername,
            updatedAt: Date.now(),
          });
        }
      }
    } catch (error) {
      updateProfileError(rowIndex, error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setRowLoading(setProfileLoading, rowIndex, false);
    }
  };

  return (
    <div className="border rounded-md">
      {isEditable && (
        <div className="px-3 py-2 text-xs text-muted-foreground border-b bg-muted/20">
          Empty cells are editable. Click to fill missing values.
        </div>
      )}
      <ScrollArea className="h-[280px]">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow className="border-b bg-muted/50">
              <TableHead className="w-12 text-center">#</TableHead>
              <TableHead>Username</TableHead>
              <TableHead className="w-24">Password</TableHead>
              <TableHead className="w-16 text-center">2FA</TableHead>
              {showSetupFields ? (
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
                  {isEditable ? (
                    <Input
                      value={getDraftValue(account.rowNumber - 1, COLUMN_INDEX.username, account.username)}
                      onChange={(e) => updateDraft(account.rowNumber - 1, COLUMN_INDEX.username, e.target.value)}
                      onBlur={() => commitDraft(account.rowNumber - 1, COLUMN_INDEX.username)}
                      placeholder="username"
                      className="h-7 text-xs font-mono"
                    />
                  ) : account.username ? (
                    account.username
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {isEditable ? (
                    <Input
                      type="password"
                      value={getDraftValue(account.rowNumber - 1, COLUMN_INDEX.password, account.password)}
                      onChange={(e) => updateDraft(account.rowNumber - 1, COLUMN_INDEX.password, e.target.value)}
                      onBlur={() => commitDraft(account.rowNumber - 1, COLUMN_INDEX.password)}
                      placeholder="password"
                      className="h-7 text-xs font-mono"
                    />
                  ) : (
                    maskPassword(account.password)
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {isEditable ? (
                    <Input
                      value={getDraftValue(account.rowNumber - 1, COLUMN_INDEX.twoFactorSecret, account.twoFactorSecret)}
                      onChange={(e) => updateDraft(account.rowNumber - 1, COLUMN_INDEX.twoFactorSecret, e.target.value)}
                      onBlur={() => commitDraft(account.rowNumber - 1, COLUMN_INDEX.twoFactorSecret)}
                      placeholder="2FA"
                      className="h-7 text-xs font-mono"
                    />
                  ) : account.twoFactorSecret ? (
                    <span title="2FA secret configured">
                      <KeyRound className="h-4 w-4 text-blue-500 mx-auto" />
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                {showSetupFields ? (
                  <>
                    <TableCell className="font-mono text-xs">
                      {isEditable ? (
                        <Input
                          value={getDraftValue(account.rowNumber - 1, COLUMN_INDEX.newUsername, account.newUsername)}
                          onChange={(e) => updateDraft(account.rowNumber - 1, COLUMN_INDEX.newUsername, e.target.value)}
                          onBlur={() => commitDraft(account.rowNumber - 1, COLUMN_INDEX.newUsername)}
                          placeholder="new username"
                          className="h-7 text-xs font-mono"
                        />
                      ) : account.newUsername ? (
                        <span className="flex items-center gap-1">
                          <AtSign className="h-3 w-3 text-muted-foreground" />
                          {account.newUsername}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {isEditable ? (
                        <Input
                          value={getDraftValue(account.rowNumber - 1, COLUMN_INDEX.newDisplayName, account.newDisplayName)}
                          onChange={(e) => updateDraft(account.rowNumber - 1, COLUMN_INDEX.newDisplayName, e.target.value)}
                          onBlur={() => {
                            const rowIndex = account.rowNumber - 1;
                            const value = getDraftValue(rowIndex, COLUMN_INDEX.newDisplayName, account.newDisplayName);
                            commitDraft(rowIndex, COLUMN_INDEX.newDisplayName);
                            handleDisplayNameCommitted(rowIndex, value);
                          }}
                          placeholder="display name"
                          className="h-7 text-xs"
                        />
                      ) : account.newDisplayName ? (
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
                      {isEditable && (
                        <input
                          id={`profile-picture-${account.rowNumber}`}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleProfilePictureUpload(account.rowNumber - 1, file);
                            }
                            e.currentTarget.value = '';
                          }}
                        />
                      )}
                      {account.profilePictureUrl ? (
                        <div className="flex flex-col items-center gap-1">
                          <img
                            src={account.profilePictureUrl}
                            alt="Profile"
                            className="h-8 w-8 rounded-full object-cover border"
                          />
                          {isEditable && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              disabled={profileLoading.get(account.rowNumber - 1)}
                              onClick={() =>
                                document.getElementById(`profile-picture-${account.rowNumber}`)?.click()
                              }
                            >
                              {profileLoading.get(account.rowNumber - 1) ? (
                                <>
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  Uploading
                                </>
                              ) : (
                                <>
                                  <Image className="h-3 w-3 mr-1" />
                                  Replace
                                </>
                              )}
                            </Button>
                          )}
                          {profileErrors.get(account.rowNumber - 1) && (
                            <span className="text-[10px] text-destructive">
                              {profileErrors.get(account.rowNumber - 1)}
                            </span>
                          )}
                        </div>
                      ) : isEditable ? (
                        <div className="flex flex-col items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={profileLoading.get(account.rowNumber - 1)}
                            onClick={() =>
                              document.getElementById(`profile-picture-${account.rowNumber}`)?.click()
                            }
                          >
                            {profileLoading.get(account.rowNumber - 1) ? (
                              <>
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Uploading
                              </>
                            ) : (
                              <>
                                <Image className="h-3 w-3 mr-1" />
                                Upload
                              </>
                            )}
                          </Button>
                          {profileErrors.get(account.rowNumber - 1) && (
                            <span className="text-[10px] text-destructive">
                              {profileErrors.get(account.rowNumber - 1)}
                            </span>
                          )}
                          {profileErrors.get(account.rowNumber - 1) && (
                            <span className="text-[10px] text-destructive">
                              {profileErrors.get(account.rowNumber - 1)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {account.bio ? (
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-1">
                            <FileText className="h-4 w-4 text-green-500" />
                            <span className="text-xs max-w-[160px] truncate" title={account.bio}>
                              {account.bio}
                            </span>
                          </div>
                          {isEditable && (
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1"
                                onClick={() => cycleBio(account.rowNumber - 1, -1)}
                                disabled={!bioVariants.get(account.rowNumber - 1)}
                                title="Previous variation"
                              >
                                <ChevronLeft className="h-3 w-3" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1"
                                onClick={() => cycleBio(account.rowNumber - 1, 1)}
                                disabled={!bioVariants.get(account.rowNumber - 1)}
                                title="Next variation"
                              >
                                <ChevronRight className="h-3 w-3" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1"
                                onClick={() => generateBioVariations(account.rowNumber - 1)}
                                disabled={bioLoading.get(account.rowNumber - 1)}
                                title="Regenerate bios"
                              >
                                {bioLoading.get(account.rowNumber - 1) ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : isEditable ? (
                        <div className="flex flex-col items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => generateBioVariations(account.rowNumber - 1)}
                            disabled={bioLoading.get(account.rowNumber - 1)}
                          >
                            {bioLoading.get(account.rowNumber - 1) ? (
                              <>
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Generating
                              </>
                            ) : (
                              <>
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Generate
                              </>
                            )}
                          </Button>
                          {bioErrors.get(account.rowNumber - 1) && (
                            <span className="text-[10px] text-destructive">
                              {bioErrors.get(account.rowNumber - 1)}
                            </span>
                          )}
                        </div>
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
                      {isEditable ? (
                        <Input
                          value={getDraftValue(account.rowNumber - 1, COLUMN_INDEX.accountType, account.accountType)}
                          onChange={(e) => updateDraft(account.rowNumber - 1, COLUMN_INDEX.accountType, e.target.value)}
                          onBlur={() => commitDraft(account.rowNumber - 1, COLUMN_INDEX.accountType)}
                          placeholder="reels/posts"
                          className="h-7 text-xs"
                        />
                      ) : account.accountType ? (
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
