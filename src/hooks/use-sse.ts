'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useWorkflow } from './use-workflow';

/**
 * Hook to manage SSE connection for real-time workflow updates
 *
 * Automatically connects on mount and handles reconnection on errors.
 * Dispatches events to the workflow context.
 */
export function useSSE() {
  const { dispatch } = useWorkflow();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const eventSource = new EventSource('/api/events');
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      dispatch({ type: 'SET_CONNECTED', payload: true });
      reconnectAttempts.current = 0;
    };

    eventSource.addEventListener('phone_update', (e) => {
      try {
        const phone = JSON.parse(e.data);
        dispatch({ type: 'UPDATE_PHONE', payload: phone });
      } catch (error) {
        console.error('Failed to parse phone_update event:', error);
      }
    });

    eventSource.addEventListener('log', (e) => {
      try {
        const log = JSON.parse(e.data);
        dispatch({ type: 'ADD_LOG', payload: log });
      } catch (error) {
        console.error('Failed to parse log event:', error);
      }
    });

    eventSource.addEventListener('workflow_status', (e) => {
      try {
        const data = JSON.parse(e.data);
        dispatch({ type: 'SET_STATUS', payload: data });
      } catch (error) {
        console.error('Failed to parse workflow_status event:', error);
      }
    });

    eventSource.addEventListener('results', (e) => {
      try {
        const results = JSON.parse(e.data);
        dispatch({ type: 'SET_RESULTS', payload: results });
      } catch (error) {
        console.error('Failed to parse results event:', error);
      }
    });

    eventSource.onerror = () => {
      dispatch({ type: 'SET_CONNECTED', payload: false });
      eventSource.close();
      eventSourceRef.current = null;

      // Exponential backoff for reconnection
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
      reconnectAttempts.current++;

      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };
  }, [dispatch]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    dispatch({ type: 'SET_CONNECTED', payload: false });
  }, [dispatch]);

  // Auto-connect on mount
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return { connect, disconnect };
}
