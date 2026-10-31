import type {
  PlanCredential,
  PlanLimitType,
  PlanRoutingMode,
  PlansResponse,
  PlansRouting,
  PlanValue,
  PlanWindow,
  RoutingEntryState,
  RoutingOrderEntry,
  SubscriptionPlan,
} from '@/types/plans';
import { useConfigStore } from '@/stores/useConfigStore';
import { apiClient } from './client';
import { getConfigValue, guardConfigConnection } from './configValue';

const CONFIG = '/config/observability/usage/tracking/subscriptions';
const SMART_ROUTING_CONFIG = '/config/observability/usage/tracking/smart-routing';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const finiteOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const num = (value: unknown, fallback = 0): number => finiteOrNull(value) ?? fallback;

const limitType = (value: unknown): PlanLimitType | undefined =>
  value === 'weekly' || value === 'monthly' ? value : undefined;
const routingMode = (value: unknown): PlanRoutingMode =>
  value === 'prefer' || value === 'avoid' ? value : 'auto';
const limitSource = (value: unknown): 'auto' | 'config' => (value === 'config' ? 'config' : 'auto');
const entryState = (value: unknown): RoutingEntryState =>
  value === 'paused' || value === 'disabled' ? value : 'active';

function normalizeWindow(raw: PlanWindow): PlanWindow {
  return {
    ...raw,
    used_fraction: finiteOrNull(raw.used_fraction),
    provider_used: finiteOrNull(raw.provider_used),
    provider_limit: finiteOrNull(raw.provider_limit),
    provider_remaining: finiteOrNull(raw.provider_remaining),
    est_capacity_usd: finiteOrNull(raw.est_capacity_usd),
    est_headroom_usd: finiteOrNull(raw.est_headroom_usd),
    value_usd: num(raw.value_usd),
    exhausted: raw.exhausted === true,
  };
}

function normalizePlan(raw: PlanValue): PlanValue {
  const plan: PlanValue = {
    ...raw,
    credentials: (raw.credentials ?? []).map((c): PlanCredential => ({
      ...c,
      windows: (c.windows ?? []).map(normalizeWindow),
    })),
  };
  const type = limitType(raw.limit_type);
  if (type) {
    plan.limit_type = type;
    plan.limit_type_source = limitSource(raw.limit_type_source);
  } else {
    delete plan.limit_type;
    delete plan.limit_type_source;
  }
  if (raw.routing !== undefined) plan.routing = routingMode(raw.routing);
  return plan;
}

function normalizeRoutingEntry(raw: unknown, index: number): RoutingOrderEntry | null {
  if (!isRecord(raw)) return null;
  const authId = str(raw.auth_id);
  if (!authId) return null;
  const remaining = finiteOrNull(raw.remaining_fraction);
  return {
    rank: num(raw.rank, index + 1),
    auth_id: authId,
    label: str(raw.label),
    provider: str(raw.provider),
    plan_id: str(raw.plan_id),
    plan_name: str(raw.plan_name),
    priority: num(raw.priority),
    limit_type: limitType(raw.limit_type) ?? 'weekly',
    limit_type_source: limitSource(raw.limit_type_source),
    routing: routingMode(raw.routing),
    full_reset_at: str(raw.full_reset_at),
    full_reset_estimated: raw.full_reset_estimated === true,
    remaining_fraction: remaining == null ? null : Math.min(1, Math.max(0, remaining)),
    state: entryState(raw.state),
    paused_until: str(raw.paused_until),
    paused_window: str(raw.paused_window),
  };
}

/** Normalize the optional routing block; null when the server predates smart routing. */
export function normalizePlansRouting(raw: unknown): PlansRouting | null {
  if (!isRecord(raw)) return null;
  const order = (Array.isArray(raw.order) ? raw.order : [])
    .map(normalizeRoutingEntry)
    .filter((e): e is RoutingOrderEntry => e !== null)
    .sort((a, b) => a.rank - b.rank);
  return {
    enabled: raw.enabled !== false,
    computed_at: str(raw.computed_at),
    refresh_seconds: num(raw.refresh_seconds),
    order,
  };
}

export function normalizePlansResponse(data: PlansResponse): PlansResponse {
  return {
    ...data,
    plans: (data.plans ?? []).map(normalizePlan),
    unassigned: data.unassigned ?? [],
    available_credentials: data.available_credentials ?? [],
    providers: data.providers ?? [],
    pricing: data.pricing ?? { source: '', fetched_at: '', catalog_size: 0, error: '' },
    totals: data.totals ?? {
      price_usd: 0,
      value_usd: 0,
      multiplier: null,
      projected_value_usd: 0,
      unassigned_value_usd: 0,
    },
    routing: normalizePlansRouting((data as { routing?: unknown }).routing),
  };
}

/** Normalize a configured plan on read, keeping unknown keys intact. */
export function normalizeSubscriptionPlan(raw: SubscriptionPlan): SubscriptionPlan {
  const plan: SubscriptionPlan = { ...raw };
  const type = limitType(raw['limit-type']);
  const routing = raw.routing === 'prefer' || raw.routing === 'avoid' ? raw.routing : undefined;
  if (type) plan['limit-type'] = type;
  else delete plan['limit-type'];
  if (routing) plan.routing = routing;
  else delete plan.routing;
  return plan;
}

/** Serialize a configured plan for write: auto values are omitted rather than stored as "". */
export const serializeSubscriptionPlan = normalizeSubscriptionPlan;

export const usagePlansApi = {
  async get(tz: string, cycleOffset: number): Promise<PlansResponse> {
    const data = await apiClient.get<PlansResponse>('/observability/usage/plans', {
      params: { tz, cycle_offset: cycleOffset },
    });
    return normalizePlansResponse(data);
  },
  async update(change: (plans: SubscriptionPlan[]) => SubscriptionPlan[]): Promise<void> {
    const guard = guardConfigConnection();
    const current = await getConfigValue<SubscriptionPlan[] | null>(CONFIG, []);
    guard();
    if (current !== null && !Array.isArray(current))
      throw new Error('Invalid subscriptions configuration');
    await apiClient.put(CONFIG, change(current ?? []).map(serializeSubscriptionPlan));
    guard();
    useConfigStore.getState().clearCache();
  },
  async config(): Promise<SubscriptionPlan[]> {
    const plans = (await getConfigValue<SubscriptionPlan[] | null>(CONFIG, [])) ?? [];
    return Array.isArray(plans) ? plans.map(normalizeSubscriptionPlan) : [];
  },
  /** Toggle smart routing globally; the server treats an absent flag as enabled. */
  async setSmartRouting(enabled: boolean): Promise<void> {
    const guard = guardConfigConnection();
    await apiClient.put(SMART_ROUTING_CONFIG, enabled);
    guard();
    useConfigStore.getState().clearCache();
  },
};
