import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildOpenDesignRaw,
  getOpenDesignDefaultModels,
  OPEN_DESIGN_OPENAI_BASE_URL,
  OPEN_DESIGN_PROVIDER_NAME,
} from '../src/features/providers/openDesign';
import { getSponsorProviderDefinition } from '../src/features/providers/sponsorDefinitions';
import { SponsorProviderForm } from '../src/features/providers/sheets/forms/SponsorProviderForm';
import { buildProviderGroups } from '../src/features/providers/useProviderWorkbench';
import type { Config } from '../src/types';

const openAIConfig = (name: string, baseUrl: string): Config => ({
  openaiCompatibility: [{ name, baseUrl, apiKeyEntries: [{ apiKey: 'test-key' }] }],
});

const groupResources = (config: Config, brand: string) =>
  buildProviderGroups(config).find((group) => group.id === brand)!.resources;

describe('OpenDesign preset provider', () => {
  test('is an OpenAI-only preset with a fixed endpoint', () => {
    const definition = getSponsorProviderDefinition('openDesign');
    expect(definition.protocols).toEqual(['openai']);
    expect(definition.providerName).toBe(OPEN_DESIGN_PROVIDER_NAME);
    expect(definition.getProtocolUrls(undefined).openai).toBe(OPEN_DESIGN_OPENAI_BASE_URL);
  });

  test('pre-fills namespaced default models with context and modalities', () => {
    expect(getOpenDesignDefaultModels()).toEqual([
      {
        name: 'deepseek-v4.1-flash',
        alias: 'opendesign/deepseek-v4.1-flash',
        maxContextLength: '1048000',
        inputModalitiesText: 'text, image',
      },
      {
        name: 'glm-5.3-flash',
        alias: 'opendesign/glm-5.3-flash',
        maxContextLength: '1048000',
        inputModalitiesText: 'text, image, video',
      },
    ]);
  });

  test('groups the official endpoint under OpenDesign, not generic OpenAI', () => {
    const config = openAIConfig('anything', `${OPEN_DESIGN_OPENAI_BASE_URL}/`);
    expect(groupResources(config, 'openDesign')).toHaveLength(1);
    expect(groupResources(config, 'openaiCompatibility')).toHaveLength(0);
  });

  test('keeps OpenDesign-named custom endpoints in the generic OpenAI group', () => {
    const config = openAIConfig(OPEN_DESIGN_PROVIDER_NAME, 'https://gateway.example.com/v1');
    expect(buildOpenDesignRaw(config).openai).toEqual([]);
    expect(groupResources(config, 'openaiCompatibility')).toHaveLength(1);
  });

  test('create form hides protocol switching for the single-protocol preset', () => {
    const render = (brand: 'openDesign' | 'kimi') =>
      renderToStaticMarkup(
        createElement(SponsorProviderForm, {
          brand,
          resource: null,
          mode: 'create',
          mutating: false,
          formId: 'test-form',
          onSubmit: async () => {},
        })
      );
    const openDesign = render('openDesign');
    expect(openDesign).toContain(OPEN_DESIGN_OPENAI_BASE_URL);
    expect(openDesign).not.toContain('test-form-group-0-protocol');
    expect(render('kimi')).toContain('test-form-group-0-protocol');
  });
});
