import type { AuthFileItem, CommandCodeQuotaData } from '@/types';
import type { ApiCallRequest, ApiCallResult } from '@/services/api/apiCall';
import {
  COMMAND_CODE_CREDITS_URL,
  parseCommandCodeQuotaPayload,
} from '@/services/api/commandCodeQuota';
import { normalizeAuthIndex } from '@/utils/authIndex';

/** Fallback headers when the backend did not attach a quota probe. */
const DEFAULT_HEADERS: Record<string, string> = {
  Authorization: 'Bearer $TOKEN$',
  Accept: 'application/json',
};

export type CommandCodeQuotaErrorCode =
  'missing_auth_index' | 'stale_request' | 'invalid_response' | 'request_failed';

export class CommandCodeQuotaError extends Error {
  readonly status?: number;

  constructor(
    public readonly code: CommandCodeQuotaErrorCode,
    status?: number
  ) {
    super(code);
    this.name = 'CommandCodeQuotaError';
    this.status = status;
  }
}

interface CommandCodeQuotaDependencies {
  request: (payload: ApiCallRequest) => Promise<ApiCallResult>;
  captureCurrent: (name: string) => () => boolean;
}

/** Prefer the backend-provided quota probe so URL and headers stay in sync with the server. */
const resolveProbe = (file: AuthFileItem): { url: string; header: Record<string, string> } => {
  const probe = (file as { quota_probe?: unknown }).quota_probe;
  if (!probe || typeof probe !== 'object') {
    return { url: COMMAND_CODE_CREDITS_URL, header: { ...DEFAULT_HEADERS } };
  }
  const { url, headers } = probe as { url?: unknown; headers?: unknown };
  const header: Record<string, string> = {};
  if (headers && typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
      if (typeof value === 'string') header[key] = value;
    }
  }
  return {
    url: typeof url === 'string' && url.trim() ? url.trim() : COMMAND_CODE_CREDITS_URL,
    header: Object.keys(header).length > 0 ? header : { ...DEFAULT_HEADERS },
  };
};

export function createCommandCodeQuotaFetcher(deps: CommandCodeQuotaDependencies) {
  return async (file: AuthFileItem): Promise<CommandCodeQuotaData> => {
    const authIndex = normalizeAuthIndex(file.authIndex ?? file.auth_index);
    if (!authIndex) throw new CommandCodeQuotaError('missing_auth_index');
    const isCurrent = deps.captureCurrent(file.name);
    const assertCurrent = () => {
      if (!isCurrent()) throw new CommandCodeQuotaError('stale_request');
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
      throw new CommandCodeQuotaError('request_failed', status);
    }
    assertCurrent();

    if (!(response.statusCode >= 200 && response.statusCode < 300)) {
      throw new CommandCodeQuotaError('request_failed', response.statusCode);
    }
    const quota = parseCommandCodeQuotaPayload(response.body ?? response.bodyText);
    if (!quota) throw new CommandCodeQuotaError('invalid_response');
    return quota;
  };
}
