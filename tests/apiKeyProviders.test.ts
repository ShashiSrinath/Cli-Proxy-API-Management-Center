import { describe, expect, test } from 'bun:test';
import { parse as parseYaml } from 'yaml';
import {
  buildApiKeyProviderOptions,
  remapApiKeyProviders,
} from '../src/features/config/apiKeyProviders';
import { parseApiKeyProviders } from '../src/hooks/useVisualConfig';
import { runVisualConfig } from './helpers/visualConfig';

const BASE_YAML = `config-version: 8
access:
  api-keys:
    - client-a
    - client-b
  api-key-providers:
    client-b: [codex]
`;

describe('api key provider restrictions', () => {
  test('parses and normalizes access.api-key-providers', () => {
    expect(
      parseApiKeyProviders({ a: [' Codex ', 'codex', 'claude'], b: [], c: 'x', ' ': ['gemini'] })
    ).toEqual({ a: ['codex', 'claude'] });
    expect(parseApiKeyProviders(null)).toEqual({});
  });

  test('builds options from presets, compat names and selections', () => {
    const options = buildApiKeyProviderOptions(['OpenRouter', 'codex'], ['my-plugin']);
    expect(options).toContain('openrouter');
    expect(options).toContain('my-plugin');
    expect(options.filter((option) => option === 'codex')).toHaveLength(1);
  });

  test('remaps providers on rename and delete', () => {
    const current = { a: ['codex'], b: ['claude'] };
    expect(remapApiKeyProviders(current, 'a', 'a2')).toEqual({ a2: ['codex'], b: ['claude'] });
    expect(remapApiKeyProviders(current, 'a', null)).toEqual({ b: ['claude'] });
    expect(remapApiKeyProviders(current, null, 'c', ['Gemini'])).toEqual({
      ...current,
      c: ['gemini'],
    });
    expect(remapApiKeyProviders(current, 'b', 'b', [])).toEqual({ a: ['codex'] });
  });

  test('loads and writes restrictions through the visual config codec', () => {
    const loaded = runVisualConfig(BASE_YAML);
    expect(loaded.visualValues.apiKeyProviders).toEqual({ 'client-b': ['codex'] });

    const updated = runVisualConfig(BASE_YAML, [
      { apiKeyProviders: { 'client-a': ['claude', 'gemini'], 'client-b': ['codex'] } },
    ]);
    expect(parseYaml(updated.applyVisualChangesToYaml(BASE_YAML)).access).toEqual({
      'api-keys': ['client-a', 'client-b'],
      'api-key-providers': { 'client-a': ['claude', 'gemini'], 'client-b': ['codex'] },
    });
  });

  test('drops restrictions for removed keys and removes the empty map', () => {
    const updated = runVisualConfig(BASE_YAML, [{ apiKeysText: 'client-a' }]);
    expect(parseYaml(updated.applyVisualChangesToYaml(BASE_YAML)).access).toEqual({
      'api-keys': ['client-a'],
    });
  });
});
