'use client';

import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Upload,
  Image,
  Video,
  X,
  Check,
  AlertCircle,
  FolderUp,
  Loader2,
  Sparkles,
  RefreshCw,
  ChevronDown,
  Settings2,
  Pencil,
} from 'lucide-react';

type MediaType = 'profilePicture' | 'post1Media' | 'post2Media' | 'highlightCover';

interface BulkMediaUploadProps {
  accountCount: number;
  onFilesUploaded: (mediaType: MediaType, urls: Map<number, string>, descriptions?: Map<number, string>) => void;
  disabled?: boolean;
}

interface AISettings {
  provider: 'openai' | 'anthropic';
  tone: 'flirty' | 'casual' | 'playful' | 'mysterious';
  length: 'short' | 'medium';
  emojiLevel: 'none' | 'some' | 'lots';
  includeHashtags: boolean;
  includeCallToAction: boolean;
  customInstructions: string;
}

const MEDIA_TYPE_CONFIG: Record<MediaType, { label: string; accept: string; description: string; needsDescription: boolean }> = {
  profilePicture: {
    label: 'Profile Pictures',
    accept: 'image/*',
    description: 'One image per account',
    needsDescription: false,
  },
  post1Media: {
    label: 'Post 1 Media',
    accept: 'image/*,video/*',
    description: 'Images/videos for first post',
    needsDescription: true,
  },
  post2Media: {
    label: 'Post 2 Media',
    accept: 'image/*,video/*',
    description: 'Images/videos for second post',
    needsDescription: true,
  },
  highlightCover: {
    label: 'Highlight Covers',
    accept: 'image/*',
    description: 'One image per account',
    needsDescription: false,
  },
};

const DEFAULT_AI_SETTINGS: AISettings = {
  provider: 'openai',
  tone: 'flirty',
  length: 'short',
  emojiLevel: 'lots',
  includeHashtags: true,
  includeCallToAction: true,
  customInstructions: '',
};

