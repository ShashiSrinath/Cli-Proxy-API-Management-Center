import type { AuthFileItem, OpenDesignQuotaData } from '@/types';
import { normalizeAuthIndex } from '@/utils/authIndex';

export type OpenDesignErrorCode =
  | 'missing_auth_index'
  | 'stale_request'
  | 'invalid_response'
  | 'request_failed'
  | 'opendesign_not_connected'
  | 'opendesign_session_expired'
  | 'invalid_session_input'
  | 'not_opendesign_credential'
  | 'auth_not_found'
  | 'opendesign_session_invalid'
  | 'opendesign_upstream_error';
const codes: OpenDesignErrorCode[] = [
  'opendesign_not_connected',
  'opendesign_session_expired',
  'invalid_session_input',
  'not_opendesign_credential',
  'auth_not_found',
  'opendesign_session_invalid',
  'opendesign_upstream_error',
];
export class OpenDesignQuotaError extends Error {
  constructor(
    public readonly code: OpenDesignErrorCode,
    public readonly status?: number
  ) {
    super(code);
  }
}
export function mapOpenDesignError(error: unknown): OpenDesignQuotaError {
  if (error instanceof OpenDesignQuotaError) return error;
  const e = error as { status?: number; data?: { code?: unknown } } | null;
  const code = e?.data?.code;
  if (typeof code === 'string' && codes.includes(code as OpenDesignErrorCode))
    return new OpenDesignQuotaError(code as OpenDesignErrorCode, e?.status);
  if (e?.status === 409) return new OpenDesignQuotaError('opendesign_not_connected', 409);
  if (e?.status === 412) return new OpenDesignQuotaError('opendesign_session_expired', 412);
  return new OpenDesignQuotaError('request_failed', e?.status);
}
export function authIndexFor(file: AuthFileItem): string {
  const index = normalizeAuthIndex(file.authIndex ?? file.auth_index);
  if (!index) throw new OpenDesignQuotaError('missing_auth_index');
  return index;
}
export function normalizeOpenDesignUsage(raw: unknown): OpenDesignQuotaData {
  if (!raw || typeof raw !== 'object') throw new OpenDesignQuotaError('invalid_response');
  const value = raw as Record<string, unknown>;
  const wallet = value.wallet as Record<string, unknown> | null;
  if (
    !Array.isArray(value.windows) ||
    !wallet ||
    typeof wallet.balance_usd !== 'number' ||
    !Number.isFinite(wallet.balance_usd)
  )
    throw new OpenDesignQuotaError('invalid_response');
  const windows = value.windows.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new OpenDesignQuotaError('invalid_response');
    const w = item as Record<string, unknown>;
    if (
      typeof w.label !== 'string' ||
      typeof w.used_credits !== 'number' ||
      !Number.isFinite(w.used_credits) ||
      typeof w.limit_credits !== 'number' ||
      !Number.isFinite(w.limit_credits) ||
      typeof w.remaining_credits !== 'number' ||
      !Number.isFinite(w.remaining_credits)
    )
      throw new OpenDesignQuotaError('invalid_response');
    return {
      label: w.label,
      used: w.used_credits,
      limit: w.limit_credits,
      remaining: w.remaining_credits,
      resetsAt: typeof w.resets_at === 'string' ? w.resets_at : undefined,
    };
  });
  return { windows, wallet: wallet.balance_usd };
}
export interface OpenDesignStatus {
  connected: boolean;
  valid?: boolean;
  email?: string;
  workspace_id?: string;
  workspace_name?: string;
  expires_at?: string;
  checked_at?: string;
  error?: string;
}
export interface OpenDesignClient {
  get: <T>(url: string, config?: { params: { auth_index: string } }) => Promise<T>;
  post: <T>(url: string, body: unknown) => Promise<T>;
  delete: <T>(url: string, config?: { params: { auth_index: string } }) => Promise<T>;
}
export function createOpenDesignRequests(client: OpenDesignClient) {
  const params = (auth_index: string) => ({ params: { auth_index } });
  return {
    usage: async (authIndex: string) =>
      normalizeOpenDesignUsage(await client.get<unknown>('/opendesign/usage', params(authIndex))),
    status: (authIndex: string) =>
      client.get<OpenDesignStatus>('/opendesign/status', params(authIndex)),
    connect: (authIndex: string, session: string) =>
      client.post<OpenDesignStatus>('/opendesign/connect', {
        auth_index: authIndex,
        session: session.trim(),
      }),
    disconnect: (authIndex: string) =>
      client.delete<OpenDesignStatus>('/opendesign/connect', params(authIndex)),
  };
}
