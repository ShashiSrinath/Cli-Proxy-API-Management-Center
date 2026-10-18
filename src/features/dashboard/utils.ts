import type {
  ModelPriceOverride,
  UsageBucket,
  UsageKeyRow,
  UsageModelKeyShare,
  UsageModelRow,
  UsageStats,
} from '@/types/usage';
import { parseTimestampMs } from '@/utils/timestamp';
import type { KeySort, KeySortColumn, UsageMetric } from './types';

/** Pseudo key id for usage recorded without a client API key. */
export const UNATTRIBUTED_KEY_ID = 'unattributed';

/** Keys named inline per model in the models table before the rest collapse into "+N". */
export const TOP_KEYS_PER_MODEL = 3;

export const DEFAULT_KEY_SORT: KeySort = { column: 'cost', direction: 'desc' };

/** Timestamps before this are Go zero values ("0001-01-01…"), not real instants. */
const EARLIEST_REAL_INSTANT_MS = Date.UTC(2000, 0, 1);

/** 供应商展示名。均为专有名词，不进入 i18n。 */
const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Gemini',
  'gemini-interactions': 'Interactions API',
  aistudio: 'AI Studio',
  codex: 'Codex',
  claude: 'Claude',
  devin: 'Devin',
  meta: 'Muse (Meta)',
  xai: 'xAI',
  vertex: 'Vertex AI',
  openai: 'OpenAI Compatible',
  'openai-compatibility': 'OpenAI Compatible',
  qwen: 'Qwen',
  kimi: 'Kimi',
  iflow: 'iFlow',
  antigravity: 'Antigravity',
};

/**
 * 解析供应商展示名；未知 id 首字母大写兜底，`unknown` 交给调用方本地化。
 */
export function providerLabel(id: string, unknownLabel: string): string {
  if (id === 'unknown' || !id) return unknownLabel;
  return PROVIDER_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/* ---------- Axis scale ---------- */

/** 刻度阶梯。比 1/2/5 更细，避免峰值 112 被抬到 200 这种浪费半张图的情况。 */
const STEP_LADDER = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10] as const;

/** 把数值向上取整到易读刻度（阶梯 × 10^n） */
export function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = STEP_LADDER.find((candidate) => normalized <= candidate) ?? 10;
  return step * magnitude;
}

/**
 * 纵轴上限（整数刻度）：用于 token 与请求数。每条网格线都落在整数上。
 */
export function axisMax(peak: number, intervals: number): number {
  if (peak <= 0 || intervals <= 0) return Math.max(1, intervals);
  const step = Math.max(1, Math.ceil(niceCeil(peak / intervals)));
  return step * intervals;
}

/**
 * 纵轴上限（小数刻度）：用于费用，刻度可以是 0.08 这类值。
 */
export function niceAxisMax(peak: number, intervals: number): number {
  if (peak <= 0 || intervals <= 0) return 1;
  return niceCeil(peak / intervals) * intervals;
}

/** 等分刻度值，从上到下（含 0）。 */
export function axisTicks(scaleMax: number, intervals: number): number[] {
  return Array.from({ length: intervals + 1 }, (_, index) =>
    Number(((scaleMax * (intervals - index)) / intervals).toPrecision(12))
  );
}

/** X 轴最多标注的桶数，超过时等距抽样。 */
export function sampledLabelIndexes(count: number, maxLabels = 6): number[] {
  if (count <= 0) return [];
  const step = Math.max(1, Math.ceil(count / maxLabels));
  const indexes: number[] = [];
  for (let index = 0; index < count; index += step) indexes.push(index);
  return indexes;
}

/* ---------- Number, money and time formatting ---------- */

/** Browser's IANA zone, falling back to UTC where Intl cannot report one. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Exact count with locale grouping. Non-finite input renders as zero. */
export function formatCount(value: number, locale?: string): string {
  return Number.isFinite(value) ? value.toLocaleString(locale) : '0';
}

/**
 * Estimated USD. From $1 up: two decimals. Below $1: two significant digits,
 * clamped to four decimals, so $0.0123 keeps its precision and $0.5 reads as $0.500.
 */
