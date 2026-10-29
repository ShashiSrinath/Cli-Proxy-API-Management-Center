import { describe, expect, test } from 'bun:test';
import { estimate, formatUsd, presetProviders, uniqueSlug } from '../src/features/plans/utils';

describe('plans helpers', () => {
  test('formats dollars and estimates, including missing values', () => {
    expect(formatUsd(1234)).toBe('$1,234');
    expect(formatUsd(12.4)).toBe('$12.40');
    expect(estimate(12.4)).toBe('≈$12.40');
    expect(estimate(null)).toBe('—');
  });
  test('generates unique slugs', () => {
    expect(uniqueSlug('Claude Max 20x', ['claude-max-20x', 'claude-max-20x-2'])).toBe(
      'claude-max-20x-3'
    );
    expect(uniqueSlug('!!!', [])).toBe('plan');
  });
  test('matches native and compatible provider presets', () => {
    const providers = ['claude', 'codex', 'openai-compatible-custom', 'openai-compatible-other'];
    expect(presetProviders('claude', providers)).toEqual(['claude']);
    expect(presetProviders('openai-compatible-', providers)).toEqual(providers.slice(2));
  });
});
