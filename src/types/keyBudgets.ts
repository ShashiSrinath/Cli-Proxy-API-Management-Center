/**
 * Live per-key budget status (normalized, camelCase). Backend contract:
 * GET /v8/management/observability/usage/key-budgets.
 *
 * One row per configured key (`access.api-keys`) in config order. Raw keys are never
 * returned; rows are matched to configured keys by `masked`.
 */

export type BudgetPeriod = 'day' | 'week' | 'month';

/** Mirrors config access.api-key-limits; absent amounts mean no cap for that window. */
export interface KeyBudgetLimits {
  dailyUsd?: number;
  weeklyUsd?: number;
  monthlyUsd?: number;
  timezone?: string;
}

export interface KeyBudgetWindow {
  period: BudgetPeriod;
  limitUsd: number;
  spentUsd: number;
  /** Window start, ISO 8601. Empty when the backend omitted it. */
  start: string;
  /** Next window boundary, ISO 8601. Empty when the backend omitted it. */
  resetsAt: string;
  exceeded: boolean;
}

export interface KeyBudgetRow {
  /** "k_" + 12 hex of sha256(raw key). Matches the usage dashboard key ids. */
  id: string;
  masked: string;
  name: string;
  /** Model allow-list; empty means every model. */
  models: string[];
  /** Provider allow-list; empty means every provider. */
  providers: string[];
  limits: KeyBudgetLimits | null;
  /** Only windows with a positive limit are listed. */
  windows: KeyBudgetWindow[];
  exceeded: boolean;
}

export interface KeyBudgets {
  /** False when usage tracking is disabled: budgets cannot be evaluated and are blocked. */
  enabled: boolean;
  generatedAt: string;
  keys: KeyBudgetRow[];
}
