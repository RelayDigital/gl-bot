'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileSpreadsheet, AlertCircle, Check, Download } from 'lucide-react';
import {
  parseCSV,
  autoDetectMappings,
  applyMapping,
  validateMapping,
  readFileAsText,
  HeaderMapping,
  AccountField,
  ALL_FIELDS,
  REQUIRED_FIELDS,
  CSVParseResult,
  getFieldCategory,
  getWorkflowFields,
} from '@/lib/utils/csv-parser';
import { WorkflowType, WORKFLOW_LABELS, SetupFlowIds } from '@/lib/state-machine/types';

interface CSVUploadProps {
  onAccountsLoaded: (accounts: { username: string; password: string; twoFactorSecret?: string; flags: Record<string, unknown> }[]) => void;
  disabled?: boolean;
  workflowType: WorkflowType;
  setupFlowIds?: SetupFlowIds;
  hasCustomLoginFlow?: boolean;
}

const FIELD_LABELS: Record<AccountField, string> = {
  username: 'Username',
  password: 'Password',
  twoFactorSecret: '2FA Secret',
  runWarmup: 'Run Warmup',
  warmupBrowseVideo: 'Videos to Browse',
  accountType: 'Account Type',
  profilePictureUrl: 'Profile Picture URL',
  bio: 'Bio',
  post1Description: 'Post 1 Caption',
  post1MediaUrls: 'Post 1 Media URLs',
  post2Description: 'Post 2 Caption',
  post2MediaUrls: 'Post 2 Media URLs',
  highlightTitle: 'Highlight Title',
  highlightCoverUrl: 'Highlight Cover URL',
  newUsername: 'New Username',
  newDisplayName: 'New Display Name',
  // Reddit fields
  redditWarmupKeyword: 'Reddit Warmup Keyword',
  redditPost1Title: 'Reddit Post 1 Title',
  redditPost1Description: 'Reddit Post 1 Body',
  redditPost1Community: 'Reddit Post 1 Subreddit',
  redditPost1MediaUrls: 'Reddit Post 1 Media URLs',
  redditPost2Title: 'Reddit Post 2 Title',
  redditPost2Description: 'Reddit Post 2 Body',
  redditPost2Community: 'Reddit Post 2 Subreddit',
  redditPost2MediaUrls: 'Reddit Post 2 Media URLs',
};

const FIELD_DESCRIPTIONS: Record<AccountField, string> = {
  username: 'Account username or email',
  password: 'Account password',
  twoFactorSecret: 'TOTP secret for 2FA login (used with custom login flow)',
  runWarmup: 'Whether to run warmup (true/false)',
  warmupBrowseVideo: 'Number of videos to browse during warmup',
  accountType: 'Content type: reels or posts',
  profilePictureUrl: 'URL to profile picture image',
  bio: 'Account bio/description text',
  post1Description: 'Caption for first post (Setup workflow)',
  post1MediaUrls: 'Media URLs for first post (comma-separated)',
  post2Description: 'Caption for second post (Setup workflow)',
  post2MediaUrls: 'Media URLs for second post (comma-separated)',
  highlightTitle: 'Story highlight title',
  highlightCoverUrl: 'URL to highlight cover image',
  newUsername: 'New username to rename account to (Sister workflow)',
  newDisplayName: 'New display name for account (Sister workflow)',
  // Reddit fields
  redditWarmupKeyword: 'Keyword to search and browse on Reddit',
  redditPost1Title: 'Title for first Reddit post',
  redditPost1Description: 'Body text for first Reddit post',
  redditPost1Community: 'Subreddit to post to (without r/)',
  redditPost1MediaUrls: 'Media URLs for first post (comma-separated)',
  redditPost2Title: 'Title for second Reddit post',
  redditPost2Description: 'Body text for second Reddit post',
  redditPost2Community: 'Subreddit to post to (without r/)',
  redditPost2MediaUrls: 'Media URLs for second post (comma-separated)',
};

/**
 * Sample data for each field
 */
