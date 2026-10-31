/**
 * Usage dashboard API (v8 /observability/usage). Backend JSON is snake_case; the normalizers
 * below convert it to the camelCase shapes in src/types/usage.ts and tolerate partial or
 * malformed payloads so the UI never has to read raw backend fields.
 */

import type {
  ModelPrice,
  ModelPriceOverride,
  PriceSource,
  PricingCatalogEntry,
  UsageBucket,
  UsageKeyRow,
  UsageModelRow,
  UsagePricing,
  UsagePricingStatus,
  UsageRange,
  UsageSeriesPoint,
  UsageStats,
  UsageSummary,
} from '@/types/usage';
import { isRecord } from '@/utils/helpers';
import { normalizeUsageTotal } from '@/utils/recentRequests';
import { apiClient } from './client';

const SUMMARY_PATH = '/observability/usage/summary';
const PRICING_PATH = '/observability/usage/pricing';
const OVERRIDES_CONFIG_PATH = '/config/observability/usage/tracking/pricing/overrides';
const PRICE_SOURCES: readonly PriceSource[] = ['openrouter', 'override', 'none'];

export interface UsageSummaryQuery {
  range?: UsageRange;
  from?: string;
  to?: string;
  bucket?: UsageBucket;
  tz?: string;
}

type RawRecord = Record<string, unknown>;

const recordOf = (value: unknown): RawRecord => (isRecord(value) ? value : {});
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');
const flagOf = (value: unknown): boolean => value === true;
/** Non-finite or missing counters read as 0; see normalizeUsageTotal. */
const countOf = (value: unknown): number => normalizeUsageTotal(value);

/**
 * Optional override prices stay undefined when absent or invalid. A zero price is meaningful
 * (free model), so an unreadable value must not silently become 0.
 */
const optionalNumberOf = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const stringListOf = (value: unknown): string[] =>
  listOf(value)
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);

function normalizeStats(raw: unknown): UsageStats {
  const record = recordOf(raw);
  return {
    requests: countOf(record.requests),
    attempts: countOf(record.attempts),
    failed: countOf(record.failed),
    inputTokens: countOf(record.input_tokens),
    uncachedInputTokens: countOf(record.uncached_input_tokens),
    cacheReadTokens: countOf(record.cache_read_tokens),
    cacheWriteTokens: countOf(record.cache_write_tokens),
    outputTokens: countOf(record.output_tokens),
    reasoningTokens: countOf(record.reasoning_tokens),
    costUsd: countOf(record.cost_usd),
    avgLatencyMs: countOf(record.avg_latency_ms),
  };
}

function normalizeSeries(raw: unknown): UsageSeriesPoint[] {
  return listOf(raw)
    .filter(isRecord)
    .map((point) => ({ t: textOf(point.t), ...normalizeStats(point) }));
}

function normalizeConditional(raw: unknown) {
  return listOf(raw)
    .filter(isRecord)
    .map((entry) => ({
      utcDays: listOf(entry.utc_days).map(textOf),
      utcStart: optionalNumberOf(entry.utc_start),
      utcEnd: optionalNumberOf(entry.utc_end),
      minPromptTokens: countOf(entry.min_prompt_tokens),
      input: countOf(entry.input),
      output: countOf(entry.output),
      cacheRead: countOf(entry.cache_read),
      cacheWrite: countOf(entry.cache_write),
    }));
}

function normalizePrice(raw: unknown): ModelPrice {
  const record = recordOf(raw);
  const source = PRICE_SOURCES.find((candidate) => candidate === record.source) ?? 'none';
  return {
    source,
    matchedId: textOf(record.matched_id),
    input: countOf(record.input),
    output: countOf(record.output),
    cacheRead: countOf(record.cache_read),
    cacheWrite: countOf(record.cache_write),
    ...(Array.isArray(record.conditional)
      ? { conditional: normalizeConditional(record.conditional) }
      : {}),
  };
}

function normalizeModelRows(raw: unknown): UsageModelRow[] {
  return listOf(raw)
    .filter(isRecord)
    .map((row) => {
      const model: UsageModelRow = {
        provider: textOf(row.provider),
        model: textOf(row.model),
        totals: normalizeStats(row.totals),
        priced: flagOf(row.priced),
        price: normalizePrice(row.price),
      };
      // Per-key shares exist only on top-level summary.models rows.
      if (Array.isArray(row.keys)) {
        model.keys = row.keys.filter(isRecord).map((share) => ({
          id: textOf(share.id),
          requests: countOf(share.requests),
          costUsd: countOf(share.cost_usd),
        }));
      }
      return model;
    });
}

function normalizeKeyRows(raw: unknown): UsageKeyRow[] {
  return listOf(raw)
    .filter(isRecord)
    .map((row) => ({
      id: textOf(row.id),
      name: textOf(row.name),
      masked: textOf(row.masked),
      configured: flagOf(row.configured),
      providers: stringListOf(row.providers),
      firstSeen: textOf(row.first_seen),
      lastUsed: textOf(row.last_used),
      totals: normalizeStats(row.totals),
      series: normalizeSeries(row.series),
      models: normalizeModelRows(row.models),
    }));
}

