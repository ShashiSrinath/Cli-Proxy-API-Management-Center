import { describe, expect, test } from 'bun:test';
import { parse as parseYaml } from 'yaml';
import {
  buildModelFallbackModelSuggestions,
  parseModelFallbackRules,
  serializeModelFallbackRules,
} from '../src/features/config/modelFallback';
import { runVisualConfig } from './helpers/visualConfig';

const BASE_YAML = `config-version: 8
routing:
  strategy: round-robin
  model-fallback:
    enabled: true
    rules:
      - model: gpt-6.1-sol
        fallback-model: deepseek-v4.1-flash
        fallback-providers: [opencode-go, commandcode]
        fallback-reasoning-effort: high
`;

describe('model fallback rules', () => {
  test('parses and normalizes routing.model-fallback rules', () => {
    const rules = parseModelFallbackRules({
      rules: [
        {
          model: ' gpt-6.1-sol ',
          'fallback-model': 'deepseek-v4.1-flash',
          'fallback-providers': [' OpenCode-Go ', 'opencode-go'],
          'fallback-reasoning-effort': 'HIGH',
        },
        'invalid',
      ],
    });
    expect(rules).toEqual([
      {
        id: 'model-fallback-0',
        model: 'gpt-6.1-sol',
        fallbackModel: 'deepseek-v4.1-flash',
        fallbackProviders: ['opencode-go'],
        fallbackReasoningEffort: 'high',
      },
    ]);
    expect(parseModelFallbackRules(null)).toEqual([]);
  });

  test('skips incomplete rules and empty optional fields when serializing', () => {
    expect(
      serializeModelFallbackRules([
        {
          id: 'a',
          model: 'main',
          fallbackModel: 'fb',
          fallbackProviders: [],
          fallbackReasoningEffort: '',
        },
        {
          id: 'b',
          model: 'draft',
          fallbackModel: ' ',
          fallbackProviders: ['codex'],
          fallbackReasoningEffort: 'low',
        },
      ])
    ).toEqual([{ model: 'main', 'fallback-model': 'fb' }]);
  });

  test('suggests compat aliases and known models without duplicates', () => {
    expect(
      buildModelFallbackModelSuggestions(
        [{ models: [{ name: 'deepseek/deepseek-v4.1-flash', alias: 'deepseek-v4.1-flash' }] }],
        ['gpt-6.1-sol', 'deepseek-v4.1-flash']
      )
    ).toEqual(['deepseek-v4.1-flash', 'gpt-6.1-sol']);
  });

  test('loads and writes fallback mode through the visual config codec', () => {
    const loaded = runVisualConfig(BASE_YAML);
    expect(loaded.visualValues.modelFallbackEnabled).toBe(true);
    expect(loaded.visualValues.modelFallbackRules).toHaveLength(1);

    const updated = runVisualConfig(BASE_YAML, [
      {
        modelFallbackRules: [
          {
            ...loaded.visualValues.modelFallbackRules[0],
            fallbackProviders: ['commandcode'],
            fallbackReasoningEffort: 'medium',
          },
        ],
      },
    ]);
    expect(parseYaml(updated.applyVisualChangesToYaml(BASE_YAML)).routing).toEqual({
      strategy: 'round-robin',
      'model-fallback': {
        enabled: true,
        rules: [
          {
            model: 'gpt-6.1-sol',
            'fallback-model': 'deepseek-v4.1-flash',
            'fallback-providers': ['commandcode'],
            'fallback-reasoning-effort': 'medium',
          },
        ],
      },
    });
  });

  test('removes the section when disabled without rules', () => {
    const updated = runVisualConfig(BASE_YAML, [
      { modelFallbackEnabled: false, modelFallbackRules: [] },
    ]);
    expect(parseYaml(updated.applyVisualChangesToYaml(BASE_YAML)).routing).toEqual({
      strategy: 'round-robin',
    });
  });

  test('creates the section from an empty config', () => {
    const yaml = 'config-version: 8\n';
    const updated = runVisualConfig(yaml, [
      {
        modelFallbackEnabled: true,
        modelFallbackRules: [
          {
            id: 'x',
            model: 'gpt-6.1-sol',
            fallbackModel: 'deepseek-v4.1-flash',
            fallbackProviders: [],
            fallbackReasoningEffort: '',
          },
        ],
      },
    ]);
    expect(parseYaml(updated.applyVisualChangesToYaml(yaml)).routing).toEqual({
      'model-fallback': {
        enabled: true,
        rules: [{ model: 'gpt-6.1-sol', 'fallback-model': 'deepseek-v4.1-flash' }],
      },
    });
  });
});
