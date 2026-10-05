import type { AuthFileItem, OpencodeGoQuotaData } from '@/types';
import type { ApiCallRequest, ApiCallResult } from '@/services/api/apiCall';
import { parseOpencodeGoQuotaPayload } from '@/services/api/opencodeGoQuota';
import { normalizeAuthIndex } from '@/utils/authIndex';

export const OPENCODE_GO_USAGE_URL = 'https://opencode.ai/zen/go/v1/usage';

/** OpenCode Go rejects generic SDK user agents, so always identify the proxy. */
const DEFAULT_HEADERS: Record<string, string> = {
  Authorization: 'Bearer $TOKEN$',
  Accept: 'application/json',
  'User-Agent': 'cli-proxy-api',
};

export type OpencodeGoQuotaErrorCode =
  'missing_auth_index' | 'stale_request' | 'invalid_response' | 'request_failed';

export class OpencodeGoQuotaError extends Error {
  readonly status?: number;

  constructor(
    public readonly code: OpencodeGoQuotaErrorCode,
    status?: number
  ) {
    super(code);
    this.name = 'OpencodeGoQuotaError';
    this.status = status;
  }
}

interface OpencodeGoQuotaDependencies {
  request: (payload: ApiCallRequest) => Promise<ApiCallResult>;
  captureCurrent: (name: string) => () => boolean;
}

/** Prefer the backend-provided quota probe so URL and headers stay in sync with the server. */
const resolveProbe = (file: AuthFileItem): { url: string; header: Record<string, string> } => {
  const probe = (file as { quota_probe?: unknown }).quota_probe;
  if (!probe || typeof probe !== 'object') {
    return { url: OPENCODE_GO_USAGE_URL, header: { ...DEFAULT_HEADERS } };
  }
  const { url, headers } = probe as { url?: unknown; headers?: unknown };
  const header: Record<string, string> = {};
  if (headers && typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
      if (typeof value === 'string') header[key] = value;
    }
  }
  return {
    url: typeof url === 'string' && url.trim() ? url.trim() : OPENCODE_GO_USAGE_URL,
    header: Object.keys(header).length > 0 ? header : { ...DEFAULT_HEADERS },
  };
};

export function createOpencodeGoQuotaFetcher(deps: OpencodeGoQuotaDependencies) {
  return async (file: AuthFileItem): Promise<OpencodeGoQuotaData> => {
    const authIndex = normalizeAuthIndex(file.authIndex ?? file.auth_index);
    if (!authIndex) throw new OpencodeGoQuotaError('missing_auth_index');
    const isCurrent = deps.captureCurrent(file.name);
    const assertCurrent = () => {
      if (!isCurrent()) throw new OpencodeGoQuotaError('stale_request');
    };

    const { url, header } = resolveProbe(file);
    let response: ApiCallResult;
    try {
      assertCurrent();
      response = await deps.request({ authIndex, method: 'GET', url, header });
    } catch (error: unknown) {
      assertCurrent();
      const status =
        error !== null &&
        typeof error === 'object' &&
        typeof (error as { status?: unknown }).status === 'number'
          ? (error as { status: number }).status
          : undefined;
      throw new OpencodeGoQuotaError('request_failed', status);
    }
    assertCurrent();

    if (!(response.statusCode >= 200 && response.statusCode < 300)) {
      throw new OpencodeGoQuotaError('request_failed', response.statusCode);
    }
    const quota = parseOpencodeGoQuotaPayload(response.body ?? response.bodyText);
    if (!quota) throw new OpencodeGoQuotaError('invalid_response');
    return quota;
  };
}
