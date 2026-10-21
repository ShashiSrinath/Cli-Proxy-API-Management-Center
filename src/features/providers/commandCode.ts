import type { Config, OpenAIProviderConfig } from '@/types';
import type { ModelEntryInput, SponsorProviderRaw } from './types';

// Provider name and host match the Command Code quota detection in utils/quota/validators.ts.
export const COMMAND_CODE_PROVIDER_NAME = 'commandcode';
export const COMMAND_CODE_DISPLAY_NAME = 'Command Code';
export const COMMAND_CODE_SIGNUP_URL = 'https://commandcode.ai/pricing';
export const COMMAND_CODE_BASE_URL = 'https://api.commandcode.ai';
export const COMMAND_CODE_OPENAI_BASE_URL = `${COMMAND_CODE_BASE_URL}/provider/v1`;

export const COMMAND_CODE_BASE_URL_OPTIONS = [
  {
    id: 'standard',
    baseUrl: COMMAND_CODE_BASE_URL,
    openaiBaseUrl: COMMAND_CODE_OPENAI_BASE_URL,
    codexBaseUrl: '',
    anthropicBaseUrl: '',
    geminiBaseUrl: '',
  },
] as const;

export const COMMAND_CODE_PROTOCOL_LABELS = ['openai'] as const;

/**
 * Default models pre-filled for a new key, with context lengths from
 * {base}/provider/v1/models. All of them are served on /chat/completions.
 */
const COMMAND_CODE_MODELS: ReadonlyArray<readonly [name: string, contextLength: number]> = [
  ['deepseek/deepseek-v4.1-flash', 1000000],
  ['z-ai/glm-5.3-flash', 1048576],
  ['zai-org/GLM-5.3', 1000000],
];

/** Aliases drop the vendor prefix: `deepseek/deepseek-v4.1-flash` → `commandcode/deepseek-v4.1-flash`. */
export const getCommandCodeDefaultModels = (): ModelEntryInput[] =>
  COMMAND_CODE_MODELS.map(([name, contextLength]) => ({
    name,
    alias: `${COMMAND_CODE_PROVIDER_NAME}/${name.split('/').pop()!.toLowerCase()}`,
    maxContextLength: String(contextLength),
  }));

const normalizeBaseUrl = (value: string | undefined | null): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '');

export const resolveCommandCodeBaseUrl = (): string => COMMAND_CODE_BASE_URL;

export const getCommandCodeProtocolUrls = () => ({
  anthropic: '',
  openai: COMMAND_CODE_OPENAI_BASE_URL,
  codex: '',
  gemini: '',
});

export const isCommandCodeOpenAIProvider = (
  config: OpenAIProviderConfig | undefined | null
): boolean => {
  if (!config) return false;
  return normalizeBaseUrl(config.baseUrl) === normalizeBaseUrl(COMMAND_CODE_OPENAI_BASE_URL);
};

export const buildCommandCodeRaw = (config: Config | null | undefined): SponsorProviderRaw => ({
  openai: (config?.openaiCompatibility ?? [])
    .map((item, index) => ({ config: item, index: item.sourceIndex ?? index }))
    .filter((item) => isCommandCodeOpenAIProvider(item.config)),
  claude: [],
  codex: [],
  gemini: [],
});
