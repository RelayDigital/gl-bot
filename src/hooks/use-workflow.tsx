'use client';

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  ReactNode,
} from 'react';
import {
  PhoneJob,
  LogEntry,
  WorkflowStatus,
  ResultsSummary,
  WorkflowConfig,
  WorkflowType,
  SetupFlowIds,
} from '@/lib/state-machine/types';

// ==================== Types ====================

interface WorkflowState {
  status: WorkflowStatus;
  phones: Map<string, PhoneJob>;
  logs: LogEntry[];
  results: ResultsSummary | null;
  config: Partial<WorkflowConfig> | null;
  isConnected: boolean;
  error: string | null;
}

type WorkflowAction =
  | { type: 'SET_STATUS'; payload: { status: WorkflowStatus; error?: string } }
  | { type: 'UPDATE_PHONE'; payload: PhoneJob }
  | { type: 'SET_PHONES'; payload: PhoneJob[] }
  | { type: 'ADD_LOG'; payload: LogEntry }
  | { type: 'SET_LOGS'; payload: LogEntry[] }
  | { type: 'SET_RESULTS'; payload: ResultsSummary }
  | { type: 'SET_CONFIG'; payload: Partial<WorkflowConfig> }
  | { type: 'SET_CONNECTED'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'RESET' };

interface WorkflowContextValue {
  state: WorkflowState;
  dispatch: React.Dispatch<WorkflowAction>;
  actions: {
    startWorkflow: (config: {
      apiToken: string;
      groupName: string;
      accountData: string;
      igAppVersionId: string;
      concurrencyLimit?: number;
      maxRetriesPerStage?: number;
      baseBackoffSeconds?: number;
      pollIntervalSeconds?: number;
      pollTimeoutSeconds?: number;
      customLoginFlowId?: string;
      customLoginFlowParams?: string[];
      workflowType: WorkflowType;
      setupFlowIds?: SetupFlowIds;
    }) => Promise<void>;
    stopWorkflow: () => Promise<void>;
    clearWorkflow: () => Promise<void>;
    refreshStatus: () => Promise<void>;
  };
}

// ==================== Initial State ====================

const initialState: WorkflowState = {
  status: 'idle',
  phones: new Map(),
  logs: [],
  results: null,
  config: null,
  isConnected: false,
  error: null,
};

// ==================== Reducer ====================

