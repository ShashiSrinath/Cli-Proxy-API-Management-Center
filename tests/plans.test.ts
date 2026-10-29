import { describe, expect, test } from 'bun:test';
import {
  estimate,
  formatUsd,
  getMultiplierTier,
  getProviderFamily,
  getWindowMeterTier,
  groupPlansByFamily,
  presetProviders,
  prettifyCompatName,
  uniqueSlug,
} from '../src/features/plans/utils';
import type { PlanValue } from '../src/types/plans';

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

  test('prettifies compatible provider names', () => {
    expect(prettifyCompatName('openai-compatible-opencode go office 2')).toBe(
      'Opencode Go Office 2'
    );
    expect(prettifyCompatName('openai-compatible-command code.')).toBe('Command Code');
    expect(prettifyCompatName('openai-compatible-my_custom_provider')).toBe('My Custom Provider');
    expect(prettifyCompatName('openai-compatible-')).toBe('OpenAI Compatible');
  });

  test('derives provider family correctly from native and compat strings', () => {
    expect(getProviderFamily('openai-compatible-opencode go office 2')).toEqual({
      id: 'opencodeGo',
      name: 'OpenCode Go',
      brandKey: 'opencodeGo',
      colorKey: 'opencode-go',
    });
    expect(getProviderFamily('openai-compatible-command code.')).toEqual({
      id: 'commandCode',
      name: 'Command Code',
      brandKey: 'commandCode',
      colorKey: 'commandcode',
    });
    expect(getProviderFamily('openai-compatible-command code 2')).toEqual({
      id: 'commandCode',
      name: 'Command Code',
      brandKey: 'commandCode',
      colorKey: 'commandcode',
    });
    expect(getProviderFamily('openai-compatible-opendesign go 1')).toEqual({
      id: 'openDesign',
      name: 'OpenDesign',
      brandKey: 'openDesign',
      colorKey: 'openDesign',
    });
    expect(getProviderFamily('claude')).toEqual({
      id: 'claude',
      name: 'Claude',
      brandKey: 'claude',
      colorKey: 'claude',
    });
    expect(getProviderFamily('codex')).toEqual({
      id: 'codex',
      name: 'Codex',
      brandKey: 'codex',
      colorKey: 'codex',
    });
    expect(getProviderFamily('gemini-cli')).toEqual({
      id: 'gemini',
      name: 'Gemini',
      brandKey: 'gemini',
      colorKey: 'gemini',
    });
    expect(getProviderFamily('xai')).toEqual({
      id: 'xai',
      name: 'xAI',
      brandKey: 'xai',
      colorKey: 'xai',
    });
    // Fallback for custom compat
    const custom = getProviderFamily('openai-compatible-custom-vendor-api');
    expect(custom.name).toBe('Custom Vendor Api');
    expect(custom.brandKey).toBe('openaiCompatibility');
  });

  test('calculates multiplier tier', () => {
    expect(getMultiplierTier(null, false, 10)).toBe('neutral');
    expect(getMultiplierTier(0, false, 10)).toBe('neutral');
    expect(getMultiplierTier(0, true, 0)).toBe('neutral');
    expect(getMultiplierTier(0.5, true, 10)).toBe('red');
    expect(getMultiplierTier(1.0, true, 10)).toBe('amber');
    expect(getMultiplierTier(2.9, true, 10)).toBe('amber');
    expect(getMultiplierTier(3.0, true, 10)).toBe('green');
    expect(getMultiplierTier(8.5, true, 20)).toBe('green');
  });

  test('determines window meter fill tier', () => {
    expect(getWindowMeterTier(0.2, false)).toBe('green');
    expect(getWindowMeterTier(0.59, false)).toBe('green');
    expect(getWindowMeterTier(0.6, false)).toBe('amber');
    expect(getWindowMeterTier(0.84, false)).toBe('amber');
    expect(getWindowMeterTier(0.85, false)).toBe('red');
    expect(getWindowMeterTier(0.99, false)).toBe('red');
    expect(getWindowMeterTier(0.2, true)).toBe('red');
  });

  test('groups plans by provider family and calculates subtotals', () => {
    const plans = [
      {
        id: 'plan-1',
        name: 'OpenCode Office 1',
        provider: 'openai-compatible-opencode go office',
        price_usd: 10,
        value_usd: 25,
      },
      {
        id: 'plan-2',
        name: 'OpenCode Office 2',
        provider: 'openai-compatible-opencode go office 2',
        price_usd: 10,
        value_usd: 35,
      },
      {
        id: 'plan-3',
        name: 'Command Code Pro',
        provider: 'openai-compatible-command code',
        price_usd: 20,
        value_usd: 80,
      },
    ] as unknown as PlanValue[];

    const groups = groupPlansByFamily(plans);
    expect(groups.length).toBe(2);

    const opencodeGroup = groups.find((g) => g.family.id === 'opencodeGo')!;
    expect(opencodeGroup).toBeDefined();
    expect(opencodeGroup.plans.length).toBe(2);
    expect(opencodeGroup.totals.price_usd).toBe(20);
    expect(opencodeGroup.totals.value_usd).toBe(60);
    expect(opencodeGroup.totals.multiplier).toBe(3);

    const commandGroup = groups.find((g) => g.family.id === 'commandCode')!;
    expect(commandGroup).toBeDefined();
    expect(commandGroup.plans.length).toBe(1);
    expect(commandGroup.totals.price_usd).toBe(20);
    expect(commandGroup.totals.value_usd).toBe(80);
    expect(commandGroup.totals.multiplier).toBe(4);
  });
});
