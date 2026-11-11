import { describe, expect, test } from 'bun:test';
import { parse as parseYaml } from 'yaml';
import {
  apiKeyLimitDraft,
  apiKeyLimitFromDraft,
  apiKeyMask,
  areApiKeyLimitsEqual,
  areApiKeyModelsEqual,
  buildApiKeyModelSuggestions,
  formatApiKeyModelPatterns,
  hasApiKeyLimit,
  indexBudgetsByApiKeyMask,
  isApiKeyLimitAmountInvalid,
  isApiKeyTimeZoneInvalid,
  matchesApiKeyModel,
  normalizeApiKeyLimit,
  parseApiKeyLimits,
  parseApiKeyModelPatterns,
  parseApiKeyModels,
  remapApiKeyEntries,
  serializeApiKeyLimit,
} from '../src/features/config/apiKeyModels';
import { parseApiKeyProviders } from '../src/hooks/useVisualConfig';
import type { KeyBudgetRow } from '../src/types/keyBudgets';
import { runVisualConfig } from './helpers/visualConfig';

const BASE_YAML = `config-version: 8
access:
  api-keys:
    - client-a
    - client-b
  api-key-models:
    client-b: [deepseek-*, kimi-k2*]
  api-key-limits:
    client-b:
      daily-usd: 5
      weekly-usd: 20
      monthly-usd: 60
      timezone: Asia/Kolkata
`;

describe('api key model allow-lists', () => {
  test('parses and normalizes access.api-key-models', () => {
    expect(
      parseApiKeyModels({ a: [' deepseek-* ', 'DeepSeek-*', ''], b: [], c: 'x', ' ': ['glm-5*'] })
    ).toEqual({ a: ['deepseek-*'] });
    expect(parseApiKeyModels(null)).toEqual({});
    expect(parseApiKeyModels('nope')).toEqual({});
  });

  test('parses comma and newline separated editor text', () => {
    expect(parseApiKeyModelPatterns('deepseek-*, kimi-k2*\nglm-5*, ,deepseek-*')).toEqual([
      'deepseek-*',
      'kimi-k2*',
      'glm-5*',
    ]);
    expect(formatApiKeyModelPatterns(['deepseek-*', 'glm-5*'])).toBe('deepseek-*, glm-5*');
  });

  test('matches like the backend: thinking suffix stripped, case-insensitive, prefix removed', () => {
    expect(matchesApiKeyModel(['deepseek-*'], 'deepseek-v4')).toBe(true);
    expect(matchesApiKeyModel(['DeepSeek-*'], 'DeepSeek-V4-thinking')).toBe(true);
    expect(matchesApiKeyModel(['claude-*'], 'team/claude-sonnet-4-5')).toBe(true);
    expect(matchesApiKeyModel(['claude-*'], 'gpt-6.1-sol')).toBe(false);
    expect(matchesApiKeyModel(['gpt-4.1'], 'gpt-4x1')).toBe(false);
    expect(matchesApiKeyModel([], 'deepseek-v4')).toBe(false);
  });

  test('suggests compat aliases before discovered model ids', () => {
    expect(
      buildApiKeyModelSuggestions(
        [{ models: [{ name: 'gpt-6.1-sol', alias: 'sol' }, { name: 'gpt-6.1-sol' }] }],
        ['deepseek-v4', 'sol', '  ']
      )
    ).toEqual(['sol', 'gpt-6.1-sol', 'deepseek-v4']);
    expect(buildApiKeyModelSuggestions()).toEqual([]);
  });

  test('compares allow-lists order-insensitively', () => {
    expect(areApiKeyModelsEqual({ a: ['x'] }, { a: ['x'] })).toBe(true);
    expect(areApiKeyModelsEqual({ a: ['x'] }, { a: [] })).toBe(false);
    expect(areApiKeyModelsEqual({ a: ['x'] }, { b: ['x'] })).toBe(false);
  });
});

