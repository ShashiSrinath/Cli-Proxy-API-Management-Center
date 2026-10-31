/** Wire contracts for the plans endpoint and subscription configuration. */

/** Effective limit shape of a plan: weekly-only windows or a scarcer monthly cap. */
export type PlanLimitType = 'weekly' | 'monthly';
/** Per-plan routing override. */
export type PlanRoutingMode = 'auto' | 'prefer' | 'avoid';
/** Config value for `limit-type`; empty means auto-detect. */
export type PlanLimitTypeSetting = '' | PlanLimitType;
/** Config value for `routing`; empty means auto. */
export type PlanRoutingSetting = '' | 'prefer' | 'avoid';

export interface SubscriptionPlan {
  id: string;
  name: string;
  provider: string;
  'price-usd': number;
  cycle?: 'monthly' | 'weekly' | 'yearly';
  'anchor-date'?: string;
  credentials?: string[];
  notes?: string;
  'limit-type'?: PlanLimitTypeSetting;
  routing?: PlanRoutingSetting;
}
export interface PlansStats {
  requests: number;
  attempts: number;
  failed: number;
  input_tokens: number;
  uncached_input_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cost_usd: number;
  avg_latency_ms: number;
}
export interface PlansModelRow {
  provider: string;
  model: string;
  totals: PlansStats;
  priced: boolean;
  price: {
    source: 'openrouter' | 'override' | 'none';
    matched_id: string;
    input: number;
    output: number;
    cache_read: number;
    cache_write: number;
    conditional?: Array<{
      utc_days?: string[];
      utc_start?: number;
      utc_end?: number;
      min_prompt_tokens?: number;
      input: number;
      output: number;
      cache_read: number;
      cache_write: number;
    }>;
  };
}
export interface PlanWindow {
  key: string;
  label: string;
  window_start: string;
  resets_at: string;
  /** Null when the provider only reports remaining credits (unknown share used). */
  used_fraction: number | null;
  value_usd: number;
  est_capacity_usd: number | null;
  est_headroom_usd: number | null;
  provider_used: number | null;
  provider_limit: number | null;
  /** Remaining provider quota in `unit`, when the provider reports it. */
  provider_remaining: number | null;
  unit: 'usd' | 'credits' | 'percent';
  exhausted: boolean;
}
export interface PlanCredential {
  auth_id: string;
  label: string;
  provider: string;
  status: string;
  disabled: boolean;
  value_usd: number;
  windows: PlanWindow[];
  windows_error: string;
}
export interface PlanValue {
  id: string;
  name: string;
  provider: string;
  notes: string;
  price_usd: number;
  cycle: 'monthly' | 'weekly' | 'yearly';
  anchor_date: string;
  anchor_source: 'config' | 'provider' | 'default';
  /** Absent on servers without smart routing. */
  limit_type?: PlanLimitType;
  limit_type_source?: 'auto' | 'config';
  routing?: PlanRoutingMode;
  cycle_start: string;
  cycle_end: string;
  elapsed_days: number;
  length_days: number;
  value_usd: number;
  multiplier: number | null;
  break_even_at: string | null;
  projected_value_usd: number;
  last_7d_value_usd: number;
  effective_usd_per_mtok: number | null;
  unpriced_token_share: number;
  totals: PlansStats;
  series: { t: string; value_usd: number; cumulative_usd: number }[];
  models: PlansModelRow[];
  credentials: PlanCredential[];
}
export interface UnassignedPlanUsage {
  auth_id: string;
  label: string;
  provider: string;
  value_usd: number;
  requests: number;
}
export interface AvailablePlanCredential {
  auth_id: string;
  label: string;
  provider: string;
  plan_id: string;
}
export type RoutingEntryState = 'active' | 'paused' | 'disabled';
/** One plan credential in the scheduler's routing order. */
export interface RoutingOrderEntry {
  /** 1-based routing order among plan credentials. */
  rank: number;
  auth_id: string;
  label: string;
  provider: string;
  plan_id: string;
  plan_name: string;
  /** Effective scheduler priority (higher = preferred). */
  priority: number;
  limit_type: PlanLimitType;
  limit_type_source: 'auto' | 'config';
  routing: PlanRoutingMode;
  /** When the longest limit window fully resets; empty when unknown. */
  full_reset_at: string;
  /** True when the reset is assumed (window not started or unknown). */
  full_reset_estimated: boolean;
  remaining_fraction: number | null;
  state: RoutingEntryState;
  paused_until: string;
  paused_window: string;
}
export interface PlansRouting {
  enabled: boolean;
  computed_at: string;
  refresh_seconds: number;
  order: RoutingOrderEntry[];
}
export interface PlansResponse {
  enabled: boolean;
  generated_at: string;
  tz: string;
  pricing: { source: string; fetched_at: string; catalog_size: number; error: string };
  totals: {
    price_usd: number;
    value_usd: number;
    multiplier: number | null;
    projected_value_usd: number;
    unassigned_value_usd: number;
  };
  plans: PlanValue[];
  unassigned: UnassignedPlanUsage[];
  available_credentials: AvailablePlanCredential[];
  providers: string[];
  /** Null when the server predates smart routing. */
  routing: PlansRouting | null;
}
