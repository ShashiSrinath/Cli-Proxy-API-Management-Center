/** Wire contracts for the plans endpoint and subscription configuration. */
export interface SubscriptionPlan {
  id: string;
  name: string;
  provider: string;
  'price-usd': number;
  cycle?: 'monthly' | 'weekly' | 'yearly';
  'anchor-date'?: string;
  credentials?: string[];
  notes?: string;
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
  };
}
export interface PlanWindow {
  key: string;
  label: string;
  window_start: string;
  resets_at: string;
  used_fraction: number;
  value_usd: number;
  est_capacity_usd: number | null;
  est_headroom_usd: number | null;
  provider_used: number | null;
  provider_limit: number | null;
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
}
