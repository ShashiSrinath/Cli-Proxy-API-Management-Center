import type { Config, OpenAIProviderConfig } from '@/types';
import type { ModelEntryInput, SponsorProviderRaw } from './types';

export const OPEN_DESIGN_PROVIDER_NAME = 'opendesign';
export const OPEN_DESIGN_DISPLAY_NAME = 'OpenDesign';
export const OPEN_DESIGN_SIGNUP_URL = 'https://open-design.ai/pricing';
export const OPEN_DESIGN_BASE_URL = 'https://amr-link.open-design.ai';
export const OPEN_DESIGN_OPENAI_BASE_URL = `${OPEN_DESIGN_BASE_URL}/v1`;

export const OPEN_DESIGN_BASE_URL_OPTIONS = [
  {
    id: 'standard',
    baseUrl: OPEN_DESIGN_BASE_URL,
    openaiBaseUrl: OPEN_DESIGN_OPENAI_BASE_URL,
    codexBaseUrl: '',
    anthropicBaseUrl: '',
    geminiBaseUrl: '',
  },
] as const;

export const OPEN_DESIGN_PROTOCOL_LABELS = ['openai'] as const;

/**
 * Default models pre-filled for a new OpenDesign key (OpenDesign has no plain glm-5.3).
 * Context lengths and input modalities mirror the upstream model metadata.
 */
const OPEN_DESIGN_MODELS: ReadonlyArray<{
  name: string;
  contextLength: number;
  inputModalities: readonly string[];
}> = [
  { name: 'deepseek-v4.1-flash', contextLength: 1048000, inputModalities: ['text', 'image'] },
  { name: 'glm-5.3-flash', contextLength: 1048000, inputModalities: ['text', 'image', 'video'] },
];

export const getOpenDesignDefaultModels = (): ModelEntryInput[] =>
  OPEN_DESIGN_MODELS.map((model) => ({
    name: model.name,
    alias: `${OPEN_DESIGN_PROVIDER_NAME}/${model.name}`,
    maxContextLength: String(model.contextLength),
    inputModalitiesText: model.inputModalities.join(', '),
  }));

const normalizeBaseUrl = (value: string | undefined | null): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '');

export const resolveOpenDesignBaseUrl = (): string => OPEN_DESIGN_BASE_URL;

export const getOpenDesignProtocolUrls = () => ({
  anthropic: '',
  openai: OPEN_DESIGN_OPENAI_BASE_URL,
  codex: '',
  gemini: '',
});

export const isOpenDesignOpenAIProvider = (
  config: OpenAIProviderConfig | undefined | null
): boolean => {
  if (!config) return false;
  return normalizeBaseUrl(config.baseUrl) === normalizeBaseUrl(OPEN_DESIGN_OPENAI_BASE_URL);
};

export const buildOpenDesignRaw = (config: Config | null | undefined): SponsorProviderRaw => ({
  openai: (config?.openaiCompatibility ?? [])
    .map((item, index) => ({ config: item, index: item.sourceIndex ?? index }))
    .filter((item) => isOpenDesignOpenAIProvider(item.config)),
  claude: [],
  codex: [],
  gemini: [],
});
