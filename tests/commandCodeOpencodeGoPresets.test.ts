import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildCommandCodeRaw,
  COMMAND_CODE_OPENAI_BASE_URL,
  COMMAND_CODE_PROVIDER_NAME,
  getCommandCodeDefaultModels,
} from '../src/features/providers/commandCode';
import {
  buildOpencodeGoRaw,
  getOpencodeGoDefaultModels,
  OPENCODE_GO_DEFAULT_HEADERS,
  OPENCODE_GO_OPENAI_BASE_URL,
  OPENCODE_GO_PROVIDER_NAME,
} from '../src/features/providers/opencodeGo';
import { getSponsorProviderDefinition } from '../src/features/providers/sponsorDefinitions';
import { SponsorProviderForm } from '../src/features/providers/sheets/forms/SponsorProviderForm';
import {
  buildProviderGroups,
  buildSponsorOpenAIConfig,
  nextOpenAIProviderName,
} from '../src/features/providers/useProviderWorkbench';
import type { SponsorKeyEntryInput } from '../src/features/providers/types';
import type { Config, OpenAIProviderConfig } from '../src/types';

const openAIConfig = (name: string, baseUrl: string): Config => ({
  openaiCompatibility: [{ name, baseUrl, apiKeyEntries: [{ apiKey: 'test-key' }] }],
});

const groupResources = (config: Config, brand: string) =>
  buildProviderGroups(config).find((group) => group.id === brand)!.resources;

const keyEntry = (brand: 'opencodeGo' | 'commandCode'): SponsorKeyEntryInput => {
  const definition = getSponsorProviderDefinition(brand);
  return {
    protocol: 'openai',
    apiKey: 'test-key',
    existingApiKey: '',
    baseUrl: definition.baseUrlOptions[0].baseUrl,
    proxyUrl: '',
    prefix: '',
    disabled: false,
    models: definition.getDefaultModels!(),
  };
};

const persist = (brand: 'opencodeGo' | 'commandCode', existing?: OpenAIProviderConfig) => {
  const definition = getSponsorProviderDefinition(brand);
  return buildSponsorOpenAIConfig(
    keyEntry(brand),
    definition.providerName,
    definition.getProtocolUrls,
    existing,
    definition.getDefaultHeaders?.()
  );
};

describe('Command Code preset provider', () => {
  test('is an OpenAI-only preset on the provider endpoint', () => {
    const definition = getSponsorProviderDefinition('commandCode');
    expect(definition.protocols).toEqual(['openai']);
    expect(definition.providerName).toBe(COMMAND_CODE_PROVIDER_NAME);
    expect(definition.getProtocolUrls(undefined).openai).toBe(COMMAND_CODE_OPENAI_BASE_URL);
    expect(definition.getDefaultHeaders).toBeUndefined();
  });

  test('pre-fills the default models with vendor-free aliases and context lengths', () => {
    expect(getCommandCodeDefaultModels()).toEqual([
      {
        name: 'deepseek/deepseek-v4.1-flash',
        alias: 'commandcode/deepseek-v4.1-flash',
        maxContextLength: '1000000',
      },
      {
        name: 'z-ai/glm-5.3-flash',
        alias: 'commandcode/glm-5.3-flash',
        maxContextLength: '1048576',
      },
      { name: 'zai-org/GLM-5.3', alias: 'commandcode/glm-5.3', maxContextLength: '1000000' },
    ]);
  });

  test('groups the official endpoint under Command Code', () => {
    const config = openAIConfig(COMMAND_CODE_PROVIDER_NAME, COMMAND_CODE_OPENAI_BASE_URL);
    expect(groupResources(config, 'commandCode')).toHaveLength(1);
    expect(groupResources(config, 'openaiCompatibility')).toHaveLength(0);
    const persisted = persist('commandCode');
    expect(persisted.headers).toBeUndefined();
  });
});

