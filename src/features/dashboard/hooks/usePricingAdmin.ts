/**
 * Pricing catalog and overrides for the pricing panel.
 *
 * The OpenRouter catalog is large, so the panel loads it on first open rather than with the
 * summary. Failures from `refreshPrices` and `saveOverrides` are thrown to the caller, which
 * owns the notification.
 */

import { useCallback, useRef, useState } from 'react';
import { usageApi } from '@/services/api';
import type { ModelPriceOverride, UsagePricing } from '@/types/usage';

export function usePricingAdmin() {
  const [pricing, setPricing] = useState<UsagePricing | null>(null);
  const [loading, setLoading] = useState(false);
  /** Message of the last failed catalog load; null while the last load succeeded. */
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async (): Promise<UsagePricing | null> => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;
    setLoading(true);
    try {
      const next = await usageApi.getPricing();
      if (!isCurrent()) return null;
      setPricing(next);
      setError(null);
      return next;
    } catch (err: unknown) {
      if (isCurrent()) setError(err instanceof Error ? err.message : '');
      return null;
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  const refreshPrices = useCallback(async (): Promise<UsagePricing> => {
    const next = await usageApi.refreshPricing();
    setPricing(next);
    return next;
  }, []);

  /**
   * The PUT answers with the config write, not the pricing payload, so the authoritative
   * overrides are read back with a GET before the caller re-seeds its drafts.
   */
  const saveOverrides = useCallback(
    async (overrides: Record<string, ModelPriceOverride>): Promise<UsagePricing> => {
      await usageApi.putOverrides(overrides);
      const next = await usageApi.getPricing();
      setPricing(next);
      return next;
    },
    []
  );

  return { pricing, loading, error, load, refreshPrices, saveOverrides };
}