describe('api key spend limits', () => {
  test('maps kebab-case caps to the draft shape and drops non-positive amounts', () => {
    expect(
      parseApiKeyLimits({ a: { 'daily-usd': 5, 'monthly-usd': 0, timezone: ' UTC ' } })
    ).toEqual({ a: { dailyUsd: 5, timezone: 'UTC' } });
    expect(normalizeApiKeyLimit({ 'daily-usd': -3 })).toBeNull();
    expect(normalizeApiKeyLimit({ 'daily-usd': '7.5' })).toEqual({ dailyUsd: 7.5 });
    expect(normalizeApiKeyLimit({ timezone: 'UTC' })).toEqual({ timezone: 'UTC' });
    expect(parseApiKeyLimits(null)).toEqual({});
  });

  test('serializes back to the kebab-case YAML entry', () => {
    expect(
      serializeApiKeyLimit({ dailyUsd: 5, weeklyUsd: 20, monthlyUsd: 60, timezone: 'Asia/Kolkata' })
    ).toEqual({
      'daily-usd': 5,
      'weekly-usd': 20,
      'monthly-usd': 60,
      timezone: 'Asia/Kolkata',
    });
    expect(serializeApiKeyLimit({ dailyUsd: 0 })).toEqual({});
    expect(hasApiKeyLimit({})).toBe(false);
    expect(hasApiKeyLimit({ weeklyUsd: 1 })).toBe(true);
  });

  test('compares cap sets regardless of field order', () => {
    expect(areApiKeyLimitsEqual({ a: { dailyUsd: 5 } }, { a: { dailyUsd: 5 } })).toBe(true);
    expect(areApiKeyLimitsEqual({ a: { dailyUsd: 5 } }, { a: { dailyUsd: 6 } })).toBe(false);
    expect(areApiKeyLimitsEqual({ a: {} }, {})).toBe(true);
  });
});

describe('spend limit editor mapping', () => {
  test('round-trips a cap set through editor text', () => {
    const draft = apiKeyLimitDraft({ dailyUsd: 5, monthlyUsd: 60, timezone: 'Asia/Kolkata' });
    expect(draft).toEqual({ daily: '5', weekly: '', monthly: '60', timezone: 'Asia/Kolkata' });
    expect(apiKeyLimitFromDraft(draft)).toEqual({
      dailyUsd: 5,
      monthlyUsd: 60,
      timezone: 'Asia/Kolkata',
    });
  });

  test('a timezone without any cap is not persisted', () => {
    expect(
      apiKeyLimitFromDraft({ daily: '', weekly: '', monthly: '', timezone: 'Asia/Kolkata' })
    ).toBeNull();
    expect(apiKeyLimitDraft(undefined)).toEqual({
      daily: '',
      weekly: '',
      monthly: '',
      timezone: '',
    });
  });

  test('rejects negative or non-numeric amounts and unknown zones', () => {
    expect(isApiKeyLimitAmountInvalid('')).toBe(false);
    expect(isApiKeyLimitAmountInvalid('5.5')).toBe(false);
    expect(isApiKeyLimitAmountInvalid('-1')).toBe(true);
    expect(isApiKeyLimitAmountInvalid('abc')).toBe(true);
    expect(isApiKeyTimeZoneInvalid('')).toBe(false);
    expect(isApiKeyTimeZoneInvalid('Asia/Kolkata')).toBe(false);
    expect(isApiKeyTimeZoneInvalid('+05:30')).toBe(true);
    expect(isApiKeyTimeZoneInvalid('Mars/Olympus')).toBe(true);
  });
});

describe('api key restriction remapping', () => {
  test('renames and deletes entries like provider allow-lists', () => {
    expect(remapApiKeyEntries({ a: ['x'], b: ['y'] }, 'a', 'a2')).toEqual({
      a2: ['x'],
      b: ['y'],
    });
    expect(remapApiKeyEntries({ a: ['x'] }, 'a', null)).toEqual({});
    expect(remapApiKeyEntries({ a: ['x'] }, null, 'c', ['z'])).toEqual({ a: ['x'], c: ['z'] });
    expect(remapApiKeyEntries({ a: ['x'] }, 'a', 'a', undefined)).toEqual({ a: ['x'] });
  });
});

