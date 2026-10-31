/**
 * Pure helpers for the smart-routing panel: row status, human "why" reasons,
 * reset/pause countdowns, and null-safe window credit handling.
 */
import type { PlansRouting, PlanWindow, RoutingOrderEntry } from '@/types/plans';

export type RoutingRowStatus = 'serving' | 'next' | 'standby' | 'paused' | 'disabled';

/** i18n descriptor under `plans.routing.reason.*`. */
export type RoutingReasonKey =
  | 'manual'
  | 'disabled'
  | 'paused'
  | 'preferred'
  | 'avoided'
  | 'weeklySoonest'
  | 'weeklyLater'
  | 'weeklyNotStarted'
  | 'monthlySoonest'
  | 'monthlyAfterWeekly'
  | 'monthlyLater'
  | 'monthlyNotStarted'
  | 'tieHeadroom';

export type FullResetInfo =
  { kind: 'unknown' } | { kind: 'due' } | { kind: 'in'; duration: string; estimated: boolean };

export interface RoutingRow {
  entry: RoutingOrderEntry;
  status: RoutingRowStatus;
  reason: RoutingReasonKey;
  reset: FullResetInfo;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Compact countdown such as "2d 4h", "3h 12m", "45m", or "<1m". Negative → "<1m". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < MINUTE) return '<1m';
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

const parseTime = (value: string): number | null => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

/** Countdown until `value`; null when missing or invalid, "<1m" when due. */
export function countdown(value: string, now: number = Date.now()): string | null {
  const at = parseTime(value);
  return at == null ? null : formatDuration(at - now);
}

/** When the credential's longest limit window fully resets. */
export function describeFullReset(
  entry: Pick<RoutingOrderEntry, 'full_reset_at' | 'full_reset_estimated'>,
  now: number = Date.now()
): FullResetInfo {
  const at = parseTime(entry.full_reset_at);
  if (at == null) return { kind: 'unknown' };
  if (at - now < MINUTE) return { kind: 'due' };
  return { kind: 'in', duration: formatDuration(at - now), estimated: entry.full_reset_estimated };
}

/** Status of a row given its position among active (non-paused, enabled) rows. */
export function routingStatus(
  entry: Pick<RoutingOrderEntry, 'state'>,
  activeIndex: number
): RoutingRowStatus {
  if (entry.state === 'disabled') return 'disabled';
  if (entry.state === 'paused') return 'paused';
  if (activeIndex <= 0) return 'serving';
  return activeIndex === 1 ? 'next' : 'standby';
}

/**
 * Explain, in one short line, why a credential sits where it does. `above` holds the
 * active entries ranked before it; reasons mirror the backend ordering rules.
 */
export function routingReason(
  entry: RoutingOrderEntry,
  above: RoutingOrderEntry[],
  smartEnabled: boolean
): RoutingReasonKey {
  if (entry.state === 'disabled') return 'disabled';
  if (entry.state === 'paused') return 'paused';
  if (!smartEnabled) return 'manual';
  if (entry.routing === 'prefer') return 'preferred';
  if (entry.routing === 'avoid') return 'avoided';

  const group = above.filter((e) => e.routing === entry.routing && e.state === 'active');
  const sameType = group.filter((e) => e.limit_type === entry.limit_type);
  const previous = sameType[sameType.length - 1];

  if (entry.limit_type === 'monthly' && group.some((e) => e.limit_type === 'weekly')) {
    return 'monthlyAfterWeekly';
  }
  if (!previous) return entry.limit_type === 'monthly' ? 'monthlySoonest' : 'weeklySoonest';
  if (entry.full_reset_estimated) {
    return entry.limit_type === 'monthly' ? 'monthlyNotStarted' : 'weeklyNotStarted';
  }
  const prevReset = parseTime(previous.full_reset_at);
  const ownReset = parseTime(entry.full_reset_at);
  if (prevReset != null && ownReset != null && Math.abs(prevReset - ownReset) < MINUTE) {
    return 'tieHeadroom';
  }
  return entry.limit_type === 'monthly' ? 'monthlyLater' : 'weeklyLater';
}

/** Build display rows: active rows in rank order, then paused/disabled rows. */
export function buildRoutingRows(
  routing: PlansRouting,
  now: number = Date.now()
): { active: RoutingRow[]; inactive: RoutingRow[] } {
  const ordered = [...routing.order].sort((a, b) => a.rank - b.rank);
  const activeEntries: RoutingOrderEntry[] = [];
  const active: RoutingRow[] = [];
  const inactive: RoutingRow[] = [];
  for (const entry of ordered) {
    const row: RoutingRow = {
      entry,
      status: routingStatus(entry, activeEntries.length),
      reason: routingReason(entry, activeEntries, routing.enabled),
      reset: describeFullReset(entry, now),
    };
    if (entry.state === 'active') {
      activeEntries.push(entry);
      active.push(row);
    } else {
      inactive.push(row);
    }
  }
  return { active, inactive };
}

/** Map a backend window label to an i18n key suffix under `plans.routing.window.*`. */
export function windowLabelKey(label: string): 'fiveHour' | 'weekly' | 'monthly' | 'daily' | null {
  const clean = label.trim().toLowerCase();
  if (!clean) return null;
  if (clean.includes('week')) return 'weekly';
  if (clean.includes('month')) return 'monthly';
  if (clean.includes('5') && clean.includes('h')) return 'fiveHour';
  if (clean.includes('day') || clean.includes('daily')) return 'daily';
  return null;
}

/** Index routing entries by credential id for plan cards. */
export function routingByAuthId(
  routing: PlansRouting | null | undefined
): Map<string, RoutingOrderEntry> {
  const map = new Map<string, RoutingOrderEntry>();
  for (const entry of routing?.order ?? []) map.set(entry.auth_id, entry);
  return map;
}

/** Used share of a window, or null when the provider does not report it. */
export function windowUsedFraction(w: Pick<PlanWindow, 'used_fraction'>): number | null {
  const v = w.used_fraction;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Remaining provider credits in USD when the window reports them; else null. */
export function windowCreditsLeft(
  w: Pick<PlanWindow, 'unit' | 'provider_remaining'>
): number | null {
  const v = w.provider_remaining;
  return w.unit === 'usd' && typeof v === 'number' && Number.isFinite(v) ? v : null;
}
