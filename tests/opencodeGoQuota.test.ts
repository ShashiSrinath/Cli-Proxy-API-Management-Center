import { afterEach, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import type { AuthFileItem } from '@/types';
import type { ApiCallRequest, ApiCallResult } from '@/services/api/apiCall';
import { parseOpencodeGoQuotaPayload } from '@/services/api/opencodeGoQuota';
import { OpencodeGoQuotaBody } from '@/features/quota/providers/opencode-go/OpencodeGoQuotaBody';
import { OPENCODE_GO_CONFIG } from '@/features/quota/providers/opencode-go/data';
import {
  createOpencodeGoQuotaFetcher,
  OpencodeGoQuotaError,
} from '@/features/quota/providers/opencode-go/requests';
import { QUOTA_CLASS_KEYS, bindQuotaClasses } from '@/features/quota/types';
import { buildTabCounts, classifyQuotaFiles } from '@/features/quota/logic';
import { collectQuotaRowInstants } from '@/features/quota/resetSchedule';
import { buildTimelineLane } from '@/features/quota/quotaTimelineModel';
import { withoutConfigSourcedAuthFiles } from '@/features/authFiles/constants';
import { getQuotaDisplayName } from '@/utils/quota/identity';
import { useQuotaStore } from '@/stores/useQuotaStore';

// Captured from https://opencode.ai/zen/go/v1/usage.
const usageResponse = {
  usage: {
    rolling: { status: 'ok', percent: 8, resetsAt: '2026-10-05T02:09:54.000Z' },
    weekly: { status: 'ok', percent: 2, resetsAt: '2026-10-12T00:00:00.000Z' },
    monthly: { status: 'ok', percent: 12, resetsAt: '2026-11-04T09:01:38.000Z' },
  },
};

const probe = {
  url: 'https://opencode.ai/zen/go/v1/usage',
  headers: { Authorization: 'Bearer $TOKEN$', 'User-Agent': 'cli-proxy-api/test' },
};

// Shape of a config credential as listed by GET /v8/management/credentials.
const file: AuthFileItem = {
  name: 'openai-compatibility:opencode-go:abc123',
  type: 'openai-compatible-my-go',
  provider: 'openai-compatible-my-go',
  label: 'my-go',
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

describe('OpenCode Go quota', () => {
  test('provides labels in all four locales', () => {
    for (const locale of ['en', 'zh-CN', 'zh-TW', 'ru']) {
      const translations = JSON.parse(readFileSync(`src/i18n/locales/${locale}.json`, 'utf8'));
      expect(translations.auth_files['filter_opencode-go']).toBeTruthy();
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
        'rolling',
        'weekly',
        'monthly',
        'unknown',
        'remaining',
      ]) {
        expect(translations.opencode_go_quota[key]).toBeTruthy();
      }
    }
  });

  test('detects credentials by quota probe regardless of entry name and skips disabled ones', () => {
    expect(OPENCODE_GO_CONFIG.filterFn(file)).toBe(true);
    expect(OPENCODE_GO_CONFIG.filterFn({ ...file, disabled: true })).toBe(false);
    expect(OPENCODE_GO_CONFIG.filterFn({ name: 'x', type: 'openai-compatible-openrouter' })).toBe(
      false
    );
    const entries = classifyQuotaFiles([file]);
    expect(entries).toEqual([{ file, type: 'opencode-go' }]);
    expect(buildTabCounts(entries)['opencode-go']).toBe(1);
    expect(getQuotaDisplayName(file)).toBe('my-go · idx-1');
  });

  test('config credentials stay out of file views', () => {
    const regular: AuthFileItem = { name: 'codex.json', type: 'codex', source: 'file' };
    expect(withoutConfigSourcedAuthFiles([file, regular])).toEqual([regular]);
  });

  test('parses usage windows and rejects invalid bodies', () => {
    const data = parseOpencodeGoQuotaPayload(JSON.stringify(usageResponse))!;
    expect(data.windows.map((window) => [window.id, window.usedPercent])).toEqual([
      ['rolling', 8],
      ['weekly', 2],
      ['monthly', 12],
    ]);
    expect(data.windows[0].resetAt).toBe(Date.parse('2026-10-05T02:09:54.000Z') / 1000);
    expect(parseOpencodeGoQuotaPayload({ error: 'nope' })).toBeNull();
    expect(parseOpencodeGoQuotaPayload('not json')).toBeNull();
  });

  test('renders remaining meters for each window', () => {
    const quota = OPENCODE_GO_CONFIG.buildSuccessState(parseOpencodeGoQuotaPayload(usageResponse)!);
    const markup = renderToStaticMarkup(createElement(OpencodeGoQuotaBody, { quota, classes }));
    expect(markup).toContain(i18n.t('opencode_go_quota.rolling'));
    expect(markup).toContain(i18n.t('opencode_go_quota.monthly'));
    expect(markup.match(/role="meter"/g)).toHaveLength(3);
    expect(markup).toContain('aria-valuenow="92"');
    expect(markup).toContain('aria-valuenow="98"');
    expect(markup).toContain('aria-valuenow="88"');
  });

  test('shows unknown quota instead of full meters when windows are missing', () => {
    const quota = OPENCODE_GO_CONFIG.buildSuccessState(parseOpencodeGoQuotaPayload({ usage: {} })!);
    const markup = renderToStaticMarkup(createElement(OpencodeGoQuotaBody, { quota, classes }));
    expect(markup).toContain(i18n.t('opencode_go_quota.empty_data'));
    expect(markup).not.toContain('role="meter"');
  });

  test('fetches through api-call with the backend probe url and headers', async () => {
    const requests: ApiCallRequest[] = [];
    const fetchQuota = createOpencodeGoQuotaFetcher({
      request: async (payload) => {
        requests.push(payload);
        return { statusCode: 200, header: {}, bodyText: '', body: usageResponse } as ApiCallResult;
      },
      captureCurrent: () => () => true,
    });
    const data = await fetchQuota(file);
    expect(data.windows).toHaveLength(3);
    expect(requests).toEqual([
      { authIndex: 'idx-1', method: 'GET', url: probe.url, header: probe.headers },
    ]);
  });

  test('maps failures to typed errors', async () => {
    const failing = createOpencodeGoQuotaFetcher({
      request: async () =>
        ({ statusCode: 401, header: {}, bodyText: '', body: null }) as ApiCallResult,
      captureCurrent: () => () => true,
    });
    await expect(failing(file)).rejects.toMatchObject({ code: 'request_failed', status: 401 });
    await expect(failing({ ...file, authIndex: undefined })).rejects.toBeInstanceOf(
      OpencodeGoQuotaError
    );

    const stale = createOpencodeGoQuotaFetcher({
      request: async () =>
        ({ statusCode: 200, header: {}, bodyText: '', body: usageResponse }) as ApiCallResult,
      captureCurrent: () => () => false,
    });
    await expect(stale(file)).rejects.toMatchObject({ code: 'stale_request' });
  });

  test('feeds reset schedule and timeline from consumed windows', () => {
    const quota = OPENCODE_GO_CONFIG.buildSuccessState(parseOpencodeGoQuotaPayload(usageResponse)!);
    const instants = collectQuotaRowInstants('opencode-go', quota);
    expect(instants.map((instant) => instant.rowId)).toEqual(['rolling', 'weekly', 'monthly']);

    const lane = buildTimelineLane({
      name: file.name,
      displayName: 'my-go',
      provider: 'opencode-go',
      quota,
    });
    expect(lane.remaining).not.toBeNull();
    expect(lane.limits.map((limit) => limit.label)).toEqual([
      'opencode_go_quota.rolling',
      'opencode_go_quota.weekly',
      'opencode_go_quota.monthly',
    ]);
  });
});
