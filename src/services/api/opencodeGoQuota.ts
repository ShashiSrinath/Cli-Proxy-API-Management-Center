import type { OpencodeGoQuotaData, OpencodeGoQuotaWindow } from '@/types';
import { isRecord } from '@/utils/helpers';

const WINDOW_IDS: OpencodeGoQuotaWindow['id'][] = ['rolling', 'weekly', 'monthly'];

const parseFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseWindow = (id: OpencodeGoQuotaWindow['id'], value: unknown): OpencodeGoQuotaWindow => {
  const raw = isRecord(value) ? value : {};
  const percent = parseFiniteNumber(raw.percent);
  const resetMs = typeof raw.resetsAt === 'string' ? Date.parse(raw.resetsAt) : Number.NaN;
  const status = typeof raw.status === 'string' ? raw.status.trim() : '';
  return {
    id,
    usedPercent: percent === null ? null : Math.min(100, Math.max(0, percent)),
    ...(Number.isFinite(resetMs) && resetMs > 0 ? { resetAt: Math.floor(resetMs / 1000) } : {}),
    ...(status ? { status } : {}),
  };
};

/**
 * Parse OpenCode Go's usage response:
 * {"usage":{"rolling":{"status","percent","resetsAt"},"weekly":{...},"monthly":{...}}}.
 * Only whitelisted fields are kept. Invalid bodies return null.
 */
export function parseOpencodeGoQuotaPayload(payload: unknown): OpencodeGoQuotaData | null {
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!isRecord(payload) || !isRecord(payload.usage)) return null;
  const usage = payload.usage;
  return { windows: WINDOW_IDS.map((id) => parseWindow(id, usage[id])) };
}
