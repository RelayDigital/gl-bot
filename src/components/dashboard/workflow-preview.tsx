'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SavedConfig } from '@/hooks/use-local-storage';
import { WORKFLOW_LABELS, WARMUP_DAY_LABELS, TARGET_APP_CONFIGS } from '@/lib/state-machine/types';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  Smartphone,
  Download,
  LogIn,
  Sparkles,
  Power,
  UserCircle,
  FileText,
  Image,
  Bookmark,
  Lock,
  ShieldCheck,
  AtSign,
  Heart,
  Users,
  Clock,
  Send,
  MessageSquare,
} from 'lucide-react';

interface WorkflowPreviewProps {
  config: SavedConfig;
}

interface ValidationItem {
  label: string;
  status: 'valid' | 'invalid' | 'warning';
  message: string;
}

interface WorkflowStep {
  icon: React.ReactNode;
  label: string;
  description: string;
  enabled: boolean;
}

export function WorkflowPreview({ config }: WorkflowPreviewProps) {
  // Parse account data to understand workflow
  const accountLines = config.accountData
    .trim()
    .split('\n')
    .filter((line) => line.trim());

  const accountCount = accountLines.length;

  // Parse accounts to check for warmup settings, posts, profile data
  // Column order: username, password, twoFactorSecret, runWarmup, browseVideo, accountType,
  //               newUsername, newDisplayName, profilePictureUrl, bio,
  //               post1Desc, post1Media, post2Desc, post2Media, highlightTitle, highlightCover
  const parsedAccounts = accountLines.map((line) => {
    const parts = line.split(/[,\t]/).map((p) => p.trim());
    // Post data is at indices 10-13: post1Desc, post1Media, post2Desc, post2Media
    const hasPost1 = !!(parts[10] || parts[11]);
    const hasPost2 = !!(parts[12] || parts[13]);
    const post1Media = parts[11] || '';
    const post2Media = parts[13] || '';
    const hasVideo = post1Media.includes('.mp4') || post1Media.includes('.mov') ||
                     post2Media.includes('.mp4') || post2Media.includes('.mov');
    return {
      username: parts[0] || '',
      password: parts[1] || '',
      runWarmup: parts[3]?.toLowerCase() !== 'false' && parts[3] !== '0',
      browseVideo: parseInt(parts[4]) || 5,
      profilePictureUrl: parts[8] || '',
      bio: parts[9] || '',
      hasPosts: hasPost1 || hasPost2,
      postCount: (hasPost1 ? 1 : 0) + (hasPost2 ? 1 : 0),
      hasVideo,
    };
  });

  const accountsWithWarmup = parsedAccounts.filter((a) => a.runWarmup).length;
  const accountsWithPosts = parsedAccounts.filter((a) => a.hasPosts).length;
  const accountsWithProfilePic = parsedAccounts.filter((a) => a.profilePictureUrl).length;
  const accountsWithBio = parsedAccounts.filter((a) => a.bio).length;
  const totalPosts = parsedAccounts.reduce((sum, a) => sum + a.postCount, 0);
  const hasVideoPosts = parsedAccounts.some((a) => a.hasVideo);

  // Get warmup day settings
  const selectedWarmupDay = config.warmupProtocol?.selectedDay || 'day1_2';
  const warmupProtocol = config.warmupProtocol;

  // Get target app config
  const targetApp = config.targetApp || 'instagram';
  const targetAppConfig = TARGET_APP_CONFIGS[targetApp];

  // Validation checks
  const validations: ValidationItem[] = [
    {
      label: 'API Token',
      status: config.apiToken ? 'valid' : 'invalid',
      message: config.apiToken ? 'Token configured' : 'Required to connect to GeeLark',
    },
    {
      label: 'Phone Group',
      status: config.groupName ? 'valid' : 'invalid',
      message: config.groupName
        ? `Group: ${config.groupName}`
        : 'Select a phone group',
    },
    {
      label: `${targetAppConfig.label} App`,
      status: config.appVersionId ? 'valid' : 'invalid',
      message: config.appVersionId
        ? `${config.appName} v${config.appVersion}`
        : `Select ${targetAppConfig.label} app version`,
    },
    {
      label: 'Account Data',
      status: accountCount > 0 ? 'valid' : 'invalid',
      message:
        accountCount > 0
          ? `${accountCount} account(s) loaded`
          : 'Upload or paste account credentials',
    },
  ];

  // Check if this is a Reddit workflow
  const isRedditWorkflow = config.workflowType === 'reddit_warmup' || config.workflowType === 'reddit_post';

  // Reddit requires a custom login flow (no built-in redditLogin endpoint)
  const hasLoginFlow = isRedditWorkflow ? !!config.customLoginFlowId : true;

  // Add Reddit-specific validation
  if (isRedditWorkflow && !config.customLoginFlowId) {
    validations.push({
      label: 'Login Flow',
      status: 'invalid',
      message: 'Reddit requires a custom login flow',
    });
  }

  const isValid = validations.every((v) => v.status === 'valid');

  // Common workflow steps (shared between warmup and setup)
  const commonStartSteps: WorkflowStep[] = [
    {
      icon: <Power className="h-4 w-4" />,
      label: 'Start Phones',
      description: `Start up to ${accountCount || '?'} cloud phones`,
      enabled: true,
    },
    {
      icon: <Download className="h-4 w-4" />,
      label: `Install ${targetAppConfig.label}`,
      description: config.appName
        ? `Install ${config.appName} v${config.appVersion}`
        : `Install ${targetAppConfig.label} app`,
      enabled: true,
    },
    // Login step - always shown, but Reddit requires custom flow
    {
      icon: <LogIn className="h-4 w-4" />,
      label: 'Login',
      description: isRedditWorkflow
        ? (config.customLoginFlowId
            ? `Login via custom flow: ${config.customLoginFlowTitle || 'Custom'}`
            : 'Requires custom login flow')
        : `Login to ${accountCount || '?'} ${targetAppConfig.label} accounts`,
      enabled: hasLoginFlow,
    },
  ];

  const commonEndSteps: WorkflowStep[] = [
    {
      icon: <Power className="h-4 w-4 rotate-180" />,
      label: 'Stop Phones',
      description: 'Phones stopped after completion or failure',
      enabled: true,
    },
  ];

  // Warmup-specific steps - vary based on selected day
  const getWarmupSteps = (): WorkflowStep[] => {
    const day0Settings = warmupProtocol?.day0;
    const day1_2Settings = warmupProtocol?.day1_2;
    const day3_7Settings = warmupProtocol?.day3_7;

    switch (selectedWarmupDay) {
      case 'day0':
        return [
          {
            icon: <Clock className="h-4 w-4" />,
            label: 'Wait',
            description: `Wait ${day0Settings?.waitMinutes?.min || 3}-${day0Settings?.waitMinutes?.max || 5} minutes`,
            enabled: true,
          },
          {
            icon: <UserCircle className="h-4 w-4" />,
            label: 'Profile Photo',
            description: day0Settings?.addProfilePhoto
              ? accountsWithProfilePic > 0
                ? `Add photo for ${accountsWithProfilePic} account(s)`
                : 'No profile photos in data'
              : 'Disabled',
            enabled: day0Settings?.addProfilePhoto !== false && accountsWithProfilePic > 0,
          },
          {
            icon: <FileText className="h-4 w-4" />,
            label: 'Bio',
            description: day0Settings?.addBio
              ? accountsWithBio > 0
                ? `Set bio for ${accountsWithBio} account(s)`
                : 'No bios in data'
              : 'Disabled',
            enabled: day0Settings?.addBio !== false && accountsWithBio > 0,
          },
          {
            icon: <Users className="h-4 w-4" />,
            label: 'Follow',
            description: `Follow ${day0Settings?.followCount?.min || 3}-${day0Settings?.followCount?.max || 5} accounts`,
            enabled: true,
          },
          {
            icon: <Sparkles className="h-4 w-4" />,
            label: 'Scroll',
            description: `Scroll feed ${day0Settings?.scrollMinutes?.min || 2}-${day0Settings?.scrollMinutes?.max || 3} min`,
            enabled: true,
          },
        ];

      case 'day3_7':
        return [
          {
            icon: <Sparkles className="h-4 w-4" />,
            label: 'Engage',
            description: 'Browse feed and engage with content',
            enabled: true,
          },
          {
            icon: <Heart className="h-4 w-4" />,
            label: 'Like',
            description: `Like up to ${day3_7Settings?.maxLikesPerDay || 20} posts`,
            enabled: true,
          },
          {
            icon: <Users className="h-4 w-4" />,
            label: 'Follow',
            description: `Follow up to ${day3_7Settings?.maxFollowsPerDay || 15} accounts`,
            enabled: true,
          },
          {
            icon: <Image className="h-4 w-4" />,
            label: 'Post Photo',
            description: day3_7Settings?.postPhoto
              ? accountsWithPosts > 0
                ? `Post ${totalPosts} photo(s)`
                : 'No posts in data'
              : 'Optional (disabled)',
            enabled: day3_7Settings?.postPhoto === true && accountsWithPosts > 0,
          },
        ];

      case 'day1_2':
      default:
        return [
          {
            icon: <Sparkles className="h-4 w-4" />,
            label: 'Scroll',
            description: `Browse feed ${day1_2Settings?.scrollMinutes?.min || 3}-${day1_2Settings?.scrollMinutes?.max || 5} min`,
            enabled: true,
          },
          {
            icon: <Heart className="h-4 w-4" />,
            label: 'Like',
            description: `Like ${day1_2Settings?.likeCount?.min || 2}-${day1_2Settings?.likeCount?.max || 3} posts`,
            enabled: true,
          },
          {
            icon: <Users className="h-4 w-4" />,
            label: 'Follow',
            description: `Follow ${day1_2Settings?.followCount?.min || 0}-${day1_2Settings?.followCount?.max || 5} accounts`,
            enabled: (day1_2Settings?.followCount?.max || 5) > 0,
          },
        ];
    }
  };

  const warmupSteps = getWarmupSteps();

  // Warmup-specific warnings
  const warmupWarnings: { message: string; type: 'warning' | 'info' }[] = [];

  if (config.workflowType === 'warmup' && accountCount > 0) {
    if (selectedWarmupDay === 'day0') {
      if (warmupProtocol?.day0?.addProfilePhoto && accountsWithProfilePic === 0) {
        warmupWarnings.push({
          message: 'Day 0 requires profile photos but none found in account data',
          type: 'warning',
        });
      } else if (warmupProtocol?.day0?.addProfilePhoto && accountsWithProfilePic < accountCount) {
        warmupWarnings.push({
          message: `Only ${accountsWithProfilePic}/${accountCount} accounts have profile photos`,
          type: 'info',
        });
      }
      if (warmupProtocol?.day0?.addBio && accountsWithBio === 0) {
        warmupWarnings.push({
          message: 'Day 0 requires bios but none found. Use "Generate Bios" in warmup settings.',
          type: 'warning',
        });
      } else if (warmupProtocol?.day0?.addBio && accountsWithBio < accountCount) {
        warmupWarnings.push({
          message: `Only ${accountsWithBio}/${accountCount} accounts have bios. Use "Generate Bios" to fill missing.`,
          type: 'info',
        });
      }
    }
    if (selectedWarmupDay === 'day3_7' && warmupProtocol?.day3_7?.postPhoto && accountsWithPosts === 0) {
      warmupWarnings.push({
        message: 'Post photo is enabled but no posts found in account data',
        type: 'warning',
      });
    }
  }

  // Setup-specific steps
  const setupSteps: WorkflowStep[] = [
    {
      icon: <Sparkles className="h-4 w-4" />,
      label: 'Warmup',
      description: 'Humanize account before profile setup (per SOP)',
      enabled: true, // Always enabled per SOP 4.1
    },
    {
      icon: <UserCircle className="h-4 w-4" />,
      label: 'Profile Picture',
      description: 'Set account profile picture',
      enabled: !!config.setupFlowIds?.setProfilePicture,
    },
    {
      icon: <FileText className="h-4 w-4" />,
      label: 'Bio',
      description: 'Set account bio/description',
      enabled: !!config.setupFlowIds?.setBio,
    },
    {
      icon: <Image className="h-4 w-4" />,
      label: 'Posts',
      description: 'Create feed posts',
      enabled: !!config.setupFlowIds?.createPost,
    },
    {
      icon: <Bookmark className="h-4 w-4" />,
      label: 'Highlight',
      description: 'Create story highlight',
      enabled: !!config.setupFlowIds?.createStoryHighlight,
    },
    {
      icon: <Lock className="h-4 w-4" />,
      label: 'Private',
      description: 'Set account to private',
      enabled: !!config.setupFlowIds?.setPrivate,
    },
    {
      icon: <ShieldCheck className="h-4 w-4" />,
      label: '2FA',
      description: 'Enable two-factor authentication',
      enabled: !!config.setupFlowIds?.enable2FA,
    },
  ];

  // Sister workflow steps - simplified flow without posts, private, or 2FA
  const sisterSteps: WorkflowStep[] = [
    {
      icon: <AtSign className="h-4 w-4" />,
      label: 'Rename Username',
      description: 'Change account username to new value',
      enabled: !!config.setupFlowIds?.renameUsername,
    },
    {
      icon: <FileText className="h-4 w-4" />,
      label: 'Display Name',
      description: 'Edit account display name',
      enabled: !!config.setupFlowIds?.editDisplayName,
    },
    {
      icon: <UserCircle className="h-4 w-4" />,
      label: 'Profile Picture',
      description: 'Set account profile picture',
      enabled: !!config.setupFlowIds?.setProfilePicture,
    },
    {
      icon: <FileText className="h-4 w-4" />,
      label: 'Bio',
      description: 'Set account bio/description',
      enabled: !!config.setupFlowIds?.setBio,
    },
  ];

  // Post only workflow steps - just login and publish posts
  const postSteps: WorkflowStep[] = [
    {
      icon: <Image className="h-4 w-4" />,
      label: 'Publish Posts',
      description:
        accountsWithPosts > 0
          ? `Publish ${totalPosts} post(s)${hasVideoPosts ? ' (includes video)' : ''}`
          : 'No posts configured',
      enabled: accountsWithPosts > 0,
    },
  ];

  // Reddit warmup steps
  const redditWarmupSteps: WorkflowStep[] = [
    {
      icon: <MessageSquare className="h-4 w-4" />,
      label: 'Browse Reddit',
      description: 'Browse and engage with Reddit content',
      enabled: true,
    },
  ];

  // Reddit post steps
  const redditPostSteps: WorkflowStep[] = [
    {
      icon: <MessageSquare className="h-4 w-4" />,
      label: 'Browse Reddit',
      description: 'Optional warmup before posting',
      enabled: accountsWithWarmup > 0,
    },
    {
      icon: <Image className="h-4 w-4" />,
      label: 'Publish to Reddit',
      description: 'Post images or videos to subreddits',
      enabled: true,
    },
  ];

  // Task configuration for custom workflow
  const taskStepConfig: Record<string, { icon: React.ReactNode; label: string; description: string }> = {
    renameUsername: {
      icon: <AtSign className="h-4 w-4" />,
      label: 'Rename Username',
      description: 'Change account username to new value',
    },
    editDisplayName: {
      icon: <FileText className="h-4 w-4" />,
      label: 'Display Name',
      description: 'Edit account display name',
    },
    setProfilePicture: {
      icon: <UserCircle className="h-4 w-4" />,
      label: 'Profile Picture',
      description: 'Set account profile picture',
    },
    setBio: {
      icon: <FileText className="h-4 w-4" />,
      label: 'Bio',
      description: 'Set account bio/description',
    },
    createPost: {
      icon: <Image className="h-4 w-4" />,
      label: 'Posts',
      description: 'Create feed posts',
    },
    createStoryHighlight: {
      icon: <Bookmark className="h-4 w-4" />,
      label: 'Highlight',
      description: 'Create story highlight',
    },
    setPrivate: {
      icon: <Lock className="h-4 w-4" />,
      label: 'Private',
      description: 'Set account to private',
    },
    enable2FA: {
      icon: <ShieldCheck className="h-4 w-4" />,
      label: '2FA',
      description: 'Enable two-factor authentication',
    },
  };

  // Custom workflow steps - show tasks in the order specified by customTaskOrder
  const customSteps: WorkflowStep[] = (config.customTaskOrder || [])
    .filter(taskKey => config.setupFlowIds?.[taskKey]) // Only include tasks with assigned flows
    .map(taskKey => {
      const stepConfig = taskStepConfig[taskKey];
      if (!stepConfig) return null;
      return {
        ...stepConfig,
        enabled: true,
      };
    })
    .filter(Boolean) as WorkflowStep[];

  // Select workflow steps based on type
  const getWorkflowSteps = () => {
    switch (config.workflowType) {
      case 'setup':
        return setupSteps;
      case 'sister':
        return sisterSteps;
      case 'custom':
        return customSteps;
      case 'post':
        return postSteps;
      case 'reddit_warmup':
        return redditWarmupSteps;
      case 'reddit_post':
        return redditPostSteps;
      default:
        return warmupSteps;
    }
  };
  const workflowSpecificSteps = getWorkflowSteps();
  const workflowSteps: WorkflowStep[] = [
    ...commonStartSteps,
    ...workflowSpecificSteps,
    ...commonEndSteps,
  ];

  const getStatusIcon = (status: ValidationItem['status']) => {
    switch (status) {
      case 'valid':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'invalid':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            Workflow Preview
            <Badge variant="outline" className="font-normal">
              {WORKFLOW_LABELS[config.workflowType] || 'Warmup'}
            </Badge>
            {config.workflowType === 'warmup' && (
              <Badge variant="secondary" className="font-normal text-xs">
                {WARMUP_DAY_LABELS[selectedWarmupDay]}
              </Badge>
            )}
          </span>
          <Badge
            variant={isValid ? 'default' : 'destructive'}
            className={isValid ? 'bg-green-500' : ''}
          >
            {isValid ? 'Ready' : 'Not Ready'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Validation Section */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Configuration Check
          </p>
          <div className="grid grid-cols-2 gap-2">
            {validations.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-2 text-sm p-2 rounded-md bg-muted/50"
              >
                {getStatusIcon(item.status)}
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{item.label}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {item.message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Workflow Steps */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Workflow Steps
          </p>
          <div className="flex items-center gap-1 flex-wrap">
            {workflowSteps.map((step, index) => (
              <div key={step.label} className="flex items-center">
                <div
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs ${
                    step.enabled
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground line-through'
                  }`}
                  title={step.description}
                >
                  {step.icon}
                  <span>{step.label}</span>
                </div>
                {index < workflowSteps.length - 1 && (
                  <ArrowRight className="h-3 w-3 text-muted-foreground mx-1" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-2 pt-2 border-t">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Summary
          </p>
          <div className="text-sm space-y-1">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-muted-foreground" />
              <span>
                Will process <strong>{accountCount || 0}</strong> phones
                (limited by account count)
              </span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="text-xs">
                Concurrency: {config.concurrencyLimit} | Retries:{' '}
                {config.maxRetriesPerStage} | Timeout: {config.pollTimeoutSeconds}s
              </span>
            </div>
          </div>
        </div>

        {/* Warmup Warnings */}
        {warmupWarnings.length > 0 && (
          <div className="space-y-2">
            {warmupWarnings.map((warning, index) => (
              <div
                key={index}
                className={`flex items-start gap-2 text-sm p-2 rounded-md ${
                  warning.type === 'warning'
                    ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-700'
                    : 'bg-blue-500/10 border border-blue-500/20 text-blue-700'
                }`}
              >
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{warning.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Warnings */}
        {!isValid && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-md p-3">
            <p className="text-sm text-red-600 font-medium">
              Cannot start workflow
            </p>
            <p className="text-xs text-red-500 mt-1">
              Please complete all required configuration fields above.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
