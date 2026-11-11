import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';
import { KeyBudgetMeters } from '@/features/config/components/blocks/KeyBudgetMeters';
import type { KeyBudgetWindow } from '@/types/keyBudgets';

const translations = i18n.cloneInstance({ lng: 'en' });
const render = (element: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(I18nextProvider, { i18n: translations }, element));

const AMOUNT_KEYS = [
  'models_label',
  'models_hint',
  'models_all',
  'models_summary',
  'models_placeholder',
  'models_remove',
  'limits_label',
  'limits_daily',
  'limits_weekly',
  'limits_monthly',
  'limits_placeholder',
  'limits_timezone',
  'limits_timezone_suggest',
  'limits_hint',
  'limits_summary',
  'limits_footnote',
  'limits_error_amount',
  'limits_error_timezone',
] as const;

const flatKeys = (value: unknown): string[] =>
  Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    child && typeof child === 'object' ? flatKeys(child).map((leaf) => `${key}.${leaf}`) : [key]
  );

describe('key budget localization', () => {
  test('every locale carries the editor labels and the meter strings', () => {
    for (const locale of [zhCN, zhTW, ru]) {
      for (const key of AMOUNT_KEYS) {
        const text = (locale.config_management.visual.api_keys as Record<string, string>)[key];
        expect(typeof text).toBe('string');
        expect(text.trim().length).toBeGreaterThan(0);
      }
      expect(flatKeys(locale.keyBudgets).sort()).toEqual(flatKeys(en.keyBudgets).sort());
    }
  });
});

describe('key budget meters', () => {
  const windows: KeyBudgetWindow[] = [
    {
      period: 'day',
      limitUsd: 5,
      spentUsd: 1.25,
      start: '2026-11-20T00:00:00+05:30',
      resetsAt: '2026-11-21T00:00:00+05:30',
      exceeded: false,
    },
    {
      period: 'month',
      limitUsd: 60,
      spentUsd: 60.12,
      start: '2026-11-01T00:00:00+05:30',
      resetsAt: '2026-12-01T00:00:00+05:30',
      exceeded: true,
    },
  ];

  test('renders compact spend meters for every window', () => {
    const markup = render(createElement(KeyBudgetMeters, { windows, exceeded: true }));
    expect(markup).toContain('$1.25 / $5.00');
    expect(markup).toContain('$60.12 / $60.00');
    expect(markup).toContain(translations.t('keyBudgets.blocked'));
    expect(markup).toContain(
      translations.t('keyBudgets.resetsIn', { time: 'in 1 day' }).slice(0, 6)
    );
  });

  test('marks tracking-off keys as unavailable instead of blocked', () => {
    const markup = render(createElement(KeyBudgetMeters, { windows, disabled: true }));
    expect(markup).toContain(translations.t('keyBudgets.unavailable'));
  });

  test('renders nothing without windows', () => {
    expect(render(createElement(KeyBudgetMeters, { windows: [] }))).toBe('');
  });
});
