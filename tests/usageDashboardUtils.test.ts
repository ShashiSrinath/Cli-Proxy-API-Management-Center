import { describe, expect, test } from 'bun:test';
import type { UsageKeyRow, UsageModelRow, UsageStats } from '../src/types/usage';
import { formatCompactNumber, formatPercent } from '../src/utils/format';
import {
  axisMax,
  axisTicks,
  buildOverrideMap,
  cacheHitRate,
  draftsFromOverrides,
  failureRate,
  formatBucketLabel,
  formatBucketTitle,
  formatPrice,
  formatUsd,
  hasUsage,
  keyMaskedHint,
  keyTitle,
  niceAxisMax,
  niceCeil,
  overridesFingerprint,
  parsePriceInput,
  percentOf,
  providerLabel,
  sampledLabelIndexes,
  seriesPeak,
  sortKeyRows,
  sortModelRows,
  stackSegments,
  toInstantMs,
  topKeyShares,
  validateOverrideDrafts,
  type OverrideDraft,
} from '../src/features/dashboard/utils';
import en from '../src/i18n/locales/en.json';
import ru from '../src/i18n/locales/ru.json';
import zhCN from '../src/i18n/locales/zh-CN.json';
import zhTW from '../src/i18n/locales/zh-TW.json';

const stats = (overrides: Partial<UsageStats> = {}): UsageStats => ({
  requests: 0,
  attempts: 0,
  failed: 0,
  inputTokens: 0,
  uncachedInputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  costUsd: 0,
  avgLatencyMs: 0,
  ...overrides,
});

const keyRow = (overrides: Partial<UsageKeyRow> & Pick<UsageKeyRow, 'id'>): UsageKeyRow => ({
  name: '',
  masked: '',
  configured: true,
  providers: [],
  firstSeen: '2026-10-01T00:00:00Z',
  lastUsed: '',
  totals: stats(),
  series: [],
  models: [],
  ...overrides,
});

const modelRow = (
  model: string,
  totals: Partial<UsageStats>,
  extra: Partial<UsageModelRow> = {}
): UsageModelRow => ({
  provider: 'claude',
  model,
  totals: stats(totals),
  priced: true,
  price: { source: 'openrouter', matchedId: '', input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  ...extra,
});

describe('formatCompactNumber', () => {
  test('leaves values below one thousand alone', () => {
    expect(formatCompactNumber(0)).toBe('0');
    expect(formatCompactNumber(999)).toBe('999');
  });

  test('compacts with a single decimal and no redundant .0', () => {
    expect(formatCompactNumber(1000)).toBe('1K');
    expect(formatCompactNumber(1284)).toBe('1.3K');
    expect(formatCompactNumber(12_900)).toBe('12.9K');
    expect(formatCompactNumber(1_500_000)).toBe('1.5M');
  });

  test('carries into the next tier instead of rendering 1000K', () => {
    expect(formatCompactNumber(999_999)).toBe('1M');
    expect(formatCompactNumber(999_999_999)).toBe('1B');
  });
});

describe('formatPercent', () => {
  test('trims trailing zeros but keeps meaningful decimals', () => {
    expect(formatPercent(100)).toBe('100%');
    expect(formatPercent(99.5)).toBe('99.5%');
    expect(formatPercent(0)).toBe('0%');
  });

  test('renders an em dash for non-finite rates', () => {
    expect(formatPercent(Number.NaN)).toBe('—');
  });
});

describe('axis scale', () => {
  test('niceCeil rounds up onto the step ladder and never returns zero', () => {
    expect(niceCeil(7)).toBe(8);
    expect(niceCeil(12)).toBe(15);
    expect(niceCeil(320)).toBe(400);
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(-5)).toBe(1);
  });

  test('axisMax lands every gridline on a whole number', () => {
    // 峰值 112 → 上限 120（刻度 0/30/60/90/120），而不是浪费半张图的 200
    expect(axisMax(112, 4)).toBe(120);
    expect(axisMax(7, 4)).toBe(8);
    expect(axisMax(1533, 4)).toBe(1600);
    for (const peak of [1, 3, 9, 17, 64, 112, 250, 999, 4321]) {
      const max = axisMax(peak, 4);
      expect(max).toBeGreaterThanOrEqual(peak);
      expect(max).toBeLessThanOrEqual(Math.max(4, peak * 2));
      expect(Number.isInteger(max / 4)).toBe(true);
    }
    expect(axisMax(0, 4)).toBe(4);
    expect(axisMax(-3, 4)).toBe(4);
  });

  test('niceAxisMax keeps fractional cost peaks above the peak', () => {
    expect(niceAxisMax(0.3, 4)).toBeCloseTo(0.32, 10);
    expect(niceAxisMax(0.0123, 4)).toBeGreaterThanOrEqual(0.0123);
    expect(niceAxisMax(0, 4)).toBe(1);
  });

  test('axisTicks runs from the top down to zero', () => {
    expect(axisTicks(120, 4)).toEqual([120, 90, 60, 30, 0]);
    expect(axisTicks(0.32, 4)).toEqual([0.32, 0.24, 0.16, 0.08, 0]);
  });

  test('sampledLabelIndexes spreads at most the requested number of labels', () => {
    expect(sampledLabelIndexes(24, 6)).toEqual([0, 4, 8, 12, 16, 20]);
    expect(sampledLabelIndexes(3, 6)).toEqual([0, 1, 2]);
    expect(sampledLabelIndexes(0)).toEqual([]);
  });
});