export function formatUsd(value: number, locale?: string): string {
  if (!Number.isFinite(value) || value === 0) return '$0.00';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs < 0.0001) return `<${sign}$0.0001`;
  const decimals = abs >= 1 ? 2 : Math.min(4, Math.max(2, 2 - Math.floor(Math.log10(abs))));
  const digits = abs.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${sign}$${digits}`;
}

/** Per-1M-token price: up to four decimals with trailing zeros dropped (3.75, 0.3, 15). */
export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(4).replace(/\.?0+$/, '');
}

/** Part as a percentage of whole. NaN when whole is zero, which formatPercent renders as an em dash. */
export function percentOf(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : Number.NaN;
}

/** Failed records over attempts, the closest derivable failure rate. */
export function failureRate(stats: Pick<UsageStats, 'failed' | 'attempts'>): number {
  return percentOf(stats.failed, stats.attempts);
}

/** Cache-read tokens over input tokens: how much of the prompt was served from cache. */
export function cacheHitRate(stats: Pick<UsageStats, 'cacheReadTokens' | 'inputTokens'>): number {
  return percentOf(stats.cacheReadTokens, stats.inputTokens);
}

/** Whether any traffic (or cost) is recorded. Used to dim idle keys and detect empty ranges. */
export function hasUsage(stats: UsageStats): boolean {
  return (
    stats.requests > 0 ||
    stats.attempts > 0 ||
    stats.inputTokens > 0 ||
    stats.outputTokens > 0 ||
    stats.costUsd > 0
  );
}

/** Epoch ms for a backend timestamp, or null when it is missing, unparseable, or a zero value. */
export function toInstantMs(value: string): number | null {
  const ms = parseTimestampMs(value);
  return Number.isFinite(ms) && ms >= EARLIEST_REAL_INSTANT_MS ? ms : null;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const SHORT_HOUR_OPTIONS: Intl.DateTimeFormatOptions = {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
};
const SHORT_DAY_OPTIONS: Intl.DateTimeFormatOptions = { month: '2-digit', day: '2-digit' };
const LONG_HOUR_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
};
const LONG_DAY_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};

/** Cached per option set, locale and zone: the chart asks for one label per bucket per render. */
function formatterFor(
  options: Intl.DateTimeFormatOptions,
  timeZone: string,
  locale?: string
): Intl.DateTimeFormat {
  const key = `${locale ?? ''}|${timeZone}|${JSON.stringify(options)}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone });
  } catch {
    // Unknown zone or locale tag: fall back to the browser's own defaults rather than failing the chart.
    formatter = new Intl.DateTimeFormat(undefined, options);
  }
  formatterCache.set(key, formatter);
  return formatter;
}

/** Axis label for a bucket start, in the summary's zone. */
export function formatBucketLabel(
  iso: string,
  bucket: UsageBucket,
  timeZone: string,
  locale?: string
): string {
  const ms = toInstantMs(iso);
  if (ms === null) return '';
  const options = bucket === 'hour' ? SHORT_HOUR_OPTIONS : SHORT_DAY_OPTIONS;
  return formatterFor(options, timeZone, locale).format(ms);
}

/** Tooltip heading for a bucket: the full date, plus the hour for hourly buckets. */
export function formatBucketTitle(
  iso: string,
  bucket: UsageBucket,
  timeZone: string,
  locale?: string
): string {
  const ms = toInstantMs(iso);
  if (ms === null) return '';
  const options = bucket === 'hour' ? LONG_HOUR_OPTIONS : LONG_DAY_OPTIONS;
  return formatterFor(options, timeZone, locale).format(ms);
}

/* ---------- Keys ---------- */

/** Primary label: the configured name, else the masked key, else the id. */
export function keyTitle(
  row: Pick<UsageKeyRow, 'id' | 'name' | 'masked'>,
  unattributedLabel: string
): string {
  if (row.id === UNATTRIBUTED_KEY_ID) return unattributedLabel;
  return row.name.trim() || row.masked || row.id;
}

/** Secondary label: the masked key, shown only when a name is already the primary label. */
export function keyMaskedHint(row: Pick<UsageKeyRow, 'id' | 'name' | 'masked'>): string {
  if (row.id === UNATTRIBUTED_KEY_ID || !row.name.trim()) return '';
  return row.masked;
}

