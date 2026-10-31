import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '../src/i18n/index';
import { apiClient } from '../src/services/api/client';
import {
  normalizePlansResponse,
  normalizePlansRouting,
  serializeSubscriptionPlan,
  usagePlansApi,
} from '../src/services/api/usagePlans';
import {
  buildRoutingRows,
  countdown,
  describeFullReset,
  formatDuration,
  routingByAuthId,
  routingReason,
  routingStatus,
  windowCreditsLeft,
  windowLabelKey,
  windowUsedFraction,
} from '../src/features/plans/routing';
import { projectWindow } from '../src/features/plans/utils';
import { PlanCard } from '../src/features/plans/PlanCard';
import { RoutingPanel } from '../src/features/plans/RoutingPanel';
import type {
  PlansResponse,
  PlansRouting,
  PlanValue,
  RoutingOrderEntry,
  SubscriptionPlan,
} from '../src/types/plans';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-11-01T00:00:00Z');
const at = (ms: number, base = NOW) => new Date(base + ms).toISOString();

function entry(overrides: Partial<RoutingOrderEntry>): RoutingOrderEntry {
  return {
    rank: 1,
    auth_id: 'a',
    label: 'Cred',
    provider: 'openai-compatible-opendesign go 1',
    plan_id: 'p',
    plan_name: 'Plan',
    priority: 2000,
    limit_type: 'weekly',
    limit_type_source: 'auto',
    routing: 'auto',
    full_reset_at: at(2 * DAY),
    full_reset_estimated: false,
    remaining_fraction: 0.5,
    state: 'active',
    paused_until: '',
    paused_window: '',
    ...overrides,
  };
}

const scenario: RoutingOrderEntry[] = [
  entry({ rank: 1, auth_id: 'pref', routing: 'prefer', limit_type: 'monthly' }),
  entry({ rank: 2, auth_id: 'w1', full_reset_at: at(1 * DAY) }),
  entry({ rank: 3, auth_id: 'w2', full_reset_at: at(1 * DAY + 20_000), remaining_fraction: 0.2 }),
  entry({ rank: 4, auth_id: 'w3', full_reset_at: at(3 * DAY) }),
  entry({ rank: 5, auth_id: 'w4', full_reset_at: at(7 * DAY), full_reset_estimated: true }),
  entry({ rank: 6, auth_id: 'm1', limit_type: 'monthly', full_reset_at: at(4 * DAY) }),
  entry({ rank: 7, auth_id: 'avoid', routing: 'avoid' }),
  entry({
    rank: 8,
    auth_id: 'paused',
    state: 'paused',
    paused_window: 'Weekly',
    paused_until: at(2 * DAY + 3 * HOUR),
  }),
  entry({ rank: 9, auth_id: 'off', state: 'disabled' }),
];

describe('routing time formatting', () => {
  test('formats compact durations', () => {
    expect(formatDuration(2 * DAY + 4 * HOUR + 30 * MIN)).toBe('2d 4h');
    expect(formatDuration(3 * DAY)).toBe('3d');
    expect(formatDuration(3 * HOUR + 12 * MIN)).toBe('3h 12m');
    expect(formatDuration(5 * HOUR)).toBe('5h');
    expect(formatDuration(45 * MIN + 10_000)).toBe('45m');
    expect(formatDuration(30_000)).toBe('<1m');
    expect(formatDuration(-HOUR)).toBe('<1m');
    expect(formatDuration(Number.NaN)).toBe('<1m');
  });

  test('counts down to timestamps and tolerates missing values', () => {
    expect(countdown(at(2 * DAY + 3 * HOUR), NOW)).toBe('2d 3h');
    expect(countdown('', NOW)).toBeNull();
    expect(countdown('not a date', NOW)).toBeNull();
  });

  test('describes the full reset, including estimated and unknown resets', () => {
    expect(describeFullReset(entry({ full_reset_at: at(2 * DAY + 4 * HOUR) }), NOW)).toEqual({
      kind: 'in',
      duration: '2d 4h',
      estimated: false,
    });
    expect(
      describeFullReset(entry({ full_reset_at: at(7 * DAY), full_reset_estimated: true }), NOW)
    ).toEqual({ kind: 'in', duration: '7d', estimated: true });
    expect(describeFullReset(entry({ full_reset_at: '' }), NOW)).toEqual({ kind: 'unknown' });
    expect(describeFullReset(entry({ full_reset_at: at(-HOUR) }), NOW)).toEqual({ kind: 'due' });
  });

  test('maps backend window labels to localized window names', () => {
    expect(windowLabelKey('Weekly')).toBe('weekly');
    expect(windowLabelKey('5 hour')).toBe('fiveHour');
    expect(windowLabelKey('Monthly')).toBe('monthly');
    expect(windowLabelKey('')).toBeNull();
    expect(windowLabelKey('Credits')).toBeNull();
  });
});

