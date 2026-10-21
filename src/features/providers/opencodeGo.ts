import type { Config, OpenAIProviderConfig } from '@/types';
import type { ModelEntryInput, SponsorProviderRaw } from './types';

// Provider name and host match the OpenCode Go quota detection in utils/quota/validators.ts.
export const OPENCODE_GO_PROVIDER_NAME = 'opencode-go';
export const OPENCODE_GO_DISPLAY_NAME = 'OpenCode Go';
export const OPENCODE_GO_SIGNUP_URL = 'https://opencode.ai/go';
export const OPENCODE_GO_BASE_URL = 'https://opencode.ai/zen/go';
export const OPENCODE_GO_OPENAI_BASE_URL = `${OPENCODE_GO_BASE_URL}/v1`;

export const OPENCODE_GO_BASE_URL_OPTIONS = [
  {
    id: 'standard',
    baseUrl: OPENCODE_GO_BASE_URL,
    openaiBaseUrl: OPENCODE_GO_OPENAI_BASE_URL,
    codexBaseUrl: '',
    anthropicBaseUrl: '',
    geminiBaseUrl: '',
  },
] as const;

export const OPENCODE_GO_PROTOCOL_LABELS = ['openai'] as const;

/**
 * OpenCode Go rejects requests without a session header. $CPA-SESSION-ID is expanded by the
 * proxy to the canonical session identity of each request.
 */
export const OPENCODE_GO_DEFAULT_HEADERS: Readonly<Record<string, string>> = {
  'User-Agent': 'cli-proxy-api/1.0',
  'x-opencode-session': '$CPA-SESSION-ID',
};

/**
 * Default models pre-filled for a new key; all are served on /chat/completions
 * (https://opencode.ai/docs/go/). The upstream /models endpoint carries no
 * context-length metadata.
 */
const OPENCODE_GO_MODELS: readonly string[] = ['deepseek-v4.1-flash', 'glm-5.3-flash', 'glm-5.3'];

export const getOpencodeGoDefaultModels = (): ModelEntryInput[] =>
  OPENCODE_GO_MODELS.map((name) => ({ name, alias: `${OPENCODE_GO_PROVIDER_NAME}/${name}` }));

export const getOpencodeGoDefaultHeaders = (): Record<string, string> => ({
  ...OPENCODE_GO_DEFAULT_HEADERS,
});

const normalizeBaseUrl = (value: string | undefined | null): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '');

export const resolveOpencodeGoBaseUrl = (): string => OPENCODE_GO_BASE_URL;

export const getOpencodeGoProtocolUrls = () => ({
  anthropic: '',
  openai: OPENCODE_GO_OPENAI_BASE_URL,
  codex: '',
  gemini: '',
});

export const isOpencodeGoOpenAIProvider = (
  config: OpenAIProviderConfig | undefined | null
): boolean => {
  if (!config) return false;
  return normalizeBaseUrl(config.baseUrl) === normalizeBaseUrl(OPENCODE_GO_OPENAI_BASE_URL);
};

export const buildOpencodeGoRaw = (config: Config | null | undefined): SponsorProviderRaw => ({
  openai: (config?.openaiCompatibility ?? [])
    .map((item, index) => ({ config: item, index: item.sourceIndex ?? index }))
    .filter((item) => isOpencodeGoOpenAIProvider(item.config)),
  claude: [],
  codex: [],
  gemini: [],
});
