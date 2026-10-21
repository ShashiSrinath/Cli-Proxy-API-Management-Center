import { afterEach, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import type { AuthFileItem } from '@/types';
import type { ApiCallRequest, ApiCallResult } from '@/services/api/apiCall';
import {
  COMMAND_CODE_CREDITS_URL,
  commandCodeAccountUrls,
  parseCommandCodeMonthlyWindow,
  parseCommandCodeQuotaPayload,
} from '@/services/api/commandCodeQuota';
import { CommandCodeQuotaBody } from '@/features/quota/providers/commandcode/CommandCodeQuotaBody';
import { COMMAND_CODE_CONFIG } from '@/features/quota/providers/commandcode/data';
import {
  CommandCodeQuotaError,
  createCommandCodeQuotaFetcher,
} from '@/features/quota/providers/commandcode/requests';
import { QUOTA_CLASS_KEYS, bindQuotaClasses } from '@/features/quota/types';
import { buildTabCounts, classifyQuotaFiles } from '@/features/quota/logic';
import { collectQuotaRowInstants } from '@/features/quota/resetSchedule';
import { buildTimelineLane } from '@/features/quota/quotaTimelineModel';
import { withoutConfigSourcedAuthFiles } from '@/features/authFiles/constants';
import { getQuotaDisplayName } from '@/utils/quota/identity';
import { useQuotaStore } from '@/stores/useQuotaStore';

// Captured from https://api.commandcode.ai/alpha/billing/credits.
const creditsResponse = {
  credits: {
    belowThreshold: false,
    creditThreshold: 0,
    monthlyCredits: 69.9177663613,
    purchasedCredits: 0,
    freeCredits: 0,
  },
  windowLimits: {
    limited: true,
    exceeded: null,
    fiveHour: { used: 0.0822336387, cap: 14, exceeded: false, resetAt: 1791256488371 },
    weekly: { used: 0.0822336387, cap: 35, exceeded: false, resetAt: 1791843288371 },
  },
  sandboxAccess: false,
  sandboxMinutes: null,
};

// Captured from /alpha/billing/subscriptions and /alpha/usage/summary (identifiers removed).
const subscriptionResponse = {
  success: true,
  data: {
    status: 'active',
    currentPeriodStart: '2026-10-05T22:08:39.000Z',
    currentPeriodEnd: '2026-11-05T22:08:39.000Z',
    planId: 'individual-goat',
  },
};
const usageSummaryResponse = {
  totalCredits: 69.9930246971,
  totalMonthlyCredits: 69.9930246971,
  totalPurchasedCredits: 0,
  periodBasis: 'billing-period',
  periodStart: '2026-10-05T22:08:39.000Z',
};
const lowCreditsResponse = {
  ...creditsResponse,
  credits: { ...creditsResponse.credits, monthlyCredits: 0.0557380141 },
};

const probe = {
  url: COMMAND_CODE_CREDITS_URL,
  headers: { Authorization: 'Bearer $TOKEN$', Accept: 'application/json' },
};

// Shape of a config credential as listed by GET /v8/management/credentials.
const file: AuthFileItem = {
  name: 'openai-compatibility:commandcode:abc123',
  type: 'openai-compatible-commandcode',
  provider: 'openai-compatible-commandcode',
  label: 'command-code',
  authIndex: 'idx-1',
  source: 'config',
  supports_quota: true,
  quota_probe: probe,
};

const classes = bindQuotaClasses(
  Object.fromEntries(QUOTA_CLASS_KEYS.map((key) => [key, key])),
  'test'
);

afterEach(() => useQuotaStore.getState().clearQuotaCache());

describe('Command Code quota', () => {
  test('provides labels in all four locales', () => {
    for (const locale of ['en', 'zh-CN', 'zh-TW', 'ru']) {
      const translations = JSON.parse(readFileSync(`src/i18n/locales/${locale}.json`, 'utf8'));
      expect(translations.auth_files['filter_commandcode']).toBeTruthy();
      for (const key of [
        'title',
        'empty_title',
        'empty_desc',
        'idle',
        'loading',
        'load_failed',
        'missing_auth_index',
        'empty_data',
        'invalid_response',
        'request_failed',
        'stale_request',
        'fiveHour',
        'weekly',
        'monthly',
        'credits',
        'credits_remaining',
        'unknown',
        'remaining',
      ]) {
        expect(translations.commandcode_quota[key]).toBeTruthy();
      }
    }
  });

  test('detects credentials by quota probe regardless of entry name and skips disabled ones', () => {
    expect(COMMAND_CODE_CONFIG.filterFn(file)).toBe(true);
    expect(COMMAND_CODE_CONFIG.filterFn({ ...file, disabled: true })).toBe(false);
    expect(
      COMMAND_CODE_CONFIG.filterFn({
        ...file,
        provider: 'openai-compatible-anything',
        type: 'openai-compatible-anything',
      })
    ).toBe(true);
    expect(COMMAND_CODE_CONFIG.filterFn({ name: 'x', type: 'openai-compatible-openrouter' })).toBe(
      false
    );
    const entries = classifyQuotaFiles([file]);
    expect(entries).toEqual([{ file, type: 'commandcode' }]);
    expect(buildTabCounts(entries)['commandcode']).toBe(1);
    expect(getQuotaDisplayName(file)).toBe('command-code · idx-1');
  });

  test('config credentials stay out of file views', () => {
    const regular: AuthFileItem = { name: 'codex.json', type: 'codex', source: 'file' };
    expect(withoutConfigSourcedAuthFiles([file, regular])).toEqual([regular]);
  });

  test('parses credits and usage windows and rejects invalid bodies', () => {
    const data = parseCommandCodeQuotaPayload(JSON.stringify(creditsResponse))!;
    expect(data.windows.map((window) => window.id)).toEqual(['fiveHour', 'weekly']);
    expect(data.windows[0].usedPercent).toBeCloseTo((0.0822336387 / 14) * 100, 10);
    expect(data.windows[1].usedPercent).toBeCloseTo((0.0822336387 / 35) * 100, 10);
    // resetAt is epoch ms upstream, converted to Unix seconds.
    expect(data.windows[0].resetAt).toBe(1791256488);
    expect(data.windows[1].resetAt).toBe(1791843288);
    expect(data.creditsRemaining).toBeCloseTo(69.9177663613, 10);
    expect(parseCommandCodeQuotaPayload({ error: 'nope' })).toBeNull();
    expect(parseCommandCodeQuotaPayload({ credits: {} })).toBeNull();
    expect(parseCommandCodeQuotaPayload('not json')).toBeNull();
  });

  test('renders remaining meters for each window plus the credits row', () => {
    const quota = COMMAND_CODE_CONFIG.buildSuccessState(
      parseCommandCodeQuotaPayload(creditsResponse)!
    );
    const markup = renderToStaticMarkup(createElement(CommandCodeQuotaBody, { quota, classes }));
    expect(markup).toContain(i18n.t('commandcode_quota.fiveHour'));
    expect(markup).toContain(i18n.t('commandcode_quota.weekly'));
    expect(markup).toContain(i18n.t('commandcode_quota.credits'));
    expect(markup).toContain(i18n.t('commandcode_quota.credits_remaining', { amount: '$69.92' }));
    expect(markup.match(/role="meter"/g)).toHaveLength(2);
  });

  test('shows unknown quota instead of full meters when windows are missing', () => {
    const quota = COMMAND_CODE_CONFIG.buildSuccessState(
      parseCommandCodeQuotaPayload({ windowLimits: {} })!
    );
    const markup = renderToStaticMarkup(createElement(CommandCodeQuotaBody, { quota, classes }));
    expect(markup).toContain(i18n.t('commandcode_quota.empty_data'));
    expect(markup).not.toContain('role="meter"');
  });

  test('fetches through api-call with the backend probe url and headers', async () => {
    const requests: ApiCallRequest[] = [];
    const fetchQuota = createCommandCodeQuotaFetcher({
      request: async (payload) => {
        requests.push(payload);
        return {
          statusCode: 200,
          header: {},
          bodyText: '',
          body: creditsResponse,
        } as ApiCallResult;
      },
      captureCurrent: () => () => true,
    });
    const data = await fetchQuota(file);
    expect(data.windows).toHaveLength(2);
    expect(data.creditsRemaining).toBeCloseTo(69.9177663613, 10);
    const urls = commandCodeAccountUrls(probe.url);
    expect(requests).toEqual([
      { authIndex: 'idx-1', method: 'GET', url: probe.url, header: probe.headers },
      { authIndex: 'idx-1', method: 'GET', url: urls.subscriptions, header: probe.headers },
      { authIndex: 'idx-1', method: 'GET', url: urls.usageSummary, header: probe.headers },
    ]);
  });

  test('adds the monthly billing-period window from subscription and usage summary', async () => {
    const urls = commandCodeAccountUrls(probe.url);
    expect(urls).toEqual({
      subscriptions: 'https://api.commandcode.ai/alpha/billing/subscriptions',
      usageSummary: 'https://api.commandcode.ai/alpha/usage/summary',
    });
    const bodies: Record<string, unknown> = {
      [probe.url]: lowCreditsResponse,
      [urls.subscriptions]: subscriptionResponse,
      [urls.usageSummary]: usageSummaryResponse,
    };
    const fetchQuota = createCommandCodeQuotaFetcher({
      request: async (payload) =>
        ({ statusCode: 200, header: {}, bodyText: '', body: bodies[payload.url] }) as ApiCallResult,
      captureCurrent: () => () => true,
    });
    const data = await fetchQuota(file);
    const monthly = data.windows.find((window) => window.id === 'monthly')!;
    expect(monthly.resetAt).toBe(Date.parse('2026-11-05T22:08:39.000Z') / 1000);
    expect(monthly.usedPercent).toBeCloseTo(
      (69.9930246971 / (69.9930246971 + 0.0557380141)) * 100,
      8
    );

    const quota = COMMAND_CODE_CONFIG.buildSuccessState(data);
    const markup = renderToStaticMarkup(createElement(CommandCodeQuotaBody, { quota, classes }));
    expect(markup).toContain(i18n.t('commandcode_quota.monthly'));
    expect(markup.match(/role="meter"/g)).toHaveLength(3);
    expect(markup).toContain(i18n.t('commandcode_quota.credits_remaining', { amount: '$0.06' }));
    expect(collectQuotaRowInstants('commandcode', quota).map((i) => i.rowId)).toContain('monthly');
  });

  test('keeps the credits card when the account endpoints fail or are partial', async () => {
    const fetchQuota = createCommandCodeQuotaFetcher({
      request: async (payload) => {
        if (payload.url === probe.url) {
          return {
            statusCode: 200,
            header: {},
            bodyText: '',
            body: creditsResponse,
          } as ApiCallResult;
        }
        throw new Error('network');
      },
      captureCurrent: () => () => true,
    });
    expect((await fetchQuota(file)).windows.map((window) => window.id)).toEqual([
      'fiveHour',
      'weekly',
    ]);
    // Reset time alone is still worth showing; usage alone without a balance is not.
    expect(parseCommandCodeMonthlyWindow(creditsResponse, subscriptionResponse, null)).toEqual({
      id: 'monthly',
      usedPercent: null,
      resetAt: Date.parse('2026-11-05T22:08:39.000Z') / 1000,
    });
    expect(parseCommandCodeMonthlyWindow({}, null, usageSummaryResponse)).toBeNull();
  });

  test('maps failures to typed errors', async () => {
    const failing = createCommandCodeQuotaFetcher({
      request: async () =>
        ({ statusCode: 401, header: {}, bodyText: '', body: null }) as ApiCallResult,
      captureCurrent: () => () => true,
    });
    await expect(failing(file)).rejects.toMatchObject({ code: 'request_failed', status: 401 });
    await expect(failing({ ...file, authIndex: undefined })).rejects.toBeInstanceOf(
      CommandCodeQuotaError
    );

    const invalid = createCommandCodeQuotaFetcher({
      request: async () =>
        ({ statusCode: 200, header: {}, bodyText: '', body: { nope: true } }) as ApiCallResult,
      captureCurrent: () => () => true,
    });
    await expect(invalid(file)).rejects.toMatchObject({ code: 'invalid_response' });

    const stale = createCommandCodeQuotaFetcher({
      request: async () =>
        ({ statusCode: 200, header: {}, bodyText: '', body: creditsResponse }) as ApiCallResult,
      captureCurrent: () => () => false,
    });
    await expect(stale(file)).rejects.toMatchObject({ code: 'stale_request' });
  });

  test('feeds reset schedule and timeline from consumed windows', () => {
    const quota = COMMAND_CODE_CONFIG.buildSuccessState(
      parseCommandCodeQuotaPayload(creditsResponse)!
    );
    const instants = collectQuotaRowInstants('commandcode', quota);
    expect(instants.map((instant) => instant.rowId)).toEqual(['fiveHour', 'weekly']);

    const lane = buildTimelineLane({
      name: file.name,
      displayName: 'command-code',
      provider: 'commandcode',
      quota,
    });
    expect(lane.remaining).not.toBeNull();
    expect(lane.limits.map((limit) => limit.label)).toEqual([
      'commandcode_quota.fiveHour',
      'commandcode_quota.weekly',
    ]);
  });
});
