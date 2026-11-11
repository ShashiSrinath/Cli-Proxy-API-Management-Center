import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { apiClient } from '@/services/api/client';
import {
  keyBudgetsApi,
  normalizeKeyBudgetLimits,
  normalizeKeyBudgets,
} from '@/services/api/keyBudgets';

const spies: Array<{ mockRestore(): void }> = [];
afterEach(() => spies.splice(0).forEach((spy) => spy.mockRestore()));

const PAYLOAD = {
  enabled: true,
  generated_at: '2026-11-20T10:00:00Z',
  keys: [
    {
      id: 'k_0123456789ab',
      masked: 'sk-a…9f2c',
      name: 'CI',
      models: ['deepseek-*', ' '],
      providers: ['openai-compatibility'],
      limits: {
        'daily-usd': 5,
        'weekly-usd': 20,
        'monthly-usd': 60,
        timezone: 'Asia/Kolkata',
      },
      windows: [
        {
          period: 'day',
          limit_usd: 5,
          spent_usd: 1.25,
          start: '2026-11-20T00:00:00+05:30',
          resets_at: '2026-11-21T00:00:00+05:30',
          exceeded: false,
        },
        {
          period: 'month',
          limit_usd: 60,
          spent_usd: 60.12,
          start: '2026-11-01T00:00:00+05:30',
          resets_at: '2026-12-01T00:00:00+05:30',
          exceeded: true,
        },
        { period: 'year', limit_usd: 10, spent_usd: 1 },
      ],
      exceeded: false,
    },
    {
      id: 'k_ffffffffffff',
      masked: '',
      name: '',
      models: [],
      providers: [],
      limits: null,
      windows: [],
    },
    null,
  ],
};

describe('key budget normalization', () => {
  test('maps snake_case rows, windows, and limits', () => {
    const budgets = normalizeKeyBudgets(PAYLOAD);
    expect(budgets.enabled).toBe(true);
    expect(budgets.generatedAt).toBe('2026-11-20T10:00:00Z');
    expect(budgets.keys).toHaveLength(2);

    const [ci] = budgets.keys;
    expect(ci.id).toBe('k_0123456789ab');
    expect(ci.masked).toBe('sk-a…9f2c');
    expect(ci.models).toEqual(['deepseek-*']);
    expect(ci.providers).toEqual(['openai-compatibility']);
    expect(ci.limits).toEqual({
      dailyUsd: 5,
      weeklyUsd: 20,
      monthlyUsd: 60,
      timezone: 'Asia/Kolkata',
    });
    // Unknown periods are dropped; the per-window exceeded flag lifts the row flag.
    expect(ci.windows.map((window) => window.period)).toEqual(['day', 'month']);
    expect(ci.windows[1].spentUsd).toBe(60.12);
    expect(ci.windows[1].exceeded).toBe(true);
    expect(ci.exceeded).toBe(true);
  });

  test('tolerates missing or malformed payloads', () => {
    expect(normalizeKeyBudgets(null)).toEqual({ enabled: false, generatedAt: '', keys: [] });
    expect(normalizeKeyBudgets({ keys: 'nope' }).keys).toEqual([]);
    expect(
      normalizeKeyBudgetLimits({ 'daily-usd': 0, 'weekly-usd': -1, timezone: '  ' })
    ).toBeNull();
    expect(normalizeKeyBudgetLimits({ 'daily-usd': '2.5' })).toEqual({ dailyUsd: 2.5 });
  });

  test('fetches through the v8 management client', async () => {
    const spy = spyOn(apiClient, 'get').mockResolvedValue(PAYLOAD as never);
    spies.push(spy);
    const budgets = await keyBudgetsApi.get();
    expect(spy.mock.calls[0][0]).toBe('/observability/usage/key-budgets');
    expect(budgets.keys[0].windows).toHaveLength(2);
  });
});