const SAMPLE_DATA: Record<AccountField, string[]> = {
  username: ['user1@example.com', 'user2@example.com', 'user3@example.com'],
  password: ['password123', 'password456', 'password789'],
  twoFactorSecret: ['JBSWY3DPEHPK3PXP', '', 'GEZDGNBVGY3TQOJQ'],
  runWarmup: ['true', 'true', 'false'],
  warmupBrowseVideo: ['5', '3', '0'],
  accountType: ['reels', 'posts', 'reels'],
  profilePictureUrl: ['https://example.com/pic1.jpg', 'https://example.com/pic2.jpg', 'https://example.com/pic3.jpg'],
  bio: ['Travel enthusiast | Photography lover', 'Food blogger | Recipe creator', 'Fitness journey | Health tips'],
  post1Description: ['My first adventure post!', 'Delicious homemade pasta', 'Morning workout complete!'],
  post1MediaUrls: ['https://example.com/post1.jpg', 'https://example.com/food1.jpg', 'https://example.com/workout.mp4'],
  post2Description: ['Another beautiful day', 'Weekend brunch vibes', ''],
  post2MediaUrls: ['https://example.com/post2a.jpg;https://example.com/post2b.jpg', 'https://example.com/brunch.jpg', ''],
  highlightTitle: ['Best Moments', 'Recipes', 'Fitness Tips'],
  highlightCoverUrl: ['https://example.com/hl1.jpg', 'https://example.com/hl2.jpg', 'https://example.com/hl3.jpg'],
  newUsername: ['newuser1', 'newuser2', 'newuser3'],
  newDisplayName: ['John Smith', 'Jane Doe', 'Mike Johnson'],
  // Reddit fields
  redditWarmupKeyword: ['technology', 'gaming', 'photography'],
  redditPost1Title: ['Check out my new project!', 'Amazing photo from today', 'Discussion topic'],
  redditPost1Description: ['Here is some context about my project...', 'Taken with my phone camera', 'What do you all think?'],
  redditPost1Community: ['technology', 'pics', 'askreddit'],
  redditPost1MediaUrls: ['https://example.com/reddit1.jpg', 'https://example.com/photo1.jpg', 'https://example.com/vid1.mp4'],
  redditPost2Title: ['Follow-up post', 'Another great shot', ''],
  redditPost2Description: ['More updates on the project', 'Different angle', ''],
  redditPost2Community: ['programming', 'photography', ''],
  redditPost2MediaUrls: ['https://example.com/reddit2.jpg', 'https://example.com/photo2.jpg', ''],
};

/**
 * Get columns for sample CSV based on workflow type and selected flows
 *
 * - Premade workflows (warmup, setup, sister): Fixed columns for all params the workflow needs
 * - Custom workflow: Dynamic columns based on which task flows are selected
 */
function getSampleColumns(
  workflowType: WorkflowType,
  setupFlowIds?: SetupFlowIds,
  hasCustomLoginFlow?: boolean
): AccountField[] {
  // Base columns always included
  const columns: AccountField[] = ['username', 'password'];

  // Add 2FA secret if custom login flow is configured
  if (hasCustomLoginFlow) {
    columns.push('twoFactorSecret');
  }

  if (workflowType === 'warmup') {
    // Warmup workflow - fixed columns for all warmup params
    columns.push(
      'runWarmup',
      'warmupBrowseVideo',
      'accountType',
      'post1Description',
      'post1MediaUrls',
      'post2Description',
      'post2MediaUrls'
    );
  } else if (workflowType === 'setup') {
    // Setup workflow - fixed columns for all setup params
    columns.push(
      'profilePictureUrl',
      'bio',
      'post1Description',
      'post1MediaUrls',
      'post2Description',
      'post2MediaUrls',
      'highlightTitle',
      'highlightCoverUrl'
    );
  } else if (workflowType === 'sister') {
    // Sister workflow - fixed columns for all sister params
    columns.push(
      'newUsername',
      'newDisplayName',
      'profilePictureUrl',
      'bio'
    );
  } else if (workflowType === 'post') {
    // Post only workflow - just post columns
    columns.push(
      'post1Description',
      'post1MediaUrls',
      'post2Description',
      'post2MediaUrls'
    );
  } else if (workflowType === 'custom') {
    // Custom workflow - dynamic columns based on selected flows
    if (setupFlowIds?.renameUsername) columns.push('newUsername');
    if (setupFlowIds?.editDisplayName) columns.push('newDisplayName');
    if (setupFlowIds?.setProfilePicture) columns.push('profilePictureUrl');
    if (setupFlowIds?.setBio) columns.push('bio');
    if (setupFlowIds?.createPost) {
      columns.push('post1Description', 'post1MediaUrls', 'post2Description', 'post2MediaUrls');
    }
    if (setupFlowIds?.createStoryHighlight) {
      columns.push('highlightTitle', 'highlightCoverUrl');
    }
  }

  return columns;
}

/**
 * Generate sample CSV content dynamically based on workflow and selected flows
 */
function generateSampleCSV(
  workflowType: WorkflowType,
  setupFlowIds?: SetupFlowIds,
  hasCustomLoginFlow?: boolean
): string {
  const columns = getSampleColumns(workflowType, setupFlowIds, hasCustomLoginFlow);

  // Header row
  const header = columns.join(',');

  // Data rows (3 sample accounts)
  const rows: string[] = [];
  for (let i = 0; i < 3; i++) {
    const row = columns.map(col => SAMPLE_DATA[col][i] || '').join(',');
    rows.push(row);
  }

  return [header, ...rows].join('\n');
}