describe('OpenCode Go preset provider', () => {
  test('is an OpenAI-only preset with session headers', () => {
    const definition = getSponsorProviderDefinition('opencodeGo');
    expect(definition.protocols).toEqual(['openai']);
    expect(definition.providerName).toBe(OPENCODE_GO_PROVIDER_NAME);
    expect(definition.getProtocolUrls(undefined).openai).toBe(OPENCODE_GO_OPENAI_BASE_URL);
    expect(definition.getDefaultHeaders?.()).toEqual({
      'User-Agent': 'cli-proxy-api/1.0',
      'x-opencode-session': '$CPA-SESSION-ID',
    });
  });

  test('pre-fills the default models', () => {
    expect(getOpencodeGoDefaultModels()).toEqual([
      { name: 'deepseek-v4.1-flash', alias: 'opencode-go/deepseek-v4.1-flash' },
      { name: 'glm-5.3-flash', alias: 'opencode-go/glm-5.3-flash' },
      { name: 'glm-5.3', alias: 'opencode-go/glm-5.3' },
    ]);
  });

  test('writes default headers on create and keeps existing headers on update', () => {
    expect(persist('opencodeGo').headers).toEqual({ ...OPENCODE_GO_DEFAULT_HEADERS });
    const existing: OpenAIProviderConfig = {
      name: OPENCODE_GO_PROVIDER_NAME,
      baseUrl: OPENCODE_GO_OPENAI_BASE_URL,
      headers: { 'x-opencode-session': 'custom' },
    };
    expect(persist('opencodeGo', existing).headers).toEqual({ 'x-opencode-session': 'custom' });
    const withoutHeaders = { ...existing, headers: undefined };
    expect(persist('opencodeGo', withoutHeaders).headers).toBeUndefined();
  });

  test('groups the official endpoint under OpenCode Go', () => {
    const config = openAIConfig('anything', `${OPENCODE_GO_OPENAI_BASE_URL}/`);
    expect(groupResources(config, 'opencodeGo')).toHaveLength(1);
    expect(groupResources(config, 'openaiCompatibility')).toHaveLength(0);
    expect(buildOpencodeGoRaw(openAIConfig('opencode-go', 'https://x.example/v1')).openai).toEqual(
      []
    );
    expect(buildCommandCodeRaw(config).openai).toEqual([]);
  });

  test('create form shows the default headers', () => {
    const markup = renderToStaticMarkup(
      createElement(SponsorProviderForm, {
        brand: 'opencodeGo',
        resource: null,
        mode: 'create',
        mutating: false,
        formId: 'test-form',
        onSubmit: async () => {},
      })
    );
    expect(markup).toContain(OPENCODE_GO_OPENAI_BASE_URL);
    expect(markup).toContain('x-opencode-session: $CPA-SESSION-ID');
    expect(markup).not.toContain('test-form-group-0-protocol');
  });
});

describe('OpenAI presets with several accounts', () => {
  const config: Config = {
    openaiCompatibility: [
      {
        name: 'opencode-go',
        baseUrl: OPENCODE_GO_OPENAI_BASE_URL,
        apiKeyEntries: [{ apiKey: 'a' }, { apiKey: 'b' }],
      },
      {
        name: 'ocg-work',
        baseUrl: `${OPENCODE_GO_OPENAI_BASE_URL}/`,
        apiKeyEntries: [{ apiKey: 'c' }],
      },
      {
        name: 'cc-personal',
        baseUrl: COMMAND_CODE_OPENAI_BASE_URL,
        apiKeyEntries: [{ apiKey: 'd' }],
      },
      {
        name: 'other',
        baseUrl: 'https://gateway.example.com/v1',
        apiKeyEntries: [{ apiKey: 'e' }],
      },
    ],
  };

  test('lists each named entry as its own editable OpenAI-compatible resource', () => {
    const opencodeGo = groupResources(config, 'opencodeGo');
    expect(opencodeGo.map((resource) => resource.name)).toEqual(['opencode-go', 'ocg-work']);
    expect(opencodeGo.every((resource) => resource.brand === 'openaiCompatibility')).toBe(true);
    expect(groupResources(config, 'commandCode').map((resource) => resource.name)).toEqual([
      'cc-personal',
    ]);
    expect(groupResources(config, 'openaiCompatibility').map((resource) => resource.name)).toEqual([
      'other',
    ]);
  });

  test('new preset entries get the first free name', () => {
    expect(nextOpenAIProviderName(config, 'commandcode')).toBe('commandcode');
    expect(nextOpenAIProviderName(config, 'opencode-go')).toBe('opencode-go-2');
    const taken: Config = {
      openaiCompatibility: [
        { name: 'Opencode-Go', baseUrl: 'x' },
        { name: 'opencode-go-2', baseUrl: 'x' },
      ],
    };
    expect(nextOpenAIProviderName(taken, 'opencode-go')).toBe('opencode-go-3');
  });
});