describe('providerLabel', () => {
  test('uses the brand spelling for known providers', () => {
    expect(providerLabel('xai', 'Unattributed')).toBe('xAI');
    expect(providerLabel('aistudio', 'Unattributed')).toBe('AI Studio');
    expect(providerLabel('gemini-interactions', 'Unattributed')).toBe('Interactions API');
  });

  test('falls back to a capitalised id, and localises unknown', () => {
    expect(providerLabel('somenewbrand', 'Unattributed')).toBe('Somenewbrand');
    expect(providerLabel('unknown', 'Unattributed')).toBe('Unattributed');
    expect(providerLabel('', 'Unattributed')).toBe('Unattributed');
  });
});

describe('formatUsd', () => {
  test('uses two decimals from one dollar up, with grouping', () => {
    expect(formatUsd(1234.5, 'en-US')).toBe('$1,234.50');
    expect(formatUsd(1, 'en-US')).toBe('$1.00');
  });

  test('keeps two to four significant decimals below one dollar', () => {
    expect(formatUsd(0.5, 'en-US')).toBe('$0.500');
    expect(formatUsd(0.123, 'en-US')).toBe('$0.123');
    expect(formatUsd(0.0123, 'en-US')).toBe('$0.0123');
    expect(formatUsd(0.00999, 'en-US')).toBe('$0.0100');
    expect(formatUsd(0.0005, 'en-US')).toBe('$0.0005');
  });

  test('marks amounts below the display floor and zero/invalid input', () => {
    expect(formatUsd(0.00005, 'en-US')).toBe('<$0.0001');
    expect(formatUsd(0.0001, 'en-US')).toBe('$0.0001');
    expect(formatUsd(0, 'en-US')).toBe('$0.00');
    expect(formatUsd(Number.NaN, 'en-US')).toBe('$0.00');
  });
});

describe('formatPrice', () => {
  test('drops trailing zeros from per-million prices', () => {
    expect(formatPrice(3)).toBe('3');
    expect(formatPrice(3.75)).toBe('3.75');
    expect(formatPrice(0.3)).toBe('0.3');
    expect(formatPrice(0)).toBe('0');
    expect(formatPrice(0.0001)).toBe('0.0001');
    expect(formatPrice(Number.NaN)).toBe('—');
  });
});

describe('rates', () => {
  test('percentOf is NaN for an empty denominator so it renders as a dash', () => {
    expect(percentOf(1, 4)).toBe(25);
    expect(Number.isNaN(percentOf(1, 0))).toBe(true);
  });

  test('cache hit rate is cache reads over input tokens', () => {
    expect(cacheHitRate(stats({ cacheReadTokens: 300, inputTokens: 1200 }))).toBe(25);
    expect(Number.isNaN(cacheHitRate(stats()))).toBe(true);
  });

  test('failure rate is failed records over attempts', () => {
    expect(failureRate(stats({ failed: 1, attempts: 4 }))).toBe(25);
    expect(Number.isNaN(failureRate(stats()))).toBe(true);
  });

  test('hasUsage is false only when nothing was recorded', () => {
    expect(hasUsage(stats())).toBe(false);
    expect(hasUsage(stats({ outputTokens: 1 }))).toBe(true);
    expect(hasUsage(stats({ costUsd: 0.01 }))).toBe(true);
  });
});