describe('routing row status and reasons', () => {
  test('labels the serving, next, standby, paused and disabled rows', () => {
    expect(routingStatus({ state: 'active' }, 0)).toBe('serving');
    expect(routingStatus({ state: 'active' }, 1)).toBe('next');
    expect(routingStatus({ state: 'active' }, 4)).toBe('standby');
    expect(routingStatus({ state: 'paused' }, 0)).toBe('paused');
    expect(routingStatus({ state: 'disabled' }, 0)).toBe('disabled');
  });

  test('derives a human reason for each rule', () => {
    const { active, inactive } = buildRoutingRows(
      { enabled: true, computed_at: '', refresh_seconds: 120, order: scenario },
      NOW
    );
    const reasons = Object.fromEntries(
      [...active, ...inactive].map((r) => [r.entry.auth_id, r.reason])
    );
    expect(reasons).toEqual({
      pref: 'preferred',
      w1: 'weeklySoonest',
      w2: 'tieHeadroom',
      w3: 'weeklyLater',
      w4: 'weeklyNotStarted',
      m1: 'monthlyAfterWeekly',
      avoid: 'avoided',
      paused: 'paused',
      off: 'disabled',
    });
    expect(active.map((r) => r.status)).toEqual([
      'serving',
      'next',
      'standby',
      'standby',
      'standby',
      'standby',
      'standby',
    ]);
    expect(inactive.map((r) => r.status)).toEqual(['paused', 'disabled']);
  });

  test('monthly caps without weekly plans above get their own reasons', () => {
    const m1 = entry({ auth_id: 'm1', limit_type: 'monthly', full_reset_at: at(DAY) });
    const m2 = entry({ auth_id: 'm2', limit_type: 'monthly', full_reset_at: at(5 * DAY) });
    const m3 = entry({ auth_id: 'm3', limit_type: 'monthly', full_reset_estimated: true });
    expect(routingReason(m1, [], true)).toBe('monthlySoonest');
    expect(routingReason(m2, [m1], true)).toBe('monthlyLater');
    expect(routingReason(m3, [m1, m2], true)).toBe('monthlyNotStarted');
    // Preferred weekly plans do not push auto monthly plans into "after weekly".
    const preferredWeekly = entry({ auth_id: 'pw', routing: 'prefer' });
    expect(routingReason(m1, [preferredWeekly], true)).toBe('monthlySoonest');
  });

  test('explains manual ordering when smart routing is off', () => {
    const rows = buildRoutingRows(
      { enabled: false, computed_at: '', refresh_seconds: 0, order: scenario },
      NOW
    );
    expect(rows.active.every((r) => r.reason === 'manual')).toBe(true);
    expect(rows.active[0].status).toBe('serving');
    expect(rows.inactive.map((r) => r.reason)).toEqual(['paused', 'disabled']);
  });

  test('indexes routing entries by credential and tolerates missing routing', () => {
    expect(routingByAuthId(null).size).toBe(0);
    expect(
      routingByAuthId({ enabled: true, computed_at: '', refresh_seconds: 0, order: scenario }).get(
        'w2'
      )?.rank
    ).toBe(3);
  });
});