function normalizePricingStatus(raw: unknown): UsagePricingStatus {
  const record = recordOf(raw);
  return {
    source: textOf(record.source),
    fetchedAt: textOf(record.fetched_at),
    catalogSize: countOf(record.catalog_size),
    error: textOf(record.error),
  };
}

/** Accepts any payload; missing or malformed fields become zeros, empty strings, or empty lists. */
export function normalizeUsageSummary(raw: unknown): UsageSummary {
  const record = recordOf(raw);
  return {
    enabled: flagOf(record.enabled),
    from: textOf(record.from),
    to: textOf(record.to),
    bucket: record.bucket === 'day' ? 'day' : 'hour',
    tz: textOf(record.tz),
    generatedAt: textOf(record.generated_at),
    pricing: normalizePricingStatus(record.pricing),
    totals: normalizeStats(record.totals),
    series: normalizeSeries(record.series),
    keys: normalizeKeyRows(record.keys),
    models: normalizeModelRows(record.models),
  };
}

function normalizeOverride(raw: RawRecord): ModelPriceOverride {
  const override: ModelPriceOverride = {};
  const openrouterId = textOf(raw['openrouter-id']).trim();
  if (openrouterId) override.openrouterId = openrouterId;
  const input = optionalNumberOf(raw.input);
  if (input !== undefined) override.input = input;
  const output = optionalNumberOf(raw.output);
  if (output !== undefined) override.output = output;
  const cacheRead = optionalNumberOf(raw['cache-read']);
  if (cacheRead !== undefined) override.cacheRead = cacheRead;
  const cacheWrite = optionalNumberOf(raw['cache-write']);
  if (cacheWrite !== undefined) override.cacheWrite = cacheWrite;
  return override;
}

function normalizeOverrides(raw: unknown): Record<string, ModelPriceOverride> {
  const overrides: Record<string, ModelPriceOverride> = {};
  Object.entries(recordOf(raw)).forEach(([pattern, value]) => {
    const key = pattern.trim();
    if (key && isRecord(value)) overrides[key] = normalizeOverride(value);
  });
  return overrides;
}

function normalizeCatalog(raw: unknown): PricingCatalogEntry[] {
  return listOf(raw)
    .filter(isRecord)
    .map((entry) => ({
      id: textOf(entry.id).trim(),
      name: textOf(entry.name),
      input: countOf(entry.input),
      output: countOf(entry.output),
      cacheRead: countOf(entry.cache_read),
      cacheWrite: countOf(entry.cache_write),
      ...(Array.isArray(entry.conditional)
        ? { conditional: normalizeConditional(entry.conditional) }
        : {}),
    }))
    .filter((entry) => entry.id !== '');
}

/** Accepts any payload; the catalog and overrides default to empty collections. */
export function normalizeUsagePricing(raw: unknown): UsagePricing {
  const record = recordOf(raw);
  return {
    source: textOf(record.source),
    fetchedAt: textOf(record.fetched_at),
    error: textOf(record.error),
    openrouterDisabled: flagOf(record.openrouter_disabled),
    catalog: normalizeCatalog(record.catalog),
    overrides: normalizeOverrides(record.overrides),
  };
}

const isSetPrice = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value);

/** Converts camelCase overrides to the config field names; unset and non-finite values are omitted. */
function serializeOverrides(
  overrides: Record<string, ModelPriceOverride>
): Record<string, Record<string, string | number>> {
  const body: Record<string, Record<string, string | number>> = {};
  Object.entries(overrides).forEach(([pattern, override]) => {
    const entry: Record<string, string | number> = {};
    if (override.openrouterId !== undefined) entry['openrouter-id'] = override.openrouterId;
    if (isSetPrice(override.input)) entry.input = override.input;
    if (isSetPrice(override.output)) entry.output = override.output;
    if (isSetPrice(override.cacheRead)) entry['cache-read'] = override.cacheRead;
    if (isSetPrice(override.cacheWrite)) entry['cache-write'] = override.cacheWrite;
    body[pattern] = entry;
  });
  return body;
}

const compactQuery = (params: UsageSummaryQuery): Record<string, string> =>
  Object.fromEntries(
    Object.entries(params).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== ''
    )
  );

export const usageApi = {
  async getSummary(params: UsageSummaryQuery = {}): Promise<UsageSummary> {
    const data = await apiClient.get<unknown>(SUMMARY_PATH, { params: compactQuery(params) });
    return normalizeUsageSummary(data);
  },

  async clear(): Promise<void> {
    await apiClient.delete(SUMMARY_PATH);
  },

  async getPricing(): Promise<UsagePricing> {
    return normalizeUsagePricing(await apiClient.get<unknown>(PRICING_PATH));
  },

  async refreshPricing(): Promise<UsagePricing> {
    return normalizeUsagePricing(await apiClient.post<unknown>(`${PRICING_PATH}/refresh`));
  },

  /** Overrides live in config; the pricing payload is re-read so it reflects the saved map. */
  async putOverrides(overrides: Record<string, ModelPriceOverride>): Promise<UsagePricing> {
    await apiClient.put(OVERRIDES_CONFIG_PATH, serializeOverrides(overrides));
    return usageApi.getPricing();
  },
};