describe('time formatting', () => {
  test('toInstantMs rejects blanks, garbage and Go zero times', () => {
    expect(toInstantMs('')).toBeNull();
    expect(toInstantMs('not a date')).toBeNull();
    expect(toInstantMs('0001-01-01T00:00:00Z')).toBeNull();
    expect(toInstantMs('2026-10-18T14:00:00Z')).toBe(Date.UTC(2026, 9, 18, 14));
  });

  test('bucket labels are formatted in the requested zone', () => {
    expect(formatBucketLabel('2026-10-18T14:00:00Z', 'hour', 'UTC', 'en-US')).toContain('14:00');
    expect(formatBucketLabel('2026-10-18T14:00:00Z', 'hour', 'Asia/Kolkata', 'en-US')).toContain(
      '19:30'
    );
    expect(formatBucketLabel('2026-10-18T14:00:00Z', 'day', 'UTC', 'en-US')).toBe('10/18');
  });

  test('bucket labels survive an unknown zone and an empty timestamp', () => {
    expect(formatBucketLabel('2026-10-18T14:00:00Z', 'day', 'Not/AZone', 'en-US')).not.toBe('');
    expect(formatBucketLabel('', 'hour', 'UTC', 'en-US')).toBe('');
  });

  test('bucket titles carry the year and the hour for hourly buckets', () => {
    const title = formatBucketTitle('2026-10-18T14:00:00Z', 'hour', 'UTC', 'en-US');
    expect(title).toContain('2026');
    expect(title).toContain('14:00');
  });
});

describe('key labels', () => {
  test('prefers the configured name, then the masked key, then the id', () => {
    expect(keyTitle({ id: 'k_1', name: 'Laptop', masked: 'sk-a…wxyz' }, 'No API key')).toBe(
      'Laptop'
    );
    expect(keyTitle({ id: 'k_1', name: ' ', masked: 'sk-a…wxyz' }, 'No API key')).toBe('sk-a…wxyz');
    expect(keyTitle({ id: 'k_1', name: '', masked: '' }, 'No API key')).toBe('k_1');
  });

  test('labels the unattributed pseudo key and never shows a mask for it', () => {
    const row = { id: 'unattributed', name: '', masked: '' };
    expect(keyTitle(row, 'No API key')).toBe('No API key');
    expect(keyMaskedHint(row)).toBe('');
  });

  test('shows the mask as a hint only beside a name', () => {
    expect(keyMaskedHint({ id: 'k_1', name: 'CI', masked: 'sk-d…wxyz' })).toBe('sk-d…wxyz');
    expect(keyMaskedHint({ id: 'k_2', name: '', masked: 'sk-e…wxyz' })).toBe('');
  });
});

describe('sortKeyRows', () => {
  const rows = [
    keyRow({ id: 'k_a', name: 'Alpha', totals: stats({ costUsd: 1, requests: 5 }) }),
    keyRow({ id: 'k_b', name: 'Bravo', totals: stats({ costUsd: 3, requests: 2 }) }),
    keyRow({ id: 'k_c', name: 'Charlie', totals: stats({ costUsd: 3, requests: 9 }) }),
    keyRow({ id: 'unattributed', totals: stats({ costUsd: 0.5, requests: 1 }), configured: false }),
  ];

  test('defaults to cost descending, with request count breaking ties', () => {
    const order = sortKeyRows(rows, { column: 'cost', direction: 'desc' }, 'No API key').map(
      (row) => row.id
    );
    expect(order).toEqual(['k_c', 'k_b', 'k_a', 'unattributed']);
  });

  test('sorts names alphabetically by their display label', () => {
    const order = sortKeyRows(rows, { column: 'name', direction: 'asc' }, 'No API key').map(
      (row) => row.id
    );
    expect(order).toEqual(['k_a', 'k_b', 'k_c', 'unattributed']);
  });

  test('puts never-used keys last when sorting by last use, descending', () => {
    const withUse = rows.map((row) =>
      row.id === 'k_a' ? { ...row, lastUsed: '2026-10-18T10:00:00Z' } : row
    );
    const order = sortKeyRows(withUse, { column: 'lastUsed', direction: 'desc' }, 'No API key');
    expect(order[0]?.id).toBe('k_a');
    expect(order.at(-1)?.lastUsed).toBe('');
  });

  test('does not mutate the input', () => {
    const before = rows.map((row) => row.id);
    sortKeyRows(rows, { column: 'requests', direction: 'asc' }, 'No API key');
    expect(rows.map((row) => row.id)).toEqual(before);
  });
});

