/**
 * Per-key model allow-lists (access.api-key-models) and USD spend caps
 * (access.api-key-limits). Pure helpers only: parsing, normalizing, remapping, and the
 * mask used to match a configured raw key against the live budget endpoint.
 *
 * Backend semantics (sdk/api/handlers/access_models.go): patterns are `*` globs matched
 * case-insensitively, the thinking suffix is stripped first, and a pattern also matches the
 * model name with any `prefix/` removed. Encoding keeps the user's spelling — only the
 * dedupe key is lowercased.
 */

import type { ApiKeyLimit } from '@/types/visualConfig';

const THINKING_SUFFIX = /-(?:none|low|medium|high|xhigh|max|auto)$/i;

/** Trimmed, de-duplicated (case-insensitive) patterns; empty entries dropped. */
export function normalizeApiKeyModelList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const patterns: string[] = [];
  for (const item of raw) {
    const pattern = String(item ?? '').trim();
    const key = pattern.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    patterns.push(pattern);
  }
  return patterns;
}

/** Comma / newline separated editor text to patterns. */
export function parseApiKeyModelPatterns(text: string): string[] {
  return normalizeApiKeyModelList(text.split(/[\n,]/));
}

export function formatApiKeyModelPatterns(patterns: readonly string[]): string {
  return patterns.join(', ');
}

/**
 * Backend-compatible match: strip the thinking suffix, lowercase, then compare against each
 * pattern and against the name with any `prefix/` removed. Invalid patterns never match.
 */
export function matchesApiKeyModel(patterns: readonly string[], model: string): boolean {
  if (patterns.length === 0) return false;
  const name = String(model ?? '')
    .trim()
    .replace(THINKING_SUFFIX, '')
    .toLowerCase();
  if (!name) return false;
  const bare = name.includes('/') ? (name.split('/').pop() ?? name) : name;
  return patterns.some((pattern) => {
    const glob = globToRegExp(pattern);
    return glob !== null && (glob.test(name) || glob.test(bare));
  });
}

/** `*` matches any run of characters; everything else is literal. Invalid globs return null. */
function globToRegExp(pattern: string): RegExp | null {
  const normalized = String(pattern ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  const source = normalized
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  try {
    return new RegExp(`^${source}$`);
  } catch {
    return null;
  }
}

/**
 * Model ids offered as suggestions in the allow-list editor: openai-compatibility aliases
 * first (the client-visible names), then the discovered model ids, without duplicates.
 */
export function buildApiKeyModelSuggestions(
  compatProviders: Array<{ models?: Array<{ name: string; alias?: string }> }> = [],
  modelIds: Iterable<string> = []
): string[] {
  const seen = new Set<string>();
  const suggestions: string[] = [];
  const add = (value: unknown) => {
    const id = typeof value === 'string' ? value.trim() : '';
    if (!id || seen.has(id)) return;
    seen.add(id);
    suggestions.push(id);
  };
  compatProviders.forEach((provider) =>
    (provider.models ?? []).forEach((model) => add(model.alias || model.name))
  );
  for (const id of modelIds) add(id);
  return suggestions;
}

/** Reads access.api-key-models, dropping keys without a usable pattern list. */
export function parseApiKeyModels(raw: unknown): Record<string, string[]> {
  const record = asRecord(raw);
  if (!record) return {};
  const result: Record<string, string[]> = {};
  Object.entries(record).forEach(([key, value]) => {
    const apiKey = key.trim();
    const patterns = normalizeApiKeyModelList(value);
    if (apiKey && patterns.length > 0) result[apiKey] = patterns;
  });
  return result;
}

const positiveAmount = (value: unknown): number | undefined => {
  const amount = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (String(value ?? '').trim() === '') return undefined;
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return amount;
};

/** Reads access.api-key-limits, dropping keys with no positive cap and no timezone. */
export function parseApiKeyLimits(raw: unknown): Record<string, ApiKeyLimit> {
  const record = asRecord(raw);
  if (!record) return {};
  const result: Record<string, ApiKeyLimit> = {};
  Object.entries(record).forEach(([key, value]) => {
    const apiKey = key.trim();
    const limit = normalizeApiKeyLimit(value);
    if (apiKey && limit) result[apiKey] = limit;
  });
  return result;
}

/** Kebab-case YAML fields to the camelCase draft shape; unusable entries read as no cap. */
export function normalizeApiKeyLimit(raw: unknown): ApiKeyLimit | null {
  const record = asRecord(raw);
  if (!record) return null;
  const limit: ApiKeyLimit = {};
  const daily = positiveAmount(record['daily-usd']);
  const weekly = positiveAmount(record['weekly-usd']);
  const monthly = positiveAmount(record['monthly-usd']);
  const timezone = typeof record.timezone === 'string' ? record.timezone.trim() : '';
  if (daily !== undefined) limit.dailyUsd = daily;
  if (weekly !== undefined) limit.weeklyUsd = weekly;
  if (monthly !== undefined) limit.monthlyUsd = monthly;
  if (timezone) limit.timezone = timezone;
  return Object.keys(limit).length > 0 ? limit : null;
}

/** CamelCase draft back to the kebab-case YAML map entry, omitting unset fields. */
export function serializeApiKeyLimit(limit: ApiKeyLimit | undefined): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (!limit) return body;
  const daily = positiveAmount(limit.dailyUsd);
  const weekly = positiveAmount(limit.weeklyUsd);
  const monthly = positiveAmount(limit.monthlyUsd);
  const timezone = typeof limit.timezone === 'string' ? limit.timezone.trim() : '';
  if (daily !== undefined) body['daily-usd'] = daily;
  if (weekly !== undefined) body['weekly-usd'] = weekly;
  if (monthly !== undefined) body['monthly-usd'] = monthly;
  if (timezone) body.timezone = timezone;
  return body;
}

