import { useMemo } from 'react';
import { useKeyBudgets } from '@/hooks/useKeyBudgets';
import type { KeyBudgetRow } from '@/types/keyBudgets';

/**
 * Budget rows keyed by `id` for the dashboard. Key ids there are computed by the backend
 * (`k_…`), so they match the budget endpoint directly — no mask matching needed.
 */
export function useKeyBudgetsById(): {
  enabled: boolean;
  byId: Map<string, KeyBudgetRow>;
  error: string;
} {
  const { budgets, error } = useKeyBudgets();
  const byId = useMemo(() => {
    const map = new Map<string, KeyBudgetRow>();
    (budgets?.keys ?? []).forEach((row) => {
      if (row.id) map.set(row.id, row);
    });
    return map;
  }, [budgets]);

  return { enabled: budgets?.enabled ?? true, byId, error };
}
