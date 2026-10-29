import type { PlansResponse, SubscriptionPlan } from '@/types/plans';
import { useConfigStore } from '@/stores/useConfigStore';
import { apiClient } from './client';
import { getConfigValue, guardConfigConnection } from './configValue';

const CONFIG = '/config/observability/usage/tracking/subscriptions';
export const usagePlansApi = {
  async get(tz: string, cycleOffset: number): Promise<PlansResponse> {
    const data = await apiClient.get<PlansResponse>('/observability/usage/plans', {
      params: { tz, cycle_offset: cycleOffset },
    });
    return {
      ...data,
      plans: data.plans ?? [],
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
    };
  },
  async update(change: (plans: SubscriptionPlan[]) => SubscriptionPlan[]): Promise<void> {
    const guard = guardConfigConnection();
    const current = await getConfigValue<SubscriptionPlan[] | null>(CONFIG, []);
    guard();
    if (current !== null && !Array.isArray(current))
      throw new Error('Invalid subscriptions configuration');
    await apiClient.put(CONFIG, change(current ?? []));
    guard();
    useConfigStore.getState().clearCache();
  },
  async config(): Promise<SubscriptionPlan[]> {
    return (await getConfigValue<SubscriptionPlan[] | null>(CONFIG, [])) ?? [];
  },
};