export function hasApiKeyLimit(limit: ApiKeyLimit | undefined): boolean {
  return Object.keys(serializeApiKeyLimit(limit)).length > 0;
}

/** One caps row as editor text; an empty amount field means "no cap" for that window. */
export type ApiKeyLimitDraft = {
  daily: string;
  weekly: string;
  monthly: string;
  timezone: string;
};

export const EMPTY_API_KEY_LIMIT_DRAFT: ApiKeyLimitDraft = {
  daily: '',
  weekly: '',
  monthly: '',
  timezone: '',
};

export function apiKeyLimitDraft(limit: ApiKeyLimit | undefined): ApiKeyLimitDraft {
  if (!limit) return { ...EMPTY_API_KEY_LIMIT_DRAFT };
  const amount = (value: number | undefined) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? String(value) : '';
  return {
    daily: amount(limit.dailyUsd),
    weekly: amount(limit.weeklyUsd),
    monthly: amount(limit.monthlyUsd),
    timezone: limit.timezone ?? '',
  };
}

/**
 * Editor text back to a cap set. A timezone only matters next to a cap, so a row without any
 * amount yields null (uncapped) instead of persisting a limits entry with no windows.
 */
export function apiKeyLimitFromDraft(draft: ApiKeyLimitDraft): ApiKeyLimit | null {
  const raw: Record<string, unknown> = {};
  const amount = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const daily = amount(draft.daily);
  const weekly = amount(draft.weekly);
  const monthly = amount(draft.monthly);
  if (daily !== undefined) raw['daily-usd'] = daily;
  if (weekly !== undefined) raw['weekly-usd'] = weekly;
  if (monthly !== undefined) raw['monthly-usd'] = monthly;
  if (Object.keys(raw).length === 0) return null;
  if (draft.timezone.trim()) raw.timezone = draft.timezone.trim();
  return normalizeApiKeyLimit(raw);
}

/** Negative or non-numeric cap text is a validation error, not a value. */
export function isApiKeyLimitAmountInvalid(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const parsed = Number(trimmed);
  return !Number.isFinite(parsed) || parsed < 0;
}

