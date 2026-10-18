import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { apiClient } from '@/services/api/client';
import { normalizeUsagePricing, normalizeUsageSummary, usageApi } from '@/services/api/usage';

const spies: Array<{ mockRestore(): void }> = [];
const mock = (method: 'get' | 'put' | 'post' | 'delete', value: unknown = {}) => {
  const spy = spyOn(apiClient, method).mockResolvedValue(value as never);
  spies.push(spy);
  return spy;
};
afterEach(() => spies.splice(0).forEach((spy) => spy.mockRestore()));

const STATS = {
  requests: 3,
  attempts: 4,
  failed: 1,
  input_tokens: 1200,
  uncached_input_tokens: 800,
  cache_read_tokens: 300,
  cache_write_tokens: 100,
  output_tokens: 450,
  reasoning_tokens: 50,
  cost_usd: 0.0123,
  avg_latency_ms: 812.5,
};

const EXPECTED_STATS = {
  requests: 3,
  attempts: 4,
  failed: 1,
  inputTokens: 1200,
  uncachedInputTokens: 800,
  cacheReadTokens: 300,
  cacheWriteTokens: 100,
  outputTokens: 450,
  reasoningTokens: 50,
  costUsd: 0.0123,
  avgLatencyMs: 812.5,
};

const FULL_SUMMARY = {
  enabled: true,
  from: '2026-10-17T14:00:00Z',
  to: '2026-10-18T14:00:00Z',
  bucket: 'day',
  tz: 'Asia/Kolkata',
  generated_at: '2026-10-18T13:59:01Z',
  pricing: {
    source: 'openrouter',
    fetched_at: '2026-10-18T00:00:00Z',
    catalog_size: 412,
    error: '',
  },
  totals: STATS,
  series: [{ t: '2026-10-17T14:00:00Z', ...STATS }],
  keys: [
    {
      id: 'k_0123456789ab',
      name: 'Laptop',
      masked: 'sk-a…wxyz',
      configured: true,
      providers: ['codex', 'claude'],
      first_seen: '2026-10-01T00:00:00Z',
      last_used: '2026-10-18T13:00:00Z',
      totals: STATS,
      series: [{ t: '2026-10-17T14:00:00Z', ...STATS }],
      models: [
        {
          provider: 'claude',
          model: 'claude-sonnet-4-5',
          totals: STATS,
          priced: true,
          price: {
            source: 'openrouter',
            matched_id: 'anthropic/claude-sonnet-4.5',
            input: 3,
            output: 15,
            cache_read: 0.3,
            cache_write: 3.75,
          },
        },
      ],
    },
  ],
  models: [
    {
      provider: 'claude',
      model: 'claude-sonnet-4-5',
      totals: STATS,
      priced: true,
      price: {
        source: 'override',
        matched_id: 'anthropic/claude-sonnet-4.5',
        input: 1,
        output: 2,
        cache_read: 0.1,
        cache_write: 1,
      },
      keys: [{ id: 'k_0123456789ab', requests: 3, cost_usd: 0.0123 }],
    },
  ],
};

const EXPECTED_FULL_SUMMARY = {
  enabled: true,
  from: '2026-10-17T14:00:00Z',
  to: '2026-10-18T14:00:00Z',
  bucket: 'day',
  tz: 'Asia/Kolkata',
  generatedAt: '2026-10-18T13:59:01Z',
  pricing: {
    source: 'openrouter',
    fetchedAt: '2026-10-18T00:00:00Z',
    catalogSize: 412,
    error: '',
  },
  totals: EXPECTED_STATS,
  series: [{ t: '2026-10-17T14:00:00Z', ...EXPECTED_STATS }],
  keys: [
    {
      id: 'k_0123456789ab',
      name: 'Laptop',
      masked: 'sk-a…wxyz',
      configured: true,
      providers: ['codex', 'claude'],
      firstSeen: '2026-10-01T00:00:00Z',
      lastUsed: '2026-10-18T13:00:00Z',
      totals: EXPECTED_STATS,
      series: [{ t: '2026-10-17T14:00:00Z', ...EXPECTED_STATS }],
      models: [
        {
          provider: 'claude',
          model: 'claude-sonnet-4-5',
          totals: EXPECTED_STATS,
          priced: true,
          price: {
            source: 'openrouter',
            matchedId: 'anthropic/claude-sonnet-4.5',
            input: 3,
            output: 15,
            cacheRead: 0.3,
            cacheWrite: 3.75,
          },
        },
      ],
    },
  ],
  models: [
    {
      provider: 'claude',
      model: 'claude-sonnet-4-5',
      totals: EXPECTED_STATS,
      priced: true,
      price: {
        source: 'override',
        matchedId: 'anthropic/claude-sonnet-4.5',
        input: 1,
        output: 2,
        cacheRead: 0.1,
        cacheWrite: 1,
      },
      keys: [{ id: 'k_0123456789ab', requests: 3, costUsd: 0.0123 }],
    },
  ],
};