export function buildKeyTitles(
  keys: UsageKeyRow[],
  unattributedLabel: string
): Map<string, string> {
  return new Map(keys.map((key) => [key.id, keyTitle(key, unattributedLabel)]));
}

function compareNumbers(a: number, b: number): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function keySortValue(row: UsageKeyRow, column: Exclude<KeySortColumn, 'name'>): number {
  switch (column) {
    case 'requests':
      return row.totals.requests;
    case 'failed':
      return row.totals.failed;
    case 'input':
      return row.totals.inputTokens;
    case 'cached':
      return row.totals.cacheReadTokens;
    case 'output':
      return row.totals.outputTokens;
    case 'cost':
      return row.totals.costUsd;
    case 'lastUsed':
      return toInstantMs(row.lastUsed) ?? Number.NEGATIVE_INFINITY;
  }
}

/**
 * Sorts key rows by the chosen column. Ties fall back to request count (most first),
 * then id, so the order is stable across refreshes.
 */
export function sortKeyRows(
  rows: UsageKeyRow[],
  sort: KeySort,
  unattributedLabel: string
): UsageKeyRow[] {
  const direction = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const primary =
      sort.column === 'name'
        ? keyTitle(a, unattributedLabel).localeCompare(keyTitle(b, unattributedLabel))
        : compareNumbers(keySortValue(a, sort.column), keySortValue(b, sort.column));
    if (primary !== 0) return primary * direction;
    return compareNumbers(b.totals.requests, a.totals.requests) || a.id.localeCompare(b.id);
  });
}

/** Models ordered by cost, then requests, then name. */
export function sortModelRows(rows: UsageModelRow[]): UsageModelRow[] {
  return [...rows].sort(
    (a, b) =>
      compareNumbers(b.totals.costUsd, a.totals.costUsd) ||
      compareNumbers(b.totals.requests, a.totals.requests) ||
      a.provider.localeCompare(b.provider) ||
      a.model.localeCompare(b.model)
  );
}

/** The keys that drove a model's cost, highest first, with the remainder counted. */
export function topKeyShares(
  model: UsageModelRow,
  limit = TOP_KEYS_PER_MODEL
): { shares: UsageModelKeyShare[]; hidden: number } {
  const used = (model.keys ?? [])
    .filter((share) => share.requests > 0 || share.costUsd > 0)
    .sort(
      (a, b) =>
        compareNumbers(b.costUsd, a.costUsd) ||
        compareNumbers(b.requests, a.requests) ||
        a.id.localeCompare(b.id)
    );
  return { shares: used.slice(0, limit), hidden: Math.max(0, used.length - limit) };
}

/* ---------- Chart ---------- */

export type StackKey = 'uncached' | 'cacheRead' | 'cacheWrite' | 'output' | 'requests' | 'cost';

export interface StackSegment {
  key: StackKey;
  value: number;
}

/** Bottom-to-top stack for one bucket. Token segments add up to input plus output. */
export function stackSegments(point: UsageStats, metric: UsageMetric): StackSegment[] {
  switch (metric) {
    case 'tokens':
      return [
        { key: 'uncached', value: point.uncachedInputTokens },
        { key: 'cacheRead', value: point.cacheReadTokens },
        { key: 'cacheWrite', value: point.cacheWriteTokens },
        { key: 'output', value: point.outputTokens },
      ];
    case 'requests':
      return [{ key: 'requests', value: point.requests }];
    case 'cost':
      return [{ key: 'cost', value: point.costUsd }];
  }
}

export function stackTotal(segments: StackSegment[]): number {
  return segments.reduce((sum, segment) => sum + segment.value, 0);
}

/** Tallest stack across buckets, used to size the axis. */
export function seriesPeak(points: UsageStats[], metric: UsageMetric): number {
  return points.reduce(
    (peak, point) => Math.max(peak, stackTotal(stackSegments(point, metric))),
    0
  );
}

/* ---------- Pricing overrides ---------- */

export type OverridePriceField = 'input' | 'output' | 'cacheRead' | 'cacheWrite';

const PRICE_FIELDS: readonly OverridePriceField[] = ['input', 'output', 'cacheRead', 'cacheWrite'];

