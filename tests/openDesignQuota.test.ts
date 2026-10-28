import { describe, expect, test } from 'bun:test';
import {
  isOpenDesignFile,
  isCommandCodeFile,
  isOpencodeGoFile,
} from '../src/utils/quota/validators';
import {
  createOpenDesignRequests,
  mapOpenDesignError,
  normalizeOpenDesignUsage,
} from '../src/features/quota/providers/opendesign/requests';

describe('OpenDesign quota', () => {
  test('detects listing metadata and provider names without matching other providers', () => {
    const file = {
      name: 'credential',
      provider: 'openai-compatible-opendesign go 1',
      opendesign: { connected: false },
      quota_probe: { url: 'https://api.commandcode.ai' },
    };
    expect(isOpenDesignFile(file)).toBe(true);
    expect(isCommandCodeFile(file)).toBe(false);
    expect(isOpencodeGoFile(file)).toBe(false);
    expect(isOpenDesignFile({ name: 'a', provider: 'openai-compatible-opendesign go 1' })).toBe(
      true
    );
    expect(isOpenDesignFile({ name: 'a', opendesign: { connected: true } })).toBe(true);
    expect(isOpenDesignFile({ name: 'a', provider: 'codex' })).toBe(false);
  });
  test('normalizes windows and wallet', () => {
    expect(
      normalizeOpenDesignUsage({
        windows: [
          {
            label: '5h',
            used_credits: 9840,
            limit_credits: 50000,
            remaining_credits: 40160,
            resets_at: '2026-10-28T18:13:41.000Z',
          },
        ],
        wallet: { balance_usd: 0 },
      })
    ).toEqual({
      windows: [
        {
          label: '5h',
          used: 9840,
          limit: 50000,
          remaining: 40160,
          resetsAt: '2026-10-28T18:13:41.000Z',
        },
      ],
      wallet: 0,
    });
    expect(() => normalizeOpenDesignUsage({ windows: [], wallet: {} })).toThrow();
  });
  test('maps disconnected and expired errors', () => {
    expect(mapOpenDesignError({ status: 409 }).code).toBe('opendesign_not_connected');
    expect(mapOpenDesignError({ status: 412 }).code).toBe('opendesign_session_expired');
    expect(
      mapOpenDesignError({ status: 422, data: { code: 'opendesign_session_invalid' } }).code
    ).toBe('opendesign_session_invalid');
  });
  test('sends raw trimmed paste in management connect payload', async () => {
    let request: unknown;
    const client = {
      get: async <T>() => ({}) as T,
      delete: async <T>() => ({}) as T,
      post: async <T>(url: string, body: unknown) => {
        request = { url, body };
        return {} as T;
      },
    };
    await createOpenDesignRequests(client).connect('index-1', '  curl example\n -H cookie  ');
    expect(request).toEqual({
      url: '/opendesign/connect',
      body: { auth_index: 'index-1', session: 'curl example\n -H cookie' },
    });
  });
});