const EMPTY_STATS = {
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
};

const EMPTY_SUMMARY = {
  enabled: false,
  from: '',
  to: '',
  bucket: 'hour',
  tz: '',
  generatedAt: '',
  pricing: { source: '', fetchedAt: '', catalogSize: 0, error: '' },
  totals: EMPTY_STATS,
  series: [],
  keys: [],
  models: [],
};

describe('usage summary normalization', () => {
  test('converts a full snake_case payload to camelCase', () => {
    expect(normalizeUsageSummary(FULL_SUMMARY)).toEqual(EXPECTED_FULL_SUMMARY);
  });

  test('defaults missing sections to zeros and empty collections', () => {
    expect(normalizeUsageSummary({ enabled: true, keys: [{ id: 'k_x' }] })).toEqual({
      ...EMPTY_SUMMARY,
      enabled: true,
      keys: [
        {
          id: 'k_x',
          name: '',
          masked: '',
          configured: false,
          providers: [],
          firstSeen: '',
          lastUsed: '',
          totals: EMPTY_STATS,
          series: [],
          models: [],
        },
      ],
    });
  });

  test('leaves the per-key share list undefined on non-summary model rows', () => {
    const summary = normalizeUsageSummary({
      models: [{ provider: 'codex', model: 'gpt', price: { source: 'none' } }],
      keys: [{ id: 'k_x', models: [{ provider: 'codex', model: 'gpt' }] }],
    });
    expect(summary.models[0]).not.toHaveProperty('keys');
    expect(summary.keys[0].models[0]).not.toHaveProperty('keys');
    expect(summary.models[0].price).toEqual({
      source: 'none',
      matchedId: '',
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
  });

  test('survives garbage payloads without throwing', () => {
    for (const garbage of [null, undefined, 'summary', 42, [], true]) {
      expect(normalizeUsageSummary(garbage)).toEqual(EMPTY_SUMMARY);
    }

    const summary = normalizeUsageSummary({
      enabled: 'yes',
      bucket: 'week',
      from: 7,
      totals: 'bad',
      series: [null, 'x', { t: 5, requests: 'NaN', cost_usd: Infinity, attempts: '12' }],
      keys: [
        null,
        3,
        { id: 'k_ok', configured: 'true', providers: ['codex', 9, '  ', ' gemini '] },
      ],
      models: { not: 'a list' },
      pricing: null,
    });
    expect(summary.enabled).toBe(false);
    expect(summary.bucket).toBe('hour');
    expect(summary.from).toBe('');
    expect(summary.totals).toEqual(EMPTY_STATS);
    expect(summary.series).toEqual([{ t: '', ...EMPTY_STATS, attempts: 12 }]);
    expect(summary.keys).toHaveLength(1);
    expect(summary.keys[0]).toMatchObject({
      id: 'k_ok',
      configured: false,
      providers: ['codex', 'gemini'],
    });
    expect(summary.models).toEqual([]);
    expect(summary.pricing).toEqual(EMPTY_SUMMARY.pricing);
  });

  test('maps unknown price sources to none and non-finite counters to zero', () => {
    const summary = normalizeUsageSummary({
      models: [
        {
          provider: 'x',
          model: 'y',
          priced: 1,
          price: { source: 'magic', input: Number.NaN, output: '4.5', cache_read: -1 },
        },
      ],
    });
    expect(summary.models[0].priced).toBe(false);
    expect(summary.models[0].price).toMatchObject({ source: 'none', input: 0, output: 4.5 });
    expect(summary.models[0].price.cacheRead).toBe(-1);
  });
});

describe('usage pricing normalization', () => {
  test('converts a full pricing payload and override field names', () => {
    expect(
      normalizeUsagePricing({
        source: 'openrouter',
        fetched_at: '2026-10-18T00:00:00Z',
        error: '',
        openrouter_disabled: false,
        catalog: [
          {
            id: 'anthropic/claude-sonnet-4.5',
            name: 'Anthropic: Claude Sonnet 4.5',
            input: 3,
            output: 15,
            cache_read: 0.3,
            cache_write: 3.75,
          },
        ],
        overrides: {
          'claude-opus-4-1*': { 'openrouter-id': 'anthropic/claude-opus-4.1' },
          'my-local-model': { input: 0, output: 0, 'cache-read': 0.5, 'cache-write': 1 },
        },
      })
    ).toEqual({
      source: 'openrouter',
      fetchedAt: '2026-10-18T00:00:00Z',
      error: '',
      openrouterDisabled: false,
      catalog: [
        {
          id: 'anthropic/claude-sonnet-4.5',
          name: 'Anthropic: Claude Sonnet 4.5',
          input: 3,
          output: 15,
          cacheRead: 0.3,
          cacheWrite: 3.75,
        },
      ],
      overrides: {
        'claude-opus-4-1*': { openrouterId: 'anthropic/claude-opus-4.1' },
        'my-local-model': { input: 0, output: 0, cacheRead: 0.5, cacheWrite: 1 },
      },
    });
  });

  test('defaults partial payloads and keeps unset override fields undefined', () => {
    const pricing = normalizeUsagePricing({ catalog: [{ id: 'a/b' }], overrides: { m: {} } });
    expect(pricing).toEqual({
      source: '',
      fetchedAt: '',
      error: '',
      openrouterDisabled: false,
      catalog: [{ id: 'a/b', name: '', input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }],
      overrides: { m: {} },
    });
    expect(Object.keys(pricing.overrides.m)).toEqual([]);
  });

  test('survives garbage pricing payloads', () => {
    for (const garbage of [null, 'pricing', 7, []]) {
      expect(normalizeUsagePricing(garbage)).toEqual({
        source: '',
        fetchedAt: '',
        error: '',
        openrouterDisabled: false,
        catalog: [],
        overrides: {},
      });
    }

    const pricing = normalizeUsagePricing({
      openrouter_disabled: 'true',
      catalog: [null, { name: 'no id' }, { id: '  ', input: 1 }, { id: 'ok', input: 'Infinity' }],
      overrides: {
        '  spaced  ': { 'openrouter-id': '  id/x  ', input: 'abc', output: Number.NaN },
        '': { input: 1 },
        broken: 'not-a-record',
        list: [1, 2],
      },
    });
    expect(pricing.openrouterDisabled).toBe(false);
    expect(pricing.catalog).toEqual([
      { id: 'ok', name: '', input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    ]);
    expect(pricing.overrides).toEqual({ spaced: { openrouterId: 'id/x' } });
  });
});

describe('usage API endpoints', () => {
  test('reads the summary with only the query parameters that were provided', async () => {
    const get = mock('get', FULL_SUMMARY);
    expect(await usageApi.getSummary({ range: '7d', bucket: 'day', tz: 'Asia/Kolkata' })).toEqual(
      EXPECTED_FULL_SUMMARY
    );
    expect(get).toHaveBeenLastCalledWith('/observability/usage/summary', {
      params: { range: '7d', bucket: 'day', tz: 'Asia/Kolkata' },
    });

    await usageApi.getSummary({ from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z' });
    expect(get).toHaveBeenLastCalledWith('/observability/usage/summary', {
      params: { from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z' },
    });

    await usageApi.getSummary();
    expect(get).toHaveBeenLastCalledWith('/observability/usage/summary', { params: {} });
  });

  test('clears stored usage through DELETE on the summary path', async () => {
    const del = mock('delete', { status: 'ok' });
    await expect(usageApi.clear()).resolves.toBeUndefined();
    expect(del).toHaveBeenLastCalledWith('/observability/usage/summary');
  });

  test('reads and refreshes pricing through the pricing endpoints', async () => {
    const pricing = { source: 'openrouter', catalog: [{ id: 'a/b', input: 1 }] };
    const get = mock('get', pricing);
    const post = mock('post', pricing);

    expect((await usageApi.getPricing()).catalog).toEqual([
      { id: 'a/b', name: '', input: 1, output: 0, cacheRead: 0, cacheWrite: 0 },
    ]);
    expect(get).toHaveBeenLastCalledWith('/observability/usage/pricing');

    expect((await usageApi.refreshPricing()).source).toBe('openrouter');
    expect(post).toHaveBeenLastCalledWith('/observability/usage/pricing/refresh');
  });

  test('serializes overrides to config field names and omits unset values', async () => {
    const put = mock('put', { status: 'ok' });
    const get = mock('get', {
      overrides: { 'claude-opus-4-1*': { 'openrouter-id': 'anthropic/claude-opus-4.1' } },
    });
    const result = await usageApi.putOverrides({
      'claude-opus-4-1*': { openrouterId: 'anthropic/claude-opus-4.1' },
      'my-local-model': {
        input: 0,
        output: 0,
        cacheRead: undefined,
        cacheWrite: Number.NaN,
      },
      'full-model': {
        openrouterId: 'x/y',
        input: 1.5,
        output: 2,
        cacheRead: 0.25,
        cacheWrite: 3,
      },
    });

    expect(put).toHaveBeenLastCalledWith('/config/observability/usage/tracking/pricing/overrides', {
      'claude-opus-4-1*': { 'openrouter-id': 'anthropic/claude-opus-4.1' },
      'my-local-model': { input: 0, output: 0 },
      'full-model': {
        'openrouter-id': 'x/y',
        input: 1.5,
        output: 2,
        'cache-read': 0.25,
        'cache-write': 3,
      },
    });
    const body = put.mock.calls.at(-1)?.[1] as Record<string, Record<string, unknown>>;
    expect(Object.keys(body['my-local-model'])).not.toContain('cache-read');
    expect(Object.keys(body['my-local-model'])).not.toContain('cache-write');
    expect(get).toHaveBeenLastCalledWith('/observability/usage/pricing');
    expect(result.overrides).toEqual({
      'claude-opus-4-1*': { openrouterId: 'anthropic/claude-opus-4.1' },
    });
  });
});
