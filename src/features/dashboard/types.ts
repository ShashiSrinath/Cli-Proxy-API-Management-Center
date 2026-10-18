/**
 * UI-only types for the usage dashboard. Backend data shapes live in `@/types/usage`.
 */

import type { UsageRange } from '@/types/usage';

export const USAGE_RANGES: readonly UsageRange[] = ['24h', '7d', '30d', '90d'];

/** What the usage-over-time chart plots: stacked token kinds, request counts, or cost. */
export type UsageMetric = 'tokens' | 'requests' | 'cost';

export const USAGE_METRICS: readonly UsageMetric[] = ['tokens', 'requests', 'cost'];

export type KeySortColumn =
  'name' | 'requests' | 'failed' | 'input' | 'cached' | 'output' | 'cost' | 'lastUsed';

export type SortDirection = 'asc' | 'desc';

export interface KeySort {
  column: KeySortColumn;
  direction: SortDirection;
}
