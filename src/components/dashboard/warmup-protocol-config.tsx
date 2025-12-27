'use client';

import { useState, useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
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
import { ChevronDown, ChevronRight, RotateCcw, Calendar, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import {
  WarmupProtocolConfig,
  WarmupDay,
  DEFAULT_WARMUP_PROTOCOL,
  WARMUP_DAY_LABELS,
  WARMUP_DAY_DESCRIPTIONS,
} from '@/lib/state-machine/types';

interface WarmupProtocolConfigProps {
  config: WarmupProtocolConfig;
  onChange: (config: WarmupProtocolConfig) => void;
  disabled?: boolean;
  /** Number of accounts loaded */
  accountCount?: number;
  /** Callback to update bios in account data */
  onBiosGenerated?: (bios: string[]) => void;
}

interface RangeInputProps {
  label: string;
  min: number;
  max: number;
  onMinChange: (value: number) => void;
  onMaxChange: (value: number) => void;
  disabled?: boolean;
  suffix?: string;
}

function RangeInput({
  label,
  min,
  max,
  onMinChange,
  onMaxChange,
  disabled,
  suffix = '',
}: RangeInputProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={min}
          onChange={(e) => onMinChange(parseInt(e.target.value) || 0)}
          disabled={disabled}
          className="h-8 w-20 text-xs"
          min={0}
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="number"
          value={max}
          onChange={(e) => onMaxChange(parseInt(e.target.value) || 0)}
          disabled={disabled}
          className="h-8 w-20 text-xs"
          min={0}
        />
        {suffix && (
          <span className="text-xs text-muted-foreground">{suffix}</span>
        )}
      </div>
    </div>
  );
}

export function WarmupProtocolConfigPanel({
  config,
  onChange,
  disabled,
  accountCount = 0,
  onBiosGenerated,
}: WarmupProtocolConfigProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGeneratingBios, setIsGeneratingBios] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);

  const handleReset = () => {
    onChange({
      ...DEFAULT_WARMUP_PROTOCOL,
      selectedDay: config.selectedDay, // Keep the selected day
    });
  };

  const handleDayChange = (day: WarmupDay) => {
    onChange({ ...config, selectedDay: day });
  };

  const updateDay0 = (updates: Partial<WarmupProtocolConfig['day0']>) => {
    onChange({
      ...config,
      day0: { ...config.day0, ...updates },
    });
  };

  const updateDay1_2 = (updates: Partial<WarmupProtocolConfig['day1_2']>) => {
    onChange({
      ...config,
      day1_2: { ...config.day1_2, ...updates },
    });
  };

  const updateDay3_7 = (updates: Partial<WarmupProtocolConfig['day3_7']>) => {
    onChange({
      ...config,
      day3_7: { ...config.day3_7, ...updates },
    });
  };

  const handleGenerateBios = useCallback(async () => {
    if (!accountCount || !onBiosGenerated) return;

    setIsGeneratingBios(true);
    setBioError(null);

    try {
      const response = await fetch('/api/ai/generate-descriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: accountCount,
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
      if (data.descriptions && Array.isArray(data.descriptions)) {
        onBiosGenerated(data.descriptions);
      }
    } catch (error) {
      setBioError(error instanceof Error ? error.message : 'Failed to generate bios');
    } finally {
      setIsGeneratingBios(false);
    }
  }, [accountCount, onBiosGenerated]);

  const selectedDay = config.selectedDay;

  return (
    <div className="space-y-4">
      {/* Day Selector - Always visible */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Warmup Day
        </Label>
        <Select
          value={selectedDay}
          onValueChange={(value) => handleDayChange(value as WarmupDay)}
          disabled={disabled}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select warmup day" />
          </SelectTrigger>
          <SelectContent>
            {(['day0', 'day1_2', 'day3_7'] as WarmupDay[]).map((day) => (
              <SelectItem key={day} value={day}>
                {WARMUP_DAY_LABELS[day]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {WARMUP_DAY_DESCRIPTIONS[selectedDay]}
        </p>
      </div>

      {/* Bio Generator - shown prominently for Day 0 when accounts are loaded */}
      {selectedDay === 'day0' && config.day0.addBio && accountCount > 0 && onBiosGenerated && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" />
                Generate AI Bios
              </Label>
              <p className="text-xs text-muted-foreground">
                Create unique bios for {accountCount} account{accountCount !== 1 ? 's' : ''} using AI
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateBios}
              disabled={disabled || isGeneratingBios}
              className="h-8 gap-1.5"
            >
              {isGeneratingBios ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Generate
                </>
              )}
            </Button>
          </div>
          {bioError && (
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              {bioError}
            </div>
          )}
        </div>
      )}

      {/* Collapsible Settings for Selected Day */}
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center gap-2 p-0 h-auto hover:bg-transparent"
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <span className="text-sm text-muted-foreground">
                  Customize {WARMUP_DAY_LABELS[selectedDay]} Settings
                </span>
              </Button>
            </CollapsibleTrigger>
            {isOpen && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={disabled}
                className="h-7 text-xs"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset
              </Button>
            )}
          </div>

          <CollapsibleContent className="space-y-4">
            {/* Day 0 Settings */}
            {selectedDay === 'day0' && (
              <div className="rounded-lg border p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <RangeInput
                    label="Wait before starting"
                    min={config.day0.waitMinutes.min}
                    max={config.day0.waitMinutes.max}
                    onMinChange={(min) =>
                      updateDay0({
                        waitMinutes: { ...config.day0.waitMinutes, min },
                      })
                    }
                    onMaxChange={(max) =>
                      updateDay0({
                        waitMinutes: { ...config.day0.waitMinutes, max },
                      })
                    }
                    disabled={disabled}
                    suffix="min"
                  />

                  <RangeInput
                    label="Follow count"
                    min={config.day0.followCount.min}
                    max={config.day0.followCount.max}
                    onMinChange={(min) =>
                      updateDay0({
                        followCount: { ...config.day0.followCount, min },
                      })
                    }
                    onMaxChange={(max) =>
                      updateDay0({
                        followCount: { ...config.day0.followCount, max },
                      })
                    }
                    disabled={disabled}
                    suffix="accounts"
                  />

                  <RangeInput
                    label="Scroll duration"
                    min={config.day0.scrollMinutes.min}
                    max={config.day0.scrollMinutes.max}
                    onMinChange={(min) =>
                      updateDay0({
                        scrollMinutes: { ...config.day0.scrollMinutes, min },
                      })
                    }
                    onMaxChange={(max) =>
                      updateDay0({
                        scrollMinutes: { ...config.day0.scrollMinutes, max },
                      })
                    }
                    disabled={disabled}
                    suffix="min"
                  />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">
                        Add profile photo
                      </Label>
                      <Switch
                        checked={config.day0.addProfilePhoto}
                        onCheckedChange={(checked) =>
                          updateDay0({ addProfilePhoto: checked })
                        }
                        disabled={disabled}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">
                        Add bio
                      </Label>
                      <Switch
                        checked={config.day0.addBio}
                        onCheckedChange={(checked) =>
                          updateDay0({ addBio: checked })
                        }
                        disabled={disabled}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Day 1-2 Settings */}
            {selectedDay === 'day1_2' && (
              <div className="rounded-lg border p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <RangeInput
                    label="Scroll duration"
                    min={config.day1_2.scrollMinutes.min}
                    max={config.day1_2.scrollMinutes.max}
                    onMinChange={(min) =>
                      updateDay1_2({
                        scrollMinutes: { ...config.day1_2.scrollMinutes, min },
                      })
                    }
                    onMaxChange={(max) =>
                      updateDay1_2({
                        scrollMinutes: { ...config.day1_2.scrollMinutes, max },
                      })
                    }
                    disabled={disabled}
                    suffix="min"
                  />

                  <RangeInput
                    label="Like count"
                    min={config.day1_2.likeCount.min}
                    max={config.day1_2.likeCount.max}
                    onMinChange={(min) =>
                      updateDay1_2({
                        likeCount: { ...config.day1_2.likeCount, min },
                      })
                    }
                    onMaxChange={(max) =>
                      updateDay1_2({
                        likeCount: { ...config.day1_2.likeCount, max },
                      })
                    }
                    disabled={disabled}
                    suffix="posts"
                  />

                  <RangeInput
                    label="Follow count"
                    min={config.day1_2.followCount.min}
                    max={config.day1_2.followCount.max}
                    onMinChange={(min) =>
                      updateDay1_2({
                        followCount: { ...config.day1_2.followCount, min },
                      })
                    }
                    onMaxChange={(max) =>
                      updateDay1_2({
                        followCount: { ...config.day1_2.followCount, max },
                      })
                    }
                    disabled={disabled}
                    suffix="accounts"
                  />
                </div>
              </div>
            )}

            {/* Day 3-7 Settings */}
            {selectedDay === 'day3_7' && (
              <div className="rounded-lg border p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Max follows per day
                    </Label>
                    <Input
                      type="number"
                      value={config.day3_7.maxFollowsPerDay}
                      onChange={(e) =>
                        updateDay3_7({
                          maxFollowsPerDay: parseInt(e.target.value) || 0,
                        })
                      }
                      disabled={disabled}
                      className="h-8 text-xs"
                      min={0}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Max likes per day
                    </Label>
                    <Input
                      type="number"
                      value={config.day3_7.maxLikesPerDay}
                      onChange={(e) =>
                        updateDay3_7({
                          maxLikesPerDay: parseInt(e.target.value) || 0,
                        })
                      }
                      disabled={disabled}
                      className="h-8 text-xs"
                      min={0}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-5">
                    <Label className="text-xs text-muted-foreground">
                      Post photo (optional)
                    </Label>
                    <Switch
                      checked={config.day3_7.postPhoto}
                      onCheckedChange={(checked) =>
                        updateDay3_7({ postPhoto: checked })
                      }
                      disabled={disabled}
                    />
                  </div>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              These settings define engagement limits for the selected warmup
              day. The built-in GeeLark warmup uses scroll duration to control
              engagement intensity.
            </p>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