/**
 * Download sample CSV for a workflow type
 */
function downloadSampleCSV(
  workflowType: WorkflowType,
  setupFlowIds?: SetupFlowIds,
  hasCustomLoginFlow?: boolean
) {
  const content = generateSampleCSV(workflowType, setupFlowIds, hasCustomLoginFlow);
  const filename = `sample-${workflowType}-accounts.csv`;

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function CSVUpload({ onAccountsLoaded, disabled, workflowType, setupFlowIds, hasCustomLoginFlow }: CSVUploadProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [csvData, setCsvData] = useState<CSVParseResult | null>(null);
  const [mapping, setMapping] = useState<HeaderMapping>({});
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setFileName(file.name);

    try {
      const content = await readFileAsText(file);
      const parsed = parseCSV(content);

      if (parsed.headers.length === 0) {
        setError('CSV file appears to be empty or invalid');
        return;
      }

      if (parsed.rows.length === 0) {
        setError('CSV file has headers but no data rows');
        return;
      }

      setCsvData(parsed);
      const autoMapping = autoDetectMappings(parsed.headers);
      setMapping(autoMapping);
      setIsDialogOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV');
    }

    // Reset file input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleMappingChange = (header: string, field: AccountField | 'none') => {
    setMapping((prev) => ({
      ...prev,
      [header]: field === 'none' ? null : field,
    }));
  };

  const handleConfirm = () => {
    if (!csvData) return;

    const validation = validateMapping(mapping);
    if (!validation.valid) {
      setError(`Missing required mappings: ${validation.missing.join(', ')}`);
      return;
    }

    const accounts = applyMapping(csvData.rows, mapping);
    onAccountsLoaded(accounts);
    setIsDialogOpen(false);
    setCsvData(null);
    setError(null);
  };

  const handleCancel = () => {
    setIsDialogOpen(false);
    setCsvData(null);
    setMapping({});
    setError(null);
  };

  // Get which fields are currently mapped
  const mappedFields = new Set(Object.values(mapping).filter(Boolean));
  const validation = validateMapping(mapping);

  // Get preview of first few rows
  const previewRows = csvData?.rows.slice(0, 3) || [];

  return (
    <>
      {/* Upload Button */}
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.txt"
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="gap-2"
        >
          <Upload className="h-4 w-4" />
          Upload CSV
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => downloadSampleCSV(workflowType, setupFlowIds, hasCustomLoginFlow)}
          className="gap-2 text-muted-foreground"
          title={`Download sample CSV for ${WORKFLOW_LABELS[workflowType]} workflow`}
        >
          <Download className="h-4 w-4" />
          Sample CSV
        </Button>
        {fileName && (
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <FileSpreadsheet className="h-4 w-4" />
            {fileName}
          </span>
        )}
      </div>

      {/* Mapping Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Map CSV Columns</DialogTitle>
            <DialogDescription>
              Map your CSV columns for the <strong>{WORKFLOW_LABELS[workflowType]}</strong> workflow.
              Username and password are required. {workflowType === 'setup' ? 'Setup fields (profile picture, bio, posts, highlight) are recommended.' : workflowType === 'sister' ? 'Sister fields (new username, profile picture, bio) are recommended.' : workflowType === 'custom' ? 'Select fields based on your selected task flows.' : 'Warmup settings are recommended.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0 pr-2">
            <div className="space-y-6">
              {/* Error Alert */}
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* File Info */}
              <div className="flex items-center gap-4 text-sm">
                <Badge variant="outline">{csvData?.headers.length || 0} columns</Badge>
                <Badge variant="outline">{csvData?.rows.length || 0} rows</Badge>
              </div>

              {/* Mapping Fields */}
              <div className="space-y-4">
                <h4 className="font-medium text-sm">Column Mappings</h4>
                <div className="grid gap-3">
                  {csvData?.headers.map((header) => (
                    <div
                      key={header}
                      className="flex items-center gap-4 p-3 rounded-lg border bg-muted/30"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate" title={header}>
                          {header}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          Sample: {previewRows[0]?.[header] || '(empty)'}
                        </p>
                      </div>
                      <Select
                        value={mapping[header] || 'none'}
                        onValueChange={(value) =>
                          handleMappingChange(header, value as AccountField | 'none')
                        }
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Select field" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">-- Skip --</SelectItem>
                          {ALL_FIELDS.map((field) => {
                            const category = getFieldCategory(field, workflowType);
                            const isAlreadyMapped =
                              mappedFields.has(field) && mapping[header] !== field;
                            return (
                              <SelectItem
                                key={field}
                                value={field}
                                disabled={isAlreadyMapped}
                              >
                                <span className="flex items-center gap-2">
                                  {FIELD_LABELS[field]}
                                  {category === 'required' && (
                                    <span className="text-red-500">*</span>
                                  )}
                                  {category === 'recommended' && (
                                    <span className="text-amber-500 text-xs">(rec)</span>
                                  )}
                                  {mapping[header] === field && (
                                    <Check className="h-3 w-3 text-green-500" />
                                  )}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Field Legend - organized by workflow relevance */}
              <div className="space-y-4">
                <h4 className="font-medium text-sm">Available Fields for {WORKFLOW_LABELS[workflowType]}</h4>

                {/* Required Fields */}
                <div className="space-y-2">
                  <h5 className="text-xs font-medium text-red-600 uppercase tracking-wide">Required</h5>
                  <div className="grid gap-2 text-sm">
                    {getWorkflowFields(workflowType).required.map((field) => {
                      const isMapped = mappedFields.has(field);
                      return (
                        <div
                          key={field}
                          className={`flex items-center justify-between p-2 rounded ${
                            isMapped ? 'bg-green-500/10' : 'bg-red-500/10'
                          }`}
                        >
                          <div>
                            <span className="font-medium">{FIELD_LABELS[field]}</span>
                            <span className="text-red-500 ml-1">*</span>
                            <p className="text-xs text-muted-foreground">
                              {FIELD_DESCRIPTIONS[field]}
                            </p>
                          </div>
                          {isMapped && (
                            <Badge variant="outline" className="bg-green-500/20">
                              <Check className="h-3 w-3 mr-1" />
                              Mapped
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Recommended Fields */}
                <div className="space-y-2">
                  <h5 className="text-xs font-medium text-amber-600 uppercase tracking-wide">Recommended for {WORKFLOW_LABELS[workflowType]}</h5>
                  <div className="grid gap-2 text-sm">
                    {getWorkflowFields(workflowType).recommended.map((field) => {
                      const isMapped = mappedFields.has(field);
                      return (
                        <div
                          key={field}
                          className={`flex items-center justify-between p-2 rounded ${
                            isMapped ? 'bg-green-500/10' : 'bg-amber-500/10'
                          }`}
                        >
                          <div>
                            <span className="font-medium">{FIELD_LABELS[field]}</span>
                            <p className="text-xs text-muted-foreground">
                              {FIELD_DESCRIPTIONS[field]}
                            </p>
                          </div>
                          {isMapped && (
                            <Badge variant="outline" className="bg-green-500/20">
                              <Check className="h-3 w-3 mr-1" />
                              Mapped
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Optional Fields */}
                <div className="space-y-2">
                  <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Optional</h5>
                  <div className="grid gap-2 text-sm">
                    {getWorkflowFields(workflowType).optional.map((field) => {
                      const isMapped = mappedFields.has(field);
                      return (
                        <div
                          key={field}
                          className={`flex items-center justify-between p-2 rounded ${
                            isMapped ? 'bg-green-500/10' : 'bg-muted/30'
                          }`}
                        >
                          <div>
                            <span className="font-medium">{FIELD_LABELS[field]}</span>
                            <p className="text-xs text-muted-foreground">
                              {FIELD_DESCRIPTIONS[field]}
                            </p>
                          </div>
                          {isMapped && (
                            <Badge variant="outline" className="bg-green-500/20">
                              <Check className="h-3 w-3 mr-1" />
                              Mapped
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Preview */}
              {previewRows.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Preview (first 3 rows)</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border rounded">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="p-2 text-left">#</th>
                          <th className="p-2 text-left">Username</th>
                          <th className="p-2 text-left">Password</th>
                          <th className="p-2 text-left">2FA</th>
                          <th className="p-2 text-left">Warmup</th>
                          <th className="p-2 text-left">Videos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, idx) => {
                          const mapped = applyMapping([row], mapping)[0];
                          return (
                            <tr key={idx} className="border-b">
                              <td className="p-2 text-muted-foreground">{idx + 1}</td>
                              <td className="p-2 font-mono text-xs">
                                {mapped.username || '—'}
                              </td>
                              <td className="p-2 font-mono text-xs">
                                {mapped.password ? '••••••' : '—'}
                              </td>
                              <td className="p-2 font-mono text-xs">
                                {mapped.twoFactorSecret ? '••••' : '—'}
                              </td>
                              <td className="p-2">
                                {mapped.flags.runWarmup !== undefined
                                  ? mapped.flags.runWarmup
                                    ? 'Yes'
                                    : 'No'
                                  : '—'}
                              </td>
                              <td className="p-2">
                                {mapped.flags.warmupBrowseVideo !== undefined
                                  ? String(mapped.flags.warmupBrowseVideo)
                                  : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="mt-4 flex-shrink-0">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={!validation.valid}>
              {validation.valid ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Import {csvData?.rows.length || 0} Accounts
                </>
              ) : (
                <>Map Required Fields</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