describe('window null handling', () => {
  const unknownWindow = {
    key: 'monthly',
    label: 'Monthly',
    window_start: '',
    resets_at: '',
    used_fraction: null,
    value_usd: 0,
    est_capacity_usd: null,
    est_headroom_usd: null,
    provider_used: null,
    provider_limit: null,
    provider_remaining: 12.5,
    unit: 'usd' as const,
    exhausted: false,
  };

  test('reports unknown usage and remaining USD credits', () => {
    expect(windowUsedFraction(unknownWindow)).toBeNull();
    expect(windowUsedFraction({ used_fraction: 0.4 })).toBe(0.4);
    expect(windowCreditsLeft(unknownWindow)).toBe(12.5);
    expect(windowCreditsLeft({ ...unknownWindow, unit: 'credits' })).toBeNull();
    expect(windowCreditsLeft({ ...unknownWindow, provider_remaining: null })).toBeNull();
    expect(projectWindow(unknownWindow)).toBeNull();
  });
});

describe('plans API normalization', () => {
  test('hides routing for servers that predate smart routing', () => {
    const old = normalizePlansResponse({ enabled: true, plans: [] } as unknown as PlansResponse);
    expect(old.routing).toBeNull();
    expect(normalizePlansRouting(undefined)).toBeNull();
    expect(normalizePlansRouting([])).toBeNull();
  });

  test('normalizes routing entries defensively', () => {
    const routing = normalizePlansRouting({
      computed_at: '2026-11-01T00:00:00Z',
      order: [
        { rank: 2, auth_id: 'b', limit_type: 'monthly', state: 'paused', remaining_fraction: 1.4 },
        { rank: 1, auth_id: 'a', routing: 'prefer', remaining_fraction: null },
        { rank: 3 },
        'junk',
      ],
    })!;
    expect(routing.enabled).toBe(true);
    expect(routing.order.map((e) => e.auth_id)).toEqual(['a', 'b']);
    expect(routing.order[0]).toMatchObject({
      routing: 'prefer',
      remaining_fraction: null,
      state: 'active',
    });
    expect(routing.order[1]).toMatchObject({
      limit_type: 'monthly',
      state: 'paused',
      remaining_fraction: 1,
    });
    expect(normalizePlansRouting({ enabled: false })?.enabled).toBe(false);
  });

  test('keeps null used fractions and adds provider_remaining for old windows', () => {
    const res = normalizePlansResponse({
      enabled: true,
      plans: [
        {
          id: 'cc',
          limit_type: 'bogus',
          credentials: [
            {
              auth_id: 'x',
              windows: [
                { key: 'monthly', used_fraction: null, provider_remaining: 3, unit: 'usd' },
                { key: 'weekly', used_fraction: 0.25, unit: 'usd' },
              ],
            },
          ],
        },
      ],
    } as unknown as PlansResponse);
    const [w1, w2] = res.plans[0].credentials[0].windows;
    expect(w1.used_fraction).toBeNull();
    expect(w1.provider_remaining).toBe(3);
    expect(w2.used_fraction).toBe(0.25);
    expect(w2.provider_remaining).toBeNull();
    expect(res.plans[0].limit_type).toBeUndefined();
  });

  test('serializes plan routing fields without dropping unknown keys', () => {
    const plan = {
      id: 'a',
      name: 'A',
      provider: 'claude',
      'price-usd': 20,
      'limit-type': '',
      routing: 'prefer',
      'future-field': 1,
    } as unknown as SubscriptionPlan;
    const out = serializeSubscriptionPlan(plan) as unknown as Record<string, unknown>;
    expect(out['limit-type']).toBeUndefined();
    expect(out.routing).toBe('prefer');
    expect(out['future-field']).toBe(1);
  });

  test('update preserves routing fields of plans it does not touch', async () => {
    const stored = [
      {
        id: 'a',
        name: 'A',
        provider: 'claude',
        'price-usd': 20,
        'limit-type': 'monthly',
        routing: 'avoid',
      },
      { id: 'b', name: 'B', provider: 'codex', 'price-usd': 20 },
    ];
    const get = spyOn(apiClient, 'get').mockResolvedValue(stored as never);
    const put = spyOn(apiClient, 'put').mockResolvedValue(undefined as never);
    try {
      await usagePlansApi.update((plans) =>
        plans.map((p) => (p.id === 'b' ? { ...p, name: 'B2', routing: '' } : p))
      );
      expect(put).toHaveBeenCalledWith('/config/observability/usage/tracking/subscriptions', [
        stored[0],
        { id: 'b', name: 'B2', provider: 'codex', 'price-usd': 20 },
      ]);
    } finally {
      get.mockRestore();
      put.mockRestore();
    }
  });

  test('toggles smart routing through the v8 config path', async () => {
    const put = spyOn(apiClient, 'put').mockResolvedValue(undefined as never);
    try {
      await usagePlansApi.setSmartRouting(false);
      expect(put).toHaveBeenCalledWith('/config/observability/usage/tracking/smart-routing', false);
    } finally {
      put.mockRestore();
    }
  });
});