describe('model rows', () => {
  test('sortModelRows orders by cost, then requests', () => {
    const sorted = sortModelRows([
      modelRow('small', { costUsd: 0.1, requests: 10 }),
      modelRow('big', { costUsd: 4, requests: 1 }),
      modelRow('free', { costUsd: 0, requests: 99 }),
    ]);
    expect(sorted.map((row) => row.model)).toEqual(['big', 'small', 'free']);
  });

  test('topKeyShares returns the three costliest keys and counts the rest', () => {
    const model = modelRow(
      'm',
      { costUsd: 10, requests: 10 },
      {
        keys: [
          { id: 'k_1', requests: 1, costUsd: 1 },
          { id: 'k_2', requests: 1, costUsd: 4 },
          { id: 'k_3', requests: 1, costUsd: 3 },
          { id: 'k_4', requests: 1, costUsd: 2 },
          { id: 'k_5', requests: 0, costUsd: 0 },
        ],
      }
    );
    const { shares, hidden } = topKeyShares(model);
    expect(shares.map((share) => share.id)).toEqual(['k_2', 'k_3', 'k_4']);
    expect(hidden).toBe(1);
  });

  test('topKeyShares tolerates rows without per-key shares', () => {
    expect(topKeyShares(modelRow('m', {}))).toEqual({ shares: [], hidden: 0 });
  });
});

describe('chart stacks', () => {
  const point = stats({
    requests: 4,
    failed: 1,
    inputTokens: 1000,
    uncachedInputTokens: 600,
    cacheReadTokens: 300,
    cacheWriteTokens: 100,
    outputTokens: 250,
    costUsd: 0.02,
  });

  test('token stacks add up to input plus output tokens', () => {
    const total = stackSegments(point, 'tokens').reduce((sum, segment) => sum + segment.value, 0);
    expect(total).toBe(point.inputTokens + point.outputTokens);
    expect(stackSegments(point, 'tokens').map((segment) => segment.key)).toEqual([
      'uncached',
      'cacheRead',
      'cacheWrite',
      'output',
    ]);
  });

  test('request and cost metrics are single segments', () => {
    expect(stackSegments(point, 'requests')).toEqual([{ key: 'requests', value: 4 }]);
    expect(stackSegments(point, 'cost')).toEqual([{ key: 'cost', value: 0.02 }]);
  });

  test('seriesPeak is the tallest stack under the chosen metric', () => {
    const series = [stats({ requests: 2 }), point, stats({ requests: 3 })];
    expect(seriesPeak(series, 'requests')).toBe(4);
    expect(seriesPeak(series, 'tokens')).toBe(1250);
    expect(seriesPeak([], 'cost')).toBe(0);
  });
});

