import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '../src/i18n/index';
import { KeyRoutingPanel } from '../src/features/routing/KeyRoutingPanel';
import {
  openAICompatibleProviderKey,
  providerAllowed,
  routingOrderForKey,
} from '../src/features/routing/keyRouting';
import type { KeyBudgetRow } from '../src/types/keyBudgets';
import type { PlansRouting, RoutingOrderEntry } from '../src/types/plans';

function entry(overrides: Partial<RoutingOrderEntry>): RoutingOrderEntry {
  return {
    rank: 1,
    auth_id: 'a',
    label: 'Cred',
    provider: 'claude',
    plan_id: 'p',
    plan_name: 'Plan',
    priority: 1000,
    limit_type: 'weekly',
    limit_type_source: 'auto',
    routing: 'auto',
    full_reset_at: '',
    full_reset_estimated: false,
    remaining_fraction: 0.5,
    state: 'active',
    paused_until: '',
    paused_window: '',
    ...overrides,
  };
}

function key(overrides: Partial<KeyBudgetRow>): KeyBudgetRow {
  return {
    id: 'k_1',
    masked: 'sk-…abcd',
    name: '',
    models: [],
    providers: [],
    limits: null,
    windows: [],
    exceeded: false,
    ...overrides,
  };
}

const routing: PlansRouting = {
  enabled: true,
  computed_at: '',
  refresh_seconds: 120,
  order: [
    entry({ rank: 1, auth_id: 'claude1', provider: 'claude', label: 'Claude Pro' }),
    entry({ rank: 2, auth_id: 'codex1', provider: 'codex', label: 'ChatGPT Plus' }),
    entry({
      rank: 3,
      auth_id: 'od1',
      provider: 'openai-compatible-opendesign go 1',
      label: 'OpenDesign',
    }),
    entry({
      rank: 4,
      auth_id: 'cc1',
      provider: 'openai-compatible-command code',
      label: 'Command Code',
    }),
  ],
};

describe('provider allow-list matching', () => {
  test('mirrors the backend openai-compatible key', () => {
    expect(openAICompatibleProviderKey('')).toBe('openai-compatibility');
    expect(openAICompatibleProviderKey('Open Design')).toBe('openai-compatible-open design');
    expect(openAICompatibleProviderKey('openai-compatibility')).toBe('openai-compatibility');
    expect(openAICompatibleProviderKey('openai-compatible-command code')).toBe(
      'openai-compatible-command code'
    );
  });

  test('treats empty lists as unrestricted and matches exact provider ids', () => {
    expect(providerAllowed('claude', [])).toBe(true);
    expect(providerAllowed('claude', null)).toBe(true);
    expect(providerAllowed('claude', ['claude'])).toBe(true);
    expect(providerAllowed('Claude', [' CLauDE '])).toBe(true);
    expect(providerAllowed('codex', ['claude'])).toBe(false);
    expect(providerAllowed('', ['claude'])).toBe(false);
  });

  test('matches compatibility names, prefixed keys and the family entry', () => {
    const provider = 'openai-compatible-opendesign go 1';
    expect(providerAllowed(provider, ['opendesign go 1'])).toBe(true);
    expect(providerAllowed(provider, ['openai-compatible-opendesign go 1'])).toBe(true);
    expect(providerAllowed(provider, ['openai-compatibility'])).toBe(true);
    expect(providerAllowed(provider, ['claude'])).toBe(false);
    expect(providerAllowed('claude', ['openai-compatibility'])).toBe(false);
  });
});

describe('per-key routing order', () => {
  test('keeps only allowed credentials and renumbers them per key', () => {
    const view = routingOrderForKey(routing, ['claude', 'codex', 'extra']);
    expect(view.order.map((e) => e.auth_id)).toEqual(['claude1', 'codex1']);
    expect(view.order.map((e) => e.rank)).toEqual([1, 2]);
    expect(view.hidden).toBe(2);
  });

  test('an unrestricted key sees the full global order', () => {
    const view = routingOrderForKey(routing, []);
    expect(view.order.map((e) => e.rank)).toEqual([1, 2, 3, 4]);
    expect(view.hidden).toBe(0);
  });

  test('an allow-list that matches nothing yields an empty order', () => {
    const view = routingOrderForKey(routing, ['gemini']);
    expect(view.order).toEqual([]);
    expect(view.hidden).toBe(4);
  });

  test('does not mutate the input order', () => {
    routingOrderForKey(routing, ['codex']);
    expect(routing.order.map((e) => e.auth_id)).toEqual(['claude1', 'codex1', 'od1', 'cc1']);
  });
});

describe('per-key routing panel rendering', () => {
  let previousLanguage = 'en';
  beforeAll(async () => {
    previousLanguage = i18n.language;
    await i18n.changeLanguage('en');
  });
  afterAll(async () => {
    await i18n.changeLanguage(previousLanguage);
  });

  test('shows the selected key order filtered by its allow-list', () => {
    const html = renderToStaticMarkup(
      createElement(KeyRoutingPanel, {
        routing,
        keys: [key({ id: 'k_laptop', name: 'Laptop', providers: ['claude'] })],
      })
    );
    expect(html).toContain('Per API key');
    expect(html).toContain('Claude Pro');
    expect(html).toContain('Allowed providers:');
    expect(html).toContain('Hidden by this key&#x27;s provider allow-list: 3');
    expect(html).not.toContain('ChatGPT Plus');
    expect(html).not.toContain('Command Code');
  });

  test('an unrestricted key shows the full order', () => {
    const html = renderToStaticMarkup(
      createElement(KeyRoutingPanel, {
        routing,
        keys: [key({ id: 'k_shared', masked: 'sk-…zzzz' })],
      })
    );
    expect(html).toContain('Not restricted — follows the full order');
    expect(html).toContain('Claude Pro');
    expect(html).toContain('ChatGPT Plus');
    expect(html).toContain('Command Code');
    expect(html).not.toContain('Hidden by this key');
  });

  test('explains a key whose providers serve no plan credential', () => {
    const html = renderToStaticMarkup(
      createElement(KeyRoutingPanel, {
        routing,
        keys: [key({ id: 'k_gemini', providers: ['gemini'] })],
      })
    );
    expect(html).toContain('No plan credential uses a provider this key is allowed to.');
  });

  test('notes when no client API keys are configured', () => {
    const html = renderToStaticMarkup(createElement(KeyRoutingPanel, { routing, keys: [] }));
    expect(html).toContain('No client API keys are configured.');
  });
});
