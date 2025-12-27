'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  PhoneJob,
  STATE_LABELS,
  STATE_COLORS,
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  WorkflowScreenshot,
} from '@/lib/state-machine/types';
import { Camera, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface PhoneCardProps {
  phone: PhoneJob;
}

export function PhoneCard({ phone }: PhoneCardProps) {
  const [selectedScreenshot, setSelectedScreenshot] = useState<WorkflowScreenshot | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number>(0);

  const progressPercent =
    (phone.progress.currentStep / phone.progress.totalSteps) * 100;

  const stateLabel = STATE_LABELS[phone.state] || phone.state;
  const stateColor = STATE_COLORS[phone.state] || 'bg-gray-500';

  // Get task status info if available
  const hasTaskStatus = phone.currentTaskStatus !== null && phone.currentTaskType !== null;
  const taskStatusLabel = phone.currentTaskStatus ? TASK_STATUS_LABELS[phone.currentTaskStatus] : null;
  const taskStatusColor = phone.currentTaskStatus ? TASK_STATUS_COLORS[phone.currentTaskStatus] : 'bg-gray-500';
  const taskTypeLabel = phone.currentTaskType
    ? phone.currentTaskType.charAt(0).toUpperCase() + phone.currentTaskType.slice(1)
    : null;

  // Ensure screenshots array exists (for backwards compatibility)
  const screenshots = phone.screenshots || [];
  const hasScreenshots = screenshots.length > 0;

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setSelectedScreenshot(screenshots[index]);
  };

  const closeLightbox = () => {
    setSelectedScreenshot(null);
  };

  const navigateLightbox = (direction: 'prev' | 'next') => {
    const newIndex = direction === 'prev'
      ? (lightboxIndex - 1 + screenshots.length) % screenshots.length
      : (lightboxIndex + 1) % screenshots.length;
    setLightboxIndex(newIndex);
    setSelectedScreenshot(screenshots[newIndex]);
  };

  return (
    <>
      <Card
        className={`transition-all ${
          phone.state === 'FAILED'
            ? 'border-red-500 border-2'
            : phone.state === 'DONE'
            ? 'border-green-500 border-2'
            : ''
        }`}
      >
        <CardHeader className="pb-3 pt-4 px-4">
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-base truncate">{phone.serialName}</h3>
              <p className="text-sm text-muted-foreground truncate mt-0.5">
                {phone.account?.username || 'No account'}
              </p>
            </div>
            <Badge className={`${stateColor} text-white text-xs shrink-0 px-2 py-1`}>
              {stateLabel}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pb-4 px-4 space-y-3">
          <Progress value={progressPercent} className="h-2" />
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>
              Step {phone.progress.currentStep}/{phone.progress.totalSteps}
            </span>
            {hasScreenshots && (
              <span className="flex items-center gap-1">
                <Camera className="h-3 w-3" />
                {screenshots.length}
              </span>
            )}
          </div>

          {/* Task Status Display */}
          {hasTaskStatus && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {taskTypeLabel} Task:
              </span>
              <Badge
                variant="outline"
                className={`${taskStatusColor} text-white text-xs px-2 py-0.5`}
              >
                {taskStatusLabel}
              </Badge>
            </div>
          )}

          {phone.lastError && (
            <p
              className="text-sm text-red-500 truncate"
              title={phone.lastError}
            >
              {phone.lastError}
            </p>
          )}

          {/* Screenshots Gallery */}
          {hasScreenshots && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground">Screenshots</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {screenshots.map((screenshot, index) => (
                  <button
                    key={index}
                    onClick={() => openLightbox(index)}
                    className="relative shrink-0 w-16 h-28 rounded-md overflow-hidden border hover:border-primary transition-colors group"
                    title={screenshot.step}
                  >
                    <img
                      src={screenshot.url}
                      alt={screenshot.step}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate">
                      {screenshot.step}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lightbox Dialog */}
      <Dialog open={selectedScreenshot !== null} onOpenChange={() => closeLightbox()}>
        <DialogContent className="max-w-3xl max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="flex items-center justify-between mr-8">
              <span>{selectedScreenshot?.step}</span>
              <span className="text-sm font-normal text-muted-foreground">
                {lightboxIndex + 1} / {screenshots.length}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="relative flex items-center justify-center bg-black/5 p-4">
            {screenshots.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-2 z-10"
                  onClick={() => navigateLightbox('prev')}
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 z-10"
                  onClick={() => navigateLightbox('next')}
                >
                  <ChevronRight className="h-6 w-6" />
                </Button>
              </>
            )}
            {selectedScreenshot && (
              <img
                src={selectedScreenshot.url}
                alt={selectedScreenshot.step}
                className="max-h-[70vh] max-w-full object-contain rounded-md"
              />
            )}
          </div>
          <div className="p-4 pt-2 text-sm text-muted-foreground">
            Captured: {selectedScreenshot && new Date(selectedScreenshot.capturedAt).toLocaleString()}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