describe('pricing overrides', () => {
  const draft = (overrides: Partial<OverrideDraft> & Pick<OverrideDraft, 'id'>): OverrideDraft => ({
    pattern: '',
    openrouterId: '',
    input: '',
    output: '',
    cacheRead: '',
    cacheWrite: '',
    ...overrides,
  });

  test('parsePriceInput treats blanks as unset and rejects negatives and words', () => {
    expect(parsePriceInput('')).toEqual({ ok: true });
    expect(parsePriceInput('  ')).toEqual({ ok: true });
    expect(parsePriceInput('0')).toEqual({ ok: true, value: 0 });
    expect(parsePriceInput(' 1.5 ')).toEqual({ ok: true, value: 1.5 });
    expect(parsePriceInput('-1')).toEqual({ ok: false });
    expect(parsePriceInput('abc')).toEqual({ ok: false });
    expect(parsePriceInput('Infinity')).toEqual({ ok: false });
  });

  test('drafts load sorted by pattern with prices stringified', () => {
    let counter = 0;
    const drafts = draftsFromOverrides(
      {
        'zeta*': { input: 2 },
        'alpha*': { openrouterId: 'anthropic/claude-opus-4.1', cacheRead: 0 },
      },
      () => `d${++counter}`
    );
    expect(drafts.map((row) => row.pattern)).toEqual(['alpha*', 'zeta*']);
    expect(drafts[0]).toEqual({
      id: 'd1',
      pattern: 'alpha*',
      openrouterId: 'anthropic/claude-opus-4.1',
      input: '',
      output: '',
      cacheRead: '0',
      cacheWrite: '',
    });
  });

  test('validation reports blank and duplicate patterns, bad prices and empty overrides', () => {
    const issues = validateOverrideDrafts([
      draft({ id: 'a' }),
      draft({ id: 'b', pattern: 'dup', input: '1' }),
      draft({ id: 'c', pattern: 'dup', output: '2' }),
      draft({ id: 'd', pattern: 'bad', input: '-3' }),
      draft({ id: 'e', pattern: 'lonely' }),
      draft({ id: 'f', pattern: 'mapped', openrouterId: 'x/y' }),
    ]);
    expect(issues).toEqual([
      { draftId: 'a', code: 'patternRequired' },
      { draftId: 'b', code: 'duplicatePattern', pattern: 'dup' },
      { draftId: 'c', code: 'duplicatePattern', pattern: 'dup' },
      { draftId: 'd', code: 'invalidPrice', field: 'input' },
      { draftId: 'e', code: 'emptyOverride' },
    ]);
  });

  test('a zero price counts as set, so a free model is a valid override', () => {
    expect(
      validateOverrideDrafts([
        draft({ id: 'z', pattern: 'my-local-model', input: '0', output: '0' }),
      ])
    ).toEqual([]);
  });

  test('buildOverrideMap drops blank rows and blank prices but keeps zeros', () => {
    const map = buildOverrideMap([
      draft({
        id: 'a',
        pattern: '  claude-opus-4-1*  ',
        openrouterId: ' anthropic/claude-opus-4.1 ',
      }),
      draft({ id: 'b', pattern: 'my-local-model', input: '0', output: '0', cacheWrite: '' }),
      draft({ id: 'c', pattern: '', input: '9' }),
      draft({
        id: 'd',
        pattern: 'full',
        input: '1.5',
        output: '2',
        cacheRead: '0.25',
        cacheWrite: '3',
      }),
    ]);
    expect(map).toEqual({
      'claude-opus-4-1*': { openrouterId: 'anthropic/claude-opus-4.1' },
      'my-local-model': { input: 0, output: 0 },
      full: { input: 1.5, output: 2, cacheRead: 0.25, cacheWrite: 3 },
    });
  });

  test('fingerprints ignore key order but notice real changes', () => {
    const a = { x: { input: 1 }, y: { output: 2 } };
    const b = { y: { output: 2 }, x: { input: 1 } };
    expect(overridesFingerprint(a)).toBe(overridesFingerprint(b));
    expect(overridesFingerprint(a)).not.toBe(overridesFingerprint({ ...a, x: { input: 2 } }));
  });
});

type LocaleTree = { [key: string]: LocaleTree | string };

/** Dotted leaf path to text, so locales can be compared key by key. */
function flattenLocale(tree: LocaleTree, prefix = ''): Map<string, string> {
  const leaves = new Map<string, string>();
  Object.entries(tree).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      leaves.set(path, value);
    } else {
      flattenLocale(value, path).forEach((text, leaf) => leaves.set(leaf, text));
    }
  });
  return leaves;
}

const placeholdersOf = (text: string): string[] =>
  [...new Set([...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1]))].sort();

describe('usageDashboard locale contract', () => {
  const base = flattenLocale(en.usageDashboard as LocaleTree);
  const others: Array<[string, unknown]> = [
    ['zh-CN', zhCN],
    ['zh-TW', zhTW],
    ['ru', ru],
  ];

  test('en defines the namespace and no longer carries the old dashboard namespace', () => {
    expect(base.size).toBeGreaterThan(0);
    expect(Object.keys(en)).not.toContain('dashboard');
  });

  test('the disabled-state copy matches the spec text exactly', () => {
    expect(base.get('states.disabledDescription')).toBe(
      'Usage tracking is disabled in config: observability.usage.tracking.disabled'
    );
  });

  for (const [name, locale] of others) {
    test(`${name} has exactly the keys defined in en`, () => {
      const keys = flattenLocale((locale as { usageDashboard: LocaleTree }).usageDashboard);
      expect([...keys.keys()].sort()).toEqual([...base.keys()].sort());
    });

    test(`${name} keeps the same placeholders as en for every key`, () => {
      const keys = flattenLocale((locale as { usageDashboard: LocaleTree }).usageDashboard);
      for (const [key, text] of base) {
        expect({ key, placeholders: placeholdersOf(keys.get(key) ?? '') }).toEqual({
          key,
          placeholders: placeholdersOf(text),
        });
      }
    });
  }
});
