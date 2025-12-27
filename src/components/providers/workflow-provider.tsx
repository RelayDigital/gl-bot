'use client';

import { ReactNode } from 'react';
import { WorkflowProvider as WorkflowContextProvider } from '@/hooks/use-workflow';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return <WorkflowContextProvider>{children}</WorkflowContextProvider>;
}
