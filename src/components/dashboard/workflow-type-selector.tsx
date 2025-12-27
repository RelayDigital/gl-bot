'use client';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  WorkflowType,
  WorkflowCategory,
  WORKFLOW_LABELS,
  WORKFLOW_DESCRIPTIONS,
  WORKFLOW_CATEGORIES,
  WORKFLOW_CATEGORY_LABELS,
} from '@/lib/state-machine/types';
import { Flame, Settings, Users, Wrench, Send, MessageSquare, Image } from 'lucide-react';

interface WorkflowTypeSelectorProps {
  value: WorkflowType;
  onChange: (value: WorkflowType) => void;
  disabled?: boolean;
}

const workflowIcons: Record<WorkflowType, React.ReactNode> = {
  // Instagram workflows
  warmup: <Flame className="h-4 w-4 text-orange-500" />,
  setup: <Settings className="h-4 w-4 text-blue-500" />,
  sister: <Users className="h-4 w-4 text-purple-500" />,
  custom: <Wrench className="h-4 w-4 text-green-500" />,
  post: <Send className="h-4 w-4 text-pink-500" />,
  // Reddit workflows (orange-red theme)
  reddit_warmup: <MessageSquare className="h-4 w-4 text-orange-600" />,
  reddit_post: <Image className="h-4 w-4 text-red-500" />,
};

// Group workflows by category
function getWorkflowsByCategory(): Record<WorkflowCategory, WorkflowType[]> {
  const grouped: Record<WorkflowCategory, WorkflowType[]> = {
    instagram: [],
    reddit: [],
  };

  (Object.keys(WORKFLOW_LABELS) as WorkflowType[]).forEach((type) => {
    const category = WORKFLOW_CATEGORIES[type];
    grouped[category].push(type);
  });

  return grouped;
}

export function WorkflowTypeSelector({
  value,
  onChange,
  disabled = false,
}: WorkflowTypeSelectorProps) {
  const workflowsByCategory = getWorkflowsByCategory();
  // Only show categories that have workflows
  const categories = (Object.keys(workflowsByCategory) as WorkflowCategory[])
    .filter(cat => workflowsByCategory[cat].length > 0);

  return (
    <div className="space-y-2">
      <Label htmlFor="workflow-type">Workflow Type</Label>
      <Select
        value={value}
        onValueChange={(v) => onChange(v as WorkflowType)}
        disabled={disabled}
      >
        <SelectTrigger id="workflow-type" className="w-full">
          <SelectValue placeholder="Select workflow type">
            <div className="flex items-center gap-2">
              {workflowIcons[value]}
              <span>{WORKFLOW_LABELS[value]}</span>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {categories.map((category) => (
            <SelectGroup key={category}>
              <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {WORKFLOW_CATEGORY_LABELS[category]}
              </SelectLabel>
              {workflowsByCategory[category].map((type) => (
                <SelectItem key={type} value={type}>
                  <div className="flex items-center gap-2">
                    {workflowIcons[type]}
                    <div className="flex flex-col">
                      <span className="font-medium">{WORKFLOW_LABELS[type]}</span>
                      <span className="text-xs text-muted-foreground">
                        {WORKFLOW_DESCRIPTIONS[type]}
                      </span>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {WORKFLOW_DESCRIPTIONS[value]}
      </p>
    </div>
  );
}