/** IANA zone check matching the backend's time.LoadLocation for the common cases. */
export function isApiKeyTimeZoneInvalid(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^[+-]/.test(trimmed)) return true;
  try {
    new Intl.DateTimeFormat('en', { timeZone: trimmed });
    return false;
  } catch {
    return true;
  }
}

/** True when the two cap sets describe the same restrictions (order-insensitive). */
export function areApiKeyLimitsEqual(
  left: Record<string, ApiKeyLimit>,
  right: Record<string, ApiKeyLimit>
): boolean {
  const leftKeys = Object.keys(left).filter((key) => hasApiKeyLimit(left[key]));
  const rightKeys = Object.keys(right).filter((key) => hasApiKeyLimit(right[key]));
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(right, key) &&
      JSON.stringify(serializeApiKeyLimit(left[key])) ===
        JSON.stringify(serializeApiKeyLimit(right[key]))
  );
}

/**
 * True when the two model allow-lists describe the same restrictions. Patterns are
 * case-insensitive on the backend, so spelling and order do not count as a change.
 */
export function areApiKeyModelsEqual(
  left: Record<string, string[]>,
  right: Record<string, string[]>
): boolean {
  const leftKeys = Object.keys(left).filter((key) => left[key]?.length > 0);
  const rightKeys = Object.keys(right).filter((key) => right[key]?.length > 0);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => {
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
    const canonical = (patterns: string[]) =>
      JSON.stringify(
        normalizeApiKeyModelList(patterns)
          .map((pattern) => pattern.toLowerCase())
          .sort()
      );
    return canonical(left[key]) === canonical(right[key]);
  });
}

/**
 * Moves or removes a key's entry after the key itself was renamed or deleted. Mirrors
 * `remapApiKeyProviders`, but keeps the previous value when no replacement is supplied.
 */
export function remapApiKeyEntries<T>(
  current: Record<string, T>,
  previousKey: string | null,
  nextKey: string | null,
  next?: T
): Record<string, T> {
  const result = { ...current };
  if (previousKey !== null) delete result[previousKey];
  if (nextKey === null) return result;
  const value = next !== undefined ? next : previousKey !== null ? current[previousKey] : undefined;
  if (value !== undefined) result[nextKey] = value;
  return result;
}

/**
 * The mask the backend reports for a raw key (`usagestats.maskKey`): first 4 + "…" + last 4,
 * or first 2 + "…" when the key is 10 characters or shorter. Empty keys have no mask.
 */
export function apiKeyMask(raw: string): string {
  const key = String(raw ?? '').trim();
  if (!key) return '';
  const chars = Array.from(key);
  if (chars.length <= 10) return `${chars.slice(0, Math.min(2, chars.length)).join('')}…`;
  return `${chars.slice(0, 4).join('')}…${chars.slice(-4).join('')}`;
}

/**
 * Maps raw configured keys to their budget row by mask. Ambiguous masks (two keys sharing the
 * same mask) are dropped entirely, so a meter can never be attributed to the wrong key.
 */
export function indexBudgetsByApiKeyMask<T extends { masked: string }>(
  keys: readonly string[],
  rows: readonly T[]
): Map<string, T> {
  const byMask = new Map<string, T>();
  rows.forEach((row) => {
    const mask = row.masked.trim();
    if (!mask || byMask.has(mask)) {
      if (mask) byMask.delete(mask);
      return;
    }
    byMask.set(mask, row);
  });

  const occurrences = new Map<string, number>();
  keys.forEach((key) => {
    const mask = apiKeyMask(key);
    if (!mask) return;
    occurrences.set(mask, (occurrences.get(mask) ?? 0) + 1);
  });

  const result = new Map<string, T>();
  keys.forEach((key) => {
    const mask = apiKeyMask(key);
    if (!mask || (occurrences.get(mask) ?? 0) > 1) return;
    const row = byMask.get(mask);
    if (row) result.set(key, row);
  });
  return result;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