describe('routing UI static rendering', () => {
  let previousLanguage = 'en';
  beforeAll(async () => {
    previousLanguage = i18n.language;
    await i18n.changeLanguage('en');
  });
  afterAll(async () => {
    await i18n.changeLanguage(previousLanguage);
  });

  // Rendering uses the real clock, so build times relative to now.
  const live = (): PlansRouting => {
    const now = Date.now();
    return {
      enabled: true,
      computed_at: new Date(now - 3 * MIN).toISOString(),
      refresh_seconds: 120,
      order: [
        entry({
          rank: 1,
          auth_id: 'w1',
          label: 'Opendesign Go 1',
          full_reset_at: at(DAY + 4 * HOUR + MIN, now),
        }),
        entry({
          rank: 2,
          auth_id: 'pref2',
          routing: 'prefer',
          limit_type: 'monthly',
          limit_type_source: 'config',
          full_reset_at: at(7 * DAY + MIN, now),
          full_reset_estimated: true,
          remaining_fraction: null,
        }),
        entry({
          rank: 3,
          auth_id: 'p',
          state: 'paused',
          paused_window: 'Weekly',
          paused_until: at(2 * DAY + 3 * HOUR + MIN, now),
        }),
      ],
    };
  };

  test('renders the ranked list with states, chips and reasons', () => {
    const html = renderToStaticMarkup(
      createElement(RoutingPanel, { routing: live(), onToggle: () => {} })
    );
    expect(html).toContain('Routing order');
    expect(html).toContain('Serving now');
    expect(html).toContain('Next up');
    expect(html).toContain('Paused — weekly limit hit, back in 2d 3h');
    expect(html).toContain('Full reset in 1d 4h');
    expect(html).toContain('≈ full reset in 7d (not started)');
    expect(html).toContain('Weekly limit');
    expect(html).toContain('set manually');
    expect(html).toContain('Preferred');
    expect(html).toContain('50% left');
    expect(html).toContain('Weekly-only plan resetting soonest');
    expect(html).toContain('Paused &amp; disabled (1)');
    expect(html).not.toContain('manual priority.</p>');
  });

  test('explains manual priority when smart routing is off', () => {
    const html = renderToStaticMarkup(
      createElement(RoutingPanel, { routing: { ...live(), enabled: false }, onToggle: () => {} })
    );
    expect(html).toContain('Smart routing is off');
    expect(html).toContain('Ordered by manual priority');
  });

  test('plan cards show routing badges and survive null used fractions', () => {
    const plan = {
      id: 'cc',
      name: 'Command Code',
      provider: 'openai-compatible-command code',
      price_usd: 20,
      value_usd: 0,
      cycle_end: '',
      elapsed_days: 0,
      length_days: 30,
      multiplier: null,
      limit_type: 'monthly',
      limit_type_source: 'auto',
      routing: 'avoid',
      credentials: [
        {
          auth_id: 'w1',
          label: 'Command Code · user…bqri',
          windows: [
            {
              key: 'monthly',
              label: 'Monthly',
              window_start: '',
              resets_at: '',
              used_fraction: null,
              value_usd: 0,
              provider_remaining: 12.5,
              unit: 'usd',
              exhausted: false,
            },
          ],
        },
      ],
    } as unknown as PlanValue;
    const html = renderToStaticMarkup(
      createElement(PlanCard, {
        plan,
        onEdit: () => {},
        isDark: false,
        routing: routingByAuthId(live()),
      })
    );
    expect(html).toContain('Routing #1');
    expect(html).toContain('Monthly limit');
    expect(html).toContain('Avoided');
    expect(html).toContain('≈$12.50 credits left');
    expect(html).not.toContain('NaN');
  });
});
