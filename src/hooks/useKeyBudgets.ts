/**
 * Live key budget status, shared by the config editor and the usage dashboard.
 *
 * The endpoint is a read-only view of the config plus the tracker's spend, so it is polled
 * quietly: a failed refresh keeps the last payload and no request may write after the
 * connection (apiBase) changed or the consumer unmounted.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useInterval } from '@/hooks/useInterval';
import { keyBudgetsApi } from '@/services/api';
import { useAuthStore } from '@/stores';
import type { KeyBudgets } from '@/types/keyBudgets';

/** Background refresh cadence. Ticks are skipped while the tab is hidden. */
export const KEY_BUDGETS_REFRESH_MS = 60_000;

export interface KeyBudgetsState {
  budgets: KeyBudgets | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}

/**
 * @param enabled pass false to skip fetching entirely (e.g. no keys with limits are visible).
 */
export function useKeyBudgets(enabled = true): KeyBudgetsState {
  const apiBase = useAuthStore((state) => state.apiBase);
  const connected = useAuthStore((state) => state.connectionStatus === 'connected');
  const [budgets, setBudgets] = useState<KeyBudgets | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);

  // A new connection must never inherit the previous server's spend figures.
  useEffect(() => {
    requestIdRef.current += 1;
    setBudgets(null);
    setError('');
    setLoading(false);
  }, [apiBase]);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;
    setLoading(true);
    try {
      const next = await keyBudgetsApi.get();
      if (!isCurrent()) return;
      setBudgets(next);
      setError('');
    } catch (err: unknown) {
      if (!isCurrent()) return;
      setError(err instanceof Error ? err.message : String(err ?? ''));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  const active = enabled && connected;

  useEffect(() => {
    if (!active) return;
    void load();
  }, [active, load]);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
    },
    []
  );

  useInterval(
    () => {
      if (document.visibilityState === 'visible') void load();
    },
    active ? KEY_BUDGETS_REFRESH_MS : null
  );

  return { budgets, loading, error, refresh: load };
}