/** Editable override row. Prices stay as text until validated, so partial input survives re-renders. */
export interface OverrideDraft {
  id: string;
  pattern: string;
  openrouterId: string;
  input: string;
  output: string;
  cacheRead: string;
  cacheWrite: string;
}

export type OverrideIssue =
  | { draftId: string; code: 'patternRequired' }
  | { draftId: string; code: 'duplicatePattern'; pattern: string }
  | { draftId: string; code: 'invalidPrice'; field: OverridePriceField }
  | { draftId: string; code: 'emptyOverride' };

export function emptyOverrideDraft(id: string): OverrideDraft {
  return {
    id,
    pattern: '',
    openrouterId: '',
    input: '',
    output: '',
    cacheRead: '',
    cacheWrite: '',
  };
}

/** Blank is "unset" (ok). Otherwise the text must be a finite number of zero or more. */
export function parsePriceInput(text: string): { ok: true; value?: number } | { ok: false } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true };
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? { ok: true, value } : { ok: false };
}

export function draftsFromOverrides(
  overrides: Record<string, ModelPriceOverride>,
  nextId: () => string
): OverrideDraft[] {
  return Object.keys(overrides)
    .sort()
    .map((pattern) => {
      const override = overrides[pattern] ?? {};
      const text = (value: number | undefined) => (value === undefined ? '' : String(value));
      return {
        id: nextId(),
        pattern,
        openrouterId: override.openrouterId ?? '',
        input: text(override.input),
        output: text(override.output),
        cacheRead: text(override.cacheRead),
        cacheWrite: text(override.cacheWrite),
      };
    });
}

export function validateOverrideDrafts(drafts: OverrideDraft[]): OverrideIssue[] {
  const patternCounts = new Map<string, number>();
  drafts.forEach((draft) => {
    const pattern = draft.pattern.trim();
    if (pattern) patternCounts.set(pattern, (patternCounts.get(pattern) ?? 0) + 1);
  });

  const issues: OverrideIssue[] = [];
  drafts.forEach((draft) => {
    const pattern = draft.pattern.trim();
    if (!pattern) {
      issues.push({ draftId: draft.id, code: 'patternRequired' });
    } else if ((patternCounts.get(pattern) ?? 0) > 1) {
      issues.push({ draftId: draft.id, code: 'duplicatePattern', pattern });
    }

    let setsPrice = false;
    let hasInvalidPrice = false;
    PRICE_FIELDS.forEach((field) => {
      const parsed = parsePriceInput(draft[field]);
      if (!parsed.ok) {
        hasInvalidPrice = true;
        issues.push({ draftId: draft.id, code: 'invalidPrice', field });
      } else if (parsed.value !== undefined) {
        setsPrice = true;
      }
    });

    // A bad price already explains the row; reporting it as empty as well would be noise.
    if (pattern && !hasInvalidPrice && !draft.openrouterId.trim() && !setsPrice) {
      issues.push({ draftId: draft.id, code: 'emptyOverride' });
    }
  });
  return issues;
}

/** Config-shaped override map. Rows without a pattern are skipped; invalid prices are left unset. */
export function buildOverrideMap(drafts: OverrideDraft[]): Record<string, ModelPriceOverride> {
  const overrides: Record<string, ModelPriceOverride> = {};
  drafts.forEach((draft) => {
    const pattern = draft.pattern.trim();
    if (!pattern) return;
    const override: ModelPriceOverride = {};
    const openrouterId = draft.openrouterId.trim();
    if (openrouterId) override.openrouterId = openrouterId;
    PRICE_FIELDS.forEach((field) => {
      const parsed = parsePriceInput(draft[field]);
      if (parsed.ok && parsed.value !== undefined) override[field] = parsed.value;
    });
    overrides[pattern] = override;
  });
  return overrides;
}

/** Order-independent comparison key for an override map. */
export function overridesFingerprint(overrides: Record<string, ModelPriceOverride>): string {
  return JSON.stringify(
    Object.keys(overrides)
      .sort()
      .map((key) => [key, overrides[key]])
  );
}

export function unpricedModelCount(models: UsageModelRow[]): number {
  return models.filter((model) => !model.priced).length;
}
