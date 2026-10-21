import type { CommandCodeQuotaData, CommandCodeQuotaWindow } from '@/types';
import { isRecord } from '@/utils/helpers';

export const COMMAND_CODE_CREDITS_URL = 'https://api.commandcode.ai/alpha/billing/credits';
const COMMAND_CODE_SUBSCRIPTIONS_PATH = '/alpha/billing/subscriptions';
const COMMAND_CODE_USAGE_SUMMARY_PATH = '/alpha/usage/summary';

const WINDOW_IDS: CommandCodeQuotaWindow['id'][] = ['fiveHour', 'weekly'];

const parseFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseWindow = (id: CommandCodeQuotaWindow['id'], value: unknown): CommandCodeQuotaWindow => {
  const raw = isRecord(value) ? value : {};
  const used = parseFiniteNumber(raw.used);
  const cap = parseFiniteNumber(raw.cap);
  const usedPercent =
    used === null || cap === null || cap <= 0
      ? null
      : Math.min(100, Math.max(0, (used / cap) * 100));
  // Upstream reports resetAt as epoch milliseconds; keep Unix seconds like the
  // other spend windows so downstream timeline/reset code stays uniform.
  const resetMs = parseFiniteNumber(raw.resetAt);
  return {
    id,
    usedPercent,
    ...(resetMs !== null && resetMs > 0 ? { resetAt: Math.floor(resetMs / 1000) } : {}),
  };
};

/**
 * Parse Command Code's billing credits response:
 * {"credits":{"monthlyCredits","purchasedCredits","freeCredits"},"windowLimits":{"fiveHour":{...},"weekly":{...}}}.
 * Only whitelisted fields are kept. Invalid bodies return null.
 */
export function parseCommandCodeQuotaPayload(payload: unknown): CommandCodeQuotaData | null {
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!isRecord(payload) || !isRecord(payload.windowLimits)) return null;

  const windowLimits = payload.windowLimits;
  const credits = isRecord(payload.credits) ? payload.credits : null;
  const creditsRemaining = credits
    ? (parseFiniteNumber(credits.monthlyCredits) ?? 0) +
      (parseFiniteNumber(credits.purchasedCredits) ?? 0) +
      (parseFiniteNumber(credits.freeCredits) ?? 0)
    : undefined;

  return {
    windows: WINDOW_IDS.map((id) => parseWindow(id, windowLimits[id])),
    ...(creditsRemaining === undefined ? {} : { creditsRemaining }),
  };
}

/** Account endpoints that live on the same host as the credits probe URL. */
export function commandCodeAccountUrls(creditsUrl: string): {
  subscriptions: string;
  usageSummary: string;
} {
  let origin = new URL(COMMAND_CODE_CREDITS_URL).origin;
  try {
    origin = new URL(creditsUrl).origin;
  } catch {
    // Keep the default host for a malformed probe URL.
  }
  return {
    subscriptions: `${origin}${COMMAND_CODE_SUBSCRIPTIONS_PATH}`,
    usageSummary: `${origin}${COMMAND_CODE_USAGE_SUMMARY_PATH}`,
  };
}

const parseJsonRecord = (payload: unknown): Record<string, unknown> | null => {
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  return isRecord(payload) ? payload : null;
};

/**
 * Build the monthly plan window from three Command Code responses:
 * credits ({"credits":{"monthlyCredits"}} = monthly credits left),
 * subscriptions ({"data":{"currentPeriodEnd"}} = when monthly credits refill) and
 * usage summary ({"totalMonthlyCredits"} = monthly credits spent this billing period).
 * Returns null when neither the usage share nor the reset time is known.
 */
export function parseCommandCodeMonthlyWindow(
  creditsPayload: unknown,
  subscriptionPayload: unknown,
  usageSummaryPayload: unknown
): CommandCodeQuotaWindow | null {
  const credits = parseJsonRecord(creditsPayload)?.credits;
  const monthlyLeft = isRecord(credits) ? parseFiniteNumber(credits.monthlyCredits) : null;
  const usageSummary = parseJsonRecord(usageSummaryPayload);
  const monthlyUsed = usageSummary ? parseFiniteNumber(usageSummary.totalMonthlyCredits) : null;
  const subscription = parseJsonRecord(subscriptionPayload)?.data;
  const periodEndMs = isRecord(subscription)
    ? Date.parse(String(subscription.currentPeriodEnd ?? ''))
    : NaN;

  const total = (monthlyUsed ?? 0) + (monthlyLeft ?? 0);
  const usedPercent =
    monthlyUsed === null || monthlyLeft === null || total <= 0
      ? null
      : Math.min(100, Math.max(0, (monthlyUsed / total) * 100));
  const resetAt = Number.isFinite(periodEndMs) ? Math.floor(periodEndMs / 1000) : undefined;
  if (usedPercent === null && resetAt === undefined) return null;
  return { id: 'monthly', usedPercent, ...(resetAt === undefined ? {} : { resetAt }) };
}