describe('budget mask matching', () => {
  const row = (masked: string, id = masked): KeyBudgetRow => ({
    id,
    masked,
    name: '',
    models: [],
    providers: [],
    limits: null,
    windows: [],
    exceeded: false,
  });

  test('masks a raw key like the backend', () => {
    expect(apiKeyMask('sk-abcdef1234569f2c')).toBe('sk-a…9f2c');
    expect(apiKeyMask('sk-short')).toBe('sk…');
    expect(apiKeyMask('  ')).toBe('');
  });

  test('matches by mask and drops ambiguous masks on either side', () => {
    const keys = ['sk-aaaaaa1111119f2c', 'sk-aaaaaa2222229f2c', 'sk-aaaaaa3333331111'];
    const budgets = [row('sk-a…9f2c'), row('sk-a…1111')];
    const matched = indexBudgetsByApiKeyMask(keys, budgets);
    // Two configured keys share the sk-a…9f2c mask, so neither gets a meter.
    expect(matched.has('sk-aaaaaa1111119f2c')).toBe(false);
    expect(matched.has('sk-aaaaaa2222229f2c')).toBe(false);
    expect(matched.get('sk-aaaaaa3333331111')?.masked).toBe('sk-a…1111');
  });

  test('drops duplicate masks reported by the endpoint', () => {
    const matched = indexBudgetsByApiKeyMask(
      ['sk-abcdef1234569f2c'],
      [row('sk-a…9f2c', 'k_1'), row('sk-a…9f2c', 'k_2')]
    );
    expect(matched.size).toBe(0);
  });
});

describe('visual config codec for key restrictions', () => {
  test('loads models and caps from access.api-key-models / access.api-key-limits', () => {
    const loaded = runVisualConfig(BASE_YAML);
    expect(loaded.visualValues.apiKeyModels).toEqual({ 'client-b': ['deepseek-*', 'kimi-k2*'] });
    expect(loaded.visualValues.apiKeyLimits).toEqual({
      'client-b': { dailyUsd: 5, weeklyUsd: 20, monthlyUsd: 60, timezone: 'Asia/Kolkata' },
    });
    expect(loaded.visualDirty).toBe(false);
  });

  test('rewrites both maps and keeps unrelated access keys', () => {
    const updated = runVisualConfig(BASE_YAML, [
      { apiKeyModels: { 'client-a': ['glm-5*'], 'client-b': ['deepseek-*', 'kimi-k2*'] } },
      { apiKeyLimits: { 'client-a': { dailyUsd: 1.5, timezone: 'UTC' } } },
    ]);
    expect(parseYaml(updated.applyVisualChangesToYaml(BASE_YAML)).access).toEqual({
      'api-keys': ['client-a', 'client-b'],
      'api-key-models': { 'client-a': ['glm-5*'], 'client-b': ['deepseek-*', 'kimi-k2*'] },
      'api-key-limits': { 'client-a': { 'daily-usd': 1.5, timezone: 'UTC' } },
    });
  });

  test('drops entries for removed keys and removes empty maps', () => {
    const updated = runVisualConfig(BASE_YAML, [{ apiKeysText: 'client-a' }]);
    expect(parseYaml(updated.applyVisualChangesToYaml(BASE_YAML)).access).toEqual({
      'api-keys': ['client-a'],
    });
  });

  test('dirty tracking ignores equivalent drafts and flags changes', () => {
    const unchanged = runVisualConfig(BASE_YAML, [
      { apiKeyModels: { 'client-b': ['DeepSeek-*', 'kimi-k2*'] } },
      {
        apiKeyLimits: {
          'client-b': { dailyUsd: 5, weeklyUsd: 20, monthlyUsd: 60, timezone: 'Asia/Kolkata' },
        },
      },
    ]);
    expect(unchanged.visualDirty).toBe(false);

    const changed = runVisualConfig(BASE_YAML, [
      { apiKeyLimits: { 'client-b': { dailyUsd: 9, timezone: 'Asia/Kolkata' } } },
    ]);
    expect(changed.visualDirtyFields.has('apiKeyLimits')).toBe(true);
  });

  test('provider parsing is unaffected by the new maps', () => {
    expect(parseApiKeyProviders({ a: ['Codex'] })).toEqual({ a: ['codex'] });
  });
});