export function BulkMediaUpload({ accountCount, onFilesUploaded, disabled }: BulkMediaUploadProps) {
  const [open, setOpen] = useState(false);
  const [mediaType, setMediaType] = useState<MediaType>('post1Media');
  const [files, setFiles] = useState<File[]>([]);
  const [descriptions, setDescriptions] = useState<Map<number, string>>(new Map());
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiSettings, setAiSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const config = MEDIA_TYPE_CONFIG[mediaType];
  const needsDescriptions = config.needsDescription;

  // Get unique account indices from files
  const getUniqueAccountIndices = useCallback(() => {
    const indices = new Set<number>();
    files.forEach((_, idx) => {
      indices.add(idx % accountCount);
    });
    return Array.from(indices).sort((a, b) => a - b);
  }, [files, accountCount]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;
    setError(null);
    // Sort files by name for consistent ordering
    const sorted = selectedFiles.sort((a, b) => a.name.localeCompare(b.name));
    setFiles(sorted);
    setDescriptions(new Map()); // Reset descriptions when files change
    e.target.value = '';
  }, []);

  const handleGenerateDescriptions = useCallback(async () => {
    const uniqueIndices = getUniqueAccountIndices();
    if (uniqueIndices.length === 0) {
      setError('No files selected');
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/generate-descriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: uniqueIndices.length,
          ...aiSettings,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate descriptions');
      }

      const result = await response.json();
      const newDescriptions = new Map<number, string>();

      uniqueIndices.forEach((accountIndex, i) => {
        if (result.descriptions[i]) {
          newDescriptions.set(accountIndex, result.descriptions[i]);
        }
      });

      setDescriptions(newDescriptions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate descriptions');
    } finally {
      setGenerating(false);
    }
  }, [aiSettings, getUniqueAccountIndices]);

  const handleRegenerateOne = useCallback(async (accountIndex: number) => {
    setGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/generate-descriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: 1,
          ...aiSettings,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate description');
      }

      const result = await response.json();
      if (result.descriptions[0]) {
        setDescriptions(prev => {
          const newMap = new Map(prev);
          newMap.set(accountIndex, result.descriptions[0]);
          return newMap;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate');
    } finally {
      setGenerating(false);
    }
  }, [aiSettings]);

  const handleDescriptionEdit = useCallback((accountIndex: number, value: string) => {
    setDescriptions(prev => {
      const newMap = new Map(prev);
      newMap.set(accountIndex, value);
      return newMap;
    });
  }, []);

  const handleUpload = useCallback(async () => {
    if (files.length === 0) {
      setError('No files selected');
      return;
    }

    // Descriptions are optional - just proceed with upload

    setUploading(true);
    setError(null);

    try {
      // Upload files to server - map by selection order (0-indexed)
      const formData = new FormData();
      files.forEach((file, index) => {
        // Map to row index (0-based), wrapping if more files than accounts
        const rowIndex = index % accountCount;
        formData.append(`file_${index}`, file);
        formData.append(`row_${index}`, String(rowIndex));
      });
      formData.append('mediaType', mediaType);

      const response = await fetch('/api/uploads', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      const result = await response.json();

      // Build URL map: rowIndex -> URLs (joined by ; for multiple files per row)
      // API now returns full public URLs from DigitalOcean Spaces
      const urlsByRow = new Map<number, string[]>();

      for (const item of result.files) {
        if (!urlsByRow.has(item.rowIndex)) {
          urlsByRow.set(item.rowIndex, []);
        }
        urlsByRow.get(item.rowIndex)!.push(item.path);
      }

      // Convert to single string per row (joined by ; for multiple)
      const urlMap = new Map<number, string>();
      urlsByRow.forEach((urls, rowIndex) => {
        urlMap.set(rowIndex, urls.join(';'));
      });

      // Notify parent with URLs and descriptions
      onFilesUploaded(mediaType, urlMap, needsDescriptions ? descriptions : undefined);

      // Reset and close
      setFiles([]);
      setDescriptions(new Map());
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [files, mediaType, accountCount, descriptions, needsDescriptions, getUniqueAccountIndices, onFilesUploaded]);

  const handleClose = useCallback(() => {
    setFiles([]);
    setDescriptions(new Map());
    setError(null);
    setEditingIndex(null);
    setOpen(false);
  }, []);

  const uniqueAccountIndices = getUniqueAccountIndices();

  return (
    <Dialog open={open} onOpenChange={(isOpen) => isOpen ? setOpen(true) : handleClose()}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || accountCount === 0}
          className="gap-2"
        >
          <FolderUp className="h-4 w-4" />
          Upload Media
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Media Upload</DialogTitle>
          <DialogDescription>
            Upload media files and generate AI descriptions for posts
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 pr-2">
          {/* Media Type */}
          <div className="space-y-2">
            <Label>Media Type</Label>
            <Select value={mediaType} onValueChange={(v) => { setMediaType(v as MediaType); setFiles([]); setDescriptions(new Map()); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="post1Media">Post 1 Media</SelectItem>
                <SelectItem value="post2Media">Post 2 Media</SelectItem>
                <SelectItem value="profilePicture">Profile Pictures</SelectItem>
                <SelectItem value="highlightCover">Highlight Covers</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{config.description}</p>
          </div>

          {/* File Selection */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept={config.accept}
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-16 border-dashed gap-2"
            >
              <Upload className="h-5 w-5" />
              Select {config.label}
            </Button>
          </div>

          {/* Selected Files & Descriptions */}
          {files.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{files.length} files → {uniqueAccountIndices.length} accounts</Label>
                <Button variant="ghost" size="sm" onClick={() => { setFiles([]); setDescriptions(new Map()); }}>
                  Clear
                </Button>
              </div>

              {/* AI Description Generator (only for post media) */}
              {needsDescriptions && (
                <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-purple-500" />
                      <span className="font-medium text-sm">AI Description Generator</span>
                    </div>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={handleGenerateDescriptions}
                      disabled={generating || files.length === 0}
                      className="gap-2"
                    >
                      {generating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      {descriptions.size > 0 ? 'Regenerate All' : 'Generate'}
                    </Button>
                  </div>

                  {/* AI Settings */}
                  <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-full justify-between h-8 px-2">
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Settings2 className="h-3 w-3" />
                          Settings: {aiSettings.tone}, {aiSettings.length}, {aiSettings.emojiLevel} emojis
                        </span>
                        <ChevronDown className={`h-4 w-4 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2 space-y-3">
                      {/* Provider Selection */}
                      <div className="space-y-1">
                        <Label className="text-xs">AI Provider</Label>
                        <Select
                          value={aiSettings.provider}
                          onValueChange={(v) => setAiSettings(prev => ({ ...prev, provider: v as AISettings['provider'] }))}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="openai">OpenAI (GPT-4o-mini)</SelectItem>
                            <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Tone</Label>
                          <Select
                            value={aiSettings.tone}
                            onValueChange={(v) => setAiSettings(prev => ({ ...prev, tone: v as AISettings['tone'] }))}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="flirty">Flirty 😏</SelectItem>
                              <SelectItem value="playful">Playful 🎉</SelectItem>
                              <SelectItem value="casual">Casual 👋</SelectItem>
                              <SelectItem value="mysterious">Mysterious 🔮</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Length</Label>
                          <Select
                            value={aiSettings.length}
                            onValueChange={(v) => setAiSettings(prev => ({ ...prev, length: v as AISettings['length'] }))}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="short">Short (5-15 words)</SelectItem>
                              <SelectItem value="medium">Medium (15-30 words)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Emojis</Label>
                          <Select
                            value={aiSettings.emojiLevel}
                            onValueChange={(v) => setAiSettings(prev => ({ ...prev, emojiLevel: v as AISettings['emojiLevel'] }))}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="lots">Lots 🙈😅😩</SelectItem>
                              <SelectItem value="some">Some 🙂</SelectItem>
                              <SelectItem value="none">None</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <div className="flex items-center gap-2">
                          <Switch
                            id="hashtags"
                            checked={aiSettings.includeHashtags}
                            onCheckedChange={(v) => setAiSettings(prev => ({ ...prev, includeHashtags: v }))}
                          />
                          <Label htmlFor="hashtags" className="text-xs">Hashtags</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            id="cta"
                            checked={aiSettings.includeCallToAction}
                            onCheckedChange={(v) => setAiSettings(prev => ({ ...prev, includeCallToAction: v }))}
                          />
                          <Label htmlFor="cta" className="text-xs">Call-to-action</Label>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Custom Instructions (optional)</Label>
                        <Input
                          placeholder="e.g., mention a sale, use specific words..."
                          value={aiSettings.customInstructions}
                          onChange={(e) => setAiSettings(prev => ({ ...prev, customInstructions: e.target.value }))}
                          className="h-8 text-xs"
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}

              {/* Files & Descriptions List */}
              <ScrollArea className="h-[200px] border rounded-md">
                <div className="p-2 space-y-2">
                  {uniqueAccountIndices.map((accountIndex) => {
                    const accountFiles = files.filter((_, idx) => idx % accountCount === accountIndex);
                    const description = descriptions.get(accountIndex) || '';
                    const isEditing = editingIndex === accountIndex;

                    return (
                      <div key={accountIndex} className="border rounded-md p-2 space-y-2 bg-background">
                        {/* Account header with files */}
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="shrink-0">
                            Account {accountIndex + 1}
                          </Badge>
                          <div className="flex items-center gap-1 flex-1 overflow-hidden">
                            {accountFiles.map((file, i) => (
                              <div key={i} className="flex items-center gap-1 text-xs text-muted-foreground">
                                {file.type.startsWith('video/') ? (
                                  <Video className="h-3 w-3" />
                                ) : (
                                  <Image className="h-3 w-3" />
                                )}
                                <span className="truncate max-w-[100px]">{file.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Description (only for post media) */}
                        {needsDescriptions && (
                          <div className="space-y-1">
                            {isEditing ? (
                              <div className="space-y-2">
                                <Textarea
                                  value={description}
                                  onChange={(e) => handleDescriptionEdit(accountIndex, e.target.value)}
                                  placeholder="Enter post description..."
                                  className="text-sm min-h-[60px]"
                                  autoFocus
                                />
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setEditingIndex(null)}
                                  className="h-7 text-xs"
                                >
                                  Done
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-start gap-2">
                                <div
                                  className={`flex-1 text-sm p-2 rounded bg-muted/50 min-h-[40px] ${!description ? 'text-muted-foreground italic' : ''}`}
                                >
                                  {description || 'No description - click Generate or Edit'}
                                </div>
                                <div className="flex flex-col gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditingIndex(accountIndex)}
                                    className="h-7 w-7 p-0"
                                    title="Edit"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleRegenerateOne(accountIndex)}
                                    disabled={generating}
                                    className="h-7 w-7 p-0"
                                    title="Regenerate"
                                  >
                                    <RefreshCw className={`h-3 w-3 ${generating ? 'animate-spin' : ''}`} />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              {/* Status */}
              {needsDescriptions && descriptions.size > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <Check className="h-4 w-4 text-green-500" />
                  <span className="text-green-600">
                    {descriptions.size} description(s) ready
                    {descriptions.size < uniqueAccountIndices.length && (
                      <span className="text-muted-foreground ml-1">
                        ({uniqueAccountIndices.length - descriptions.size} without)
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={files.length === 0 || uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Upload {needsDescriptions ? '& Apply' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
