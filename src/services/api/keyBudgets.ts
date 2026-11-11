/**
 * Key budget API (v8 /observability/usage/key-budgets). Backend JSON is snake_case; the
 * normalizer converts it to the camelCase shapes in src/types/keyBudgets.ts and tolerates
 * partial or malformed payloads so the UI never reads raw backend fields.
 */

import type {
  BudgetPeriod,
  KeyBudgetLimits,
  KeyBudgetRow,
  KeyBudgetWindow,
  KeyBudgets,
} from '@/types/keyBudgets';
import { isRecord } from '@/utils/helpers';
import { normalizeUsageTotal } from '@/utils/recentRequests';
import { apiClient } from './client';

const KEY_BUDGETS_PATH = '/observability/usage/key-budgets';
const KEY_BUDGETS_TIMEOUT_MS = 15 * 1000;
const PERIODS: readonly BudgetPeriod[] = ['day', 'week', 'month'];

type RawRecord = Record<string, unknown>;

const recordOf = (value: unknown): RawRecord => (isRecord(value) ? value : {});
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');
const flagOf = (value: unknown): boolean => value === true;
const countOf = (value: unknown): number => normalizeUsageTotal(value);

/** A zero or unreadable cap means "no cap", matching the backend's `0 = no cap`. */
const positiveNumberOf = (value: unknown): number | undefined => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const stringListOf = (value: unknown): string[] =>
  listOf(value).flatMap((item) => {
    const text = textOf(item).trim();
    return text ? [text] : [];
  });

function normalizeWindow(raw: unknown): KeyBudgetWindow | null {
  const record = recordOf(raw);
  const period = PERIODS.find((candidate) => candidate === record.period);
  const limitUsd = positiveNumberOf(record.limit_usd);
  if (!period || limitUsd === undefined) return null;
  return {
    period,
    limitUsd,
    spentUsd: countOf(record.spent_usd),
    start: textOf(record.start),
    resetsAt: textOf(record.resets_at),
    exceeded: flagOf(record.exceeded),
  };
}

/** Only windows with a positive limit are kept, in backend order, without duplicates. */
function normalizeWindows(raw: unknown): KeyBudgetWindow[] {
  const seen = new Set<BudgetPeriod>();
  const windows: KeyBudgetWindow[] = [];
  for (const entry of listOf(raw)) {
    const window = normalizeWindow(entry);
    if (!window || seen.has(window.period)) continue;
    seen.add(window.period);
    windows.push(window);
  }
  return windows;
}

/** `null` when the key has no caps; unreadable or non-positive amounts are dropped. */
export function normalizeKeyBudgetLimits(raw: unknown): KeyBudgetLimits | null {
  if (!isRecord(raw)) return null;
  const limits: KeyBudgetLimits = {};
  const daily = positiveNumberOf(raw['daily-usd']);
  const weekly = positiveNumberOf(raw['weekly-usd']);
  const monthly = positiveNumberOf(raw['monthly-usd']);
  const timezone = textOf(raw.timezone).trim();
  if (daily !== undefined) limits.dailyUsd = daily;
  if (weekly !== undefined) limits.weeklyUsd = weekly;
  if (monthly !== undefined) limits.monthlyUsd = monthly;
  if (timezone) limits.timezone = timezone;
  return Object.keys(limits).length > 0 ? limits : null;
}

function normalizeKeyRow(raw: unknown): KeyBudgetRow | null {
  const record = recordOf(raw);
  const id = textOf(record.id).trim();
  const masked = textOf(record.masked).trim();
  if (!id && !masked) return null;
  const windows = normalizeWindows(record.windows);
  return {
    id,
    masked,
    name: textOf(record.name),
    models: stringListOf(record.models),
    providers: stringListOf(record.providers),
    limits: normalizeKeyBudgetLimits(record.limits),
    windows,
    exceeded: flagOf(record.exceeded) || windows.some((window) => window.exceeded),
  };
}

/** Accepts any payload; missing or malformed fields become zeros, empty strings, or empty lists. */
export function normalizeKeyBudgets(raw: unknown): KeyBudgets {
  const record = recordOf(raw);
  return {
    enabled: flagOf(record.enabled),
    generatedAt: textOf(record.generated_at),
    keys: listOf(record.keys).flatMap((entry) => {
      const row = normalizeKeyRow(entry);
      return row ? [row] : [];
    }),
  };
}

export const keyBudgetsApi = {
  async get(): Promise<KeyBudgets> {
    const data = await apiClient.get<unknown>(KEY_BUDGETS_PATH, {
      timeout: KEY_BUDGETS_TIMEOUT_MS,
    });
    return normalizeKeyBudgets(data);
  },
};
