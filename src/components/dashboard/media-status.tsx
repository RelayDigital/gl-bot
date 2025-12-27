'use client';

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Image, Video, User, Bookmark, CheckCircle2, XCircle } from 'lucide-react';

interface MediaStatusProps {
  accountData: string;
  accountCount: number;
}

interface MediaInfo {
  type: 'profilePicture' | 'post1Media' | 'post2Media' | 'highlightCover';
  label: string;
  icon: React.ReactNode;
  count: number;
  total: number;
  hasVideo: boolean;
}

/**
 * Parse account data TSV to detect uploaded media
 * Column order: 0-username, 1-password, 2-twoFactorSecret, 3-runWarmup, 4-browseVideo, 5-accountType,
 *               6-newUsername, 7-newDisplayName, 8-profilePictureUrl, 9-bio,
 *               10-post1Desc, 11-post1Media, 12-post2Desc, 13-post2Media, 14-highlightTitle, 15-highlightCover
 */
function parseMediaFromAccountData(accountData: string): {
  profilePicture: { count: number; urls: string[] };
  post1Media: { count: number; urls: string[]; hasVideo: boolean };
  post2Media: { count: number; urls: string[]; hasVideo: boolean };
  highlightCover: { count: number; urls: string[] };
} {
  const lines = accountData.trim().split('\n').filter(Boolean);

  const result = {
    profilePicture: { count: 0, urls: [] as string[] },
    post1Media: { count: 0, urls: [] as string[], hasVideo: false },
    post2Media: { count: 0, urls: [] as string[], hasVideo: false },
    highlightCover: { count: 0, urls: [] as string[] },
  };

  for (const line of lines) {
    const parts = line.split('\t');

    // Profile picture (column 8)
    if (parts[8]?.trim()) {
      result.profilePicture.count++;
      result.profilePicture.urls.push(parts[8].trim());
    }

    // Post 1 media (column 11)
    if (parts[11]?.trim()) {
      result.post1Media.count++;
      const urls = parts[11].trim();
      result.post1Media.urls.push(urls);
      if (urls.match(/\.(mp4|mov|webm|avi|mkv)/i)) {
        result.post1Media.hasVideo = true;
      }
    }

    // Post 2 media (column 13)
    if (parts[13]?.trim()) {
      result.post2Media.count++;
      const urls = parts[13].trim();
      result.post2Media.urls.push(urls);
      if (urls.match(/\.(mp4|mov|webm|avi|mkv)/i)) {
        result.post2Media.hasVideo = true;
      }
    }

    // Highlight cover (column 15)
    if (parts[15]?.trim()) {
      result.highlightCover.count++;
      result.highlightCover.urls.push(parts[15].trim());
    }
  }

  return result;
}

export function MediaStatus({ accountData, accountCount }: MediaStatusProps) {
  const mediaInfo = useMemo(() => {
    if (!accountData.trim() || accountCount === 0) {
      return [];
    }

    const parsed = parseMediaFromAccountData(accountData);
    const infos: MediaInfo[] = [];

    // Only show media types that have at least one entry
    if (parsed.post1Media.count > 0) {
      infos.push({
        type: 'post1Media',
        label: 'Post 1',
        icon: parsed.post1Media.hasVideo ? <Video className="h-3 w-3" /> : <Image className="h-3 w-3" />,
        count: parsed.post1Media.count,
        total: accountCount,
        hasVideo: parsed.post1Media.hasVideo,
      });
    }

    if (parsed.post2Media.count > 0) {
      infos.push({
        type: 'post2Media',
        label: 'Post 2',
        icon: parsed.post2Media.hasVideo ? <Video className="h-3 w-3" /> : <Image className="h-3 w-3" />,
        count: parsed.post2Media.count,
        total: accountCount,
        hasVideo: parsed.post2Media.hasVideo,
      });
    }

    if (parsed.profilePicture.count > 0) {
      infos.push({
        type: 'profilePicture',
        label: 'Profile Pic',
        icon: <User className="h-3 w-3" />,
        count: parsed.profilePicture.count,
        total: accountCount,
        hasVideo: false,
      });
    }

    if (parsed.highlightCover.count > 0) {
      infos.push({
        type: 'highlightCover',
        label: 'Highlight',
        icon: <Bookmark className="h-3 w-3" />,
        count: parsed.highlightCover.count,
        total: accountCount,
        hasVideo: false,
      });
    }

    return infos;
  }, [accountData, accountCount]);

  if (mediaInfo.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground">Media:</span>
      {mediaInfo.map((info) => {
        const isComplete = info.count === info.total;
        const isPartial = info.count > 0 && info.count < info.total;

        return (
          <Badge
            key={info.type}
            variant={isComplete ? 'default' : 'secondary'}
            className={`gap-1 text-xs ${
              isComplete
                ? 'bg-green-500/10 text-green-600 border-green-500/30 hover:bg-green-500/20'
                : isPartial
                ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30'
                : ''
            }`}
          >
            {info.icon}
            {info.label}
            <span className="opacity-70">
              {info.count}/{info.total}
            </span>
            {isComplete && <CheckCircle2 className="h-3 w-3 ml-0.5" />}
          </Badge>
        );
      })}
    </div>
  );
}
