import type { CommandCodeQuotaData, CommandCodeQuotaWindow } from '@/types';
import { isRecord } from '@/utils/helpers';

export const COMMAND_CODE_CREDITS_URL = 'https://api.commandcode.ai/alpha/billing/credits';

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
