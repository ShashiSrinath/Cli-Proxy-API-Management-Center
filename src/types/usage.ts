/**
 * Usage dashboard types (normalized, camelCase). Backend contract:
 * GET /observability/usage/summary and /observability/usage/pricing.
 */

export type UsageRange = '24h' | '7d' | '30d' | '90d';
export type UsageBucket = 'hour' | 'day';
export type PriceSource = 'openrouter' | 'override' | 'none';

export interface UsageStats {
  requests: number;
  attempts: number;
  failed: number;
  inputTokens: number;
  uncachedInputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  costUsd: number;
  avgLatencyMs: number;
}

export interface UsageSeriesPoint extends UsageStats {
  /** Bucket start, ISO 8601. */
  t: string;
}

/** USD per one million tokens. */
export interface ModelPrice {
  source: PriceSource;
  matchedId: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  conditional?: ConditionalPrice[];
}

export interface ConditionalPrice {
  utcDays: string[];
  utcStart?: number;
  utcEnd?: number;
  minPromptTokens: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface UsageModelKeyShare {
  id: string;
  requests: number;
  costUsd: number;
}

export interface UsageModelRow {
  provider: string;
  model: string;
  totals: UsageStats;
  priced: boolean;
  price: ModelPrice;
  /** Only present on top-level summary.models rows. */
  keys?: UsageModelKeyShare[];
}

export interface UsageKeyRow {
  /** "k_" + 12 hex of sha256(raw key), or "unattributed". */
  id: string;
  name: string;
  masked: string;
  /** Still present in access.api-keys. */
  configured: boolean;
  /** Provider allow-list; empty means all providers. */
  providers: string[];
  firstSeen: string;
  lastUsed: string;
  totals: UsageStats;
  series: UsageSeriesPoint[];
  models: UsageModelRow[];
}

export interface UsagePricingStatus {
  source: string;
  fetchedAt: string;
  catalogSize: number;
  error: string;
}

export interface UsageSummary {
  enabled: boolean;
  from: string;
  to: string;
  bucket: UsageBucket;
  tz: string;
  generatedAt: string;
  pricing: UsagePricingStatus;
  totals: UsageStats;
  series: UsageSeriesPoint[];
  keys: UsageKeyRow[];
  models: UsageModelRow[];
}

export interface PricingCatalogEntry {
  id: string;
  name: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  conditional?: ConditionalPrice[];
}

/** Mirrors config usage-tracking.pricing.overrides values. Undefined fields are unset. */
export interface ModelPriceOverride {
  openrouterId?: string;
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface UsagePricing {
  source: string;
  fetchedAt: string;
  error: string;
  openrouterDisabled: boolean;
  catalog: PricingCatalogEntry[];
  overrides: Record<string, ModelPriceOverride>;
}