function workflowReducer(
  state: WorkflowState,
  action: WorkflowAction
): WorkflowState {
  switch (action.type) {
    case 'SET_STATUS':
      return {
        ...state,
        status: action.payload.status,
        error: action.payload.error || null,
      };

    case 'UPDATE_PHONE': {
      const newPhones = new Map(state.phones);
      newPhones.set(action.payload.envId, action.payload);
      return { ...state, phones: newPhones };
    }

    case 'SET_PHONES': {
      const newPhones = new Map<string, PhoneJob>();
      for (const phone of action.payload) {
        newPhones.set(phone.envId, phone);
      }
      return { ...state, phones: newPhones };
    }

    case 'ADD_LOG':
      return {
        ...state,
        logs: [...state.logs.slice(-999), action.payload],
      };

    case 'SET_LOGS':
      return { ...state, logs: action.payload };

    case 'SET_RESULTS':
      return { ...state, results: action.payload };

    case 'SET_CONFIG':
      return { ...state, config: action.payload };

    case 'SET_CONNECTED':
      return { ...state, isConnected: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'RESET':
      return { ...initialState, isConnected: state.isConnected };

    default:
      return state;
  }
}

// ==================== Context ====================

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

// ==================== Provider ====================

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workflowReducer, initialState);

  // Start workflow
  const startWorkflow = useCallback(
    async (config: {
      apiToken: string;
      groupName: string;
      accountData: string;
      igAppVersionId: string;
      concurrencyLimit?: number;
      maxRetriesPerStage?: number;
      baseBackoffSeconds?: number;
      pollIntervalSeconds?: number;
      pollTimeoutSeconds?: number;
      customLoginFlowId?: string;
      customLoginFlowParams?: string[];
      workflowType: WorkflowType;
      setupFlowIds?: SetupFlowIds;
    }) => {
      try {
        dispatch({ type: 'SET_ERROR', payload: null });
        dispatch({ type: 'RESET' });

        const response = await fetch('/api/workflow/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to start workflow');
        }

        // Explicitly set status to running (don't rely solely on SSE)
        dispatch({ type: 'SET_STATUS', payload: { status: 'running' } });

        dispatch({
          type: 'SET_CONFIG',
          payload: {
            apiToken: config.apiToken,
            groupName: config.groupName,
            igAppVersionId: config.igAppVersionId,
            concurrencyLimit: config.concurrencyLimit,
            maxRetriesPerStage: config.maxRetriesPerStage,
            baseBackoffSeconds: config.baseBackoffSeconds,
            pollIntervalSeconds: config.pollIntervalSeconds,
            pollTimeoutSeconds: config.pollTimeoutSeconds,
            customLoginFlowId: config.customLoginFlowId,
            customLoginFlowParams: config.customLoginFlowParams,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        dispatch({ type: 'SET_ERROR', payload: message });
        throw error;
      }
    },
    []
  );

  // Stop workflow
  const stopWorkflow = useCallback(async () => {
    try {
      dispatch({ type: 'SET_ERROR', payload: null });

      const response = await fetch('/api/workflow/stop', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to stop workflow');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      dispatch({ type: 'SET_ERROR', payload: message });
      throw error;
    }
  }, []);

  // Clear workflow state (reset to idle)
  const clearWorkflow = useCallback(async () => {
    try {
      dispatch({ type: 'SET_ERROR', payload: null });

      // Clear server-side state first
      const response = await fetch('/api/workflow/clear', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to clear workflow');
      }

      // Reset client-side state
      dispatch({ type: 'RESET' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      dispatch({ type: 'SET_ERROR', payload: message });
      // Still reset client state even if server call fails
      dispatch({ type: 'RESET' });
    }
  }, []);

  // Refresh status from server
  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/workflow/status');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get status');
      }

      dispatch({ type: 'SET_STATUS', payload: { status: data.status } });
      dispatch({ type: 'SET_PHONES', payload: data.phones || [] });
      dispatch({ type: 'SET_LOGS', payload: data.logs || [] });

      if (data.results) {
        dispatch({ type: 'SET_RESULTS', payload: data.results });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      dispatch({ type: 'SET_ERROR', payload: message });
    }
  }, []);

  const value: WorkflowContextValue = {
    state,
    dispatch,
    actions: {
      startWorkflow,
      stopWorkflow,
      clearWorkflow,
      refreshStatus,
    },
  };

  return (
    <WorkflowContext.Provider value={value}>
      {children}
    </WorkflowContext.Provider>
  );
}

// ==================== Hook ====================

export function useWorkflow() {
  const context = useContext(WorkflowContext);

  if (!context) {
    throw new Error('useWorkflow must be used within a WorkflowProvider');
  }

  return context;
}

// ==================== Derived State Hooks ====================

export function usePhones(): PhoneJob[] {
  const { state } = useWorkflow();
  return Array.from(state.phones.values()).sort(
    (a, b) => a.phone_index - b.phone_index
  );
}

export function useWorkflowStatus(): WorkflowStatus {
  const { state } = useWorkflow();
  return state.status;
}

export function useIsRunning(): boolean {
  const { state } = useWorkflow();
  return state.status === 'running' || state.status === 'stopping';
}

export function useLogs(): LogEntry[] {
  const { state } = useWorkflow();
  return state.logs;
}

export function useResults(): ResultsSummary | null {
  const { state } = useWorkflow();
  return state.results;
}
