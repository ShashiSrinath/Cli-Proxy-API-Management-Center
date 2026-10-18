/**
 * Usage summary for the dashboard: range state, fetching, and background refresh.
 *
 * `usageApi.getSummary` does not take an AbortSignal, so a superseded request cannot be
 * cancelled on the wire. Instead each request takes an id and only the latest one may write.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInterval } from '@/hooks/useInterval';
import { usageApi } from '@/services/api';
import { useAuthStore } from '@/stores';
import type { UsageRange, UsageSummary } from '@/types/usage';
import { browserTimeZone } from '../utils';

/** Background refresh cadence. Ticks are skipped while the tab is hidden. */
export const USAGE_AUTO_REFRESH_MS = 60_000;

export function useUsageSummary() {
  const { t } = useTranslation();
  const connected = useAuthStore((state) => state.connectionStatus === 'connected');
  const [range, setRange] = useState<UsageRange>('24h');
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);
  const timeZone = browserTimeZone();

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;
    setLoading(true);
    try {
      const next = await usageApi.getSummary({ range, tz: timeZone });
      if (!isCurrent()) return;
      setSummary(next);
      setError('');
    } catch (err: unknown) {
      if (!isCurrent()) return;
      setError(err instanceof Error ? err.message : t('notification.refresh_failed'));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [range, timeZone, t]);

  useEffect(() => {
    if (!connected) return;
    void load();
  }, [connected, load]);

  // Drop any in-flight response once the page unmounts.
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
    connected ? USAGE_AUTO_REFRESH_MS : null
  );

  return { summary, range, setRange, timeZone, loading, error, connected, refresh: load };
}
