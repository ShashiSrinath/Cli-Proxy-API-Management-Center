import type { ProviderBrandLogoKey } from '@/features/providers/brandLogos';
import type { PlanValue } from '@/types/plans';
import { TYPE_COLORS } from '@/utils/quota/constants';

export const formatUsd = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(n)
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(n);

export const estimate = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(n) ? '—' : `≈${formatUsd(n)}`;

export function uniqueSlug(name: string, ids: string[]): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'plan';
  let slug = base;
  let suffix = 2;
  while (ids.includes(slug)) slug = `${base}-${suffix++}`;
  return slug;
}

export const presets = [
  { name: 'Claude Pro', provider: 'claude', price: 20 },
  { name: 'Claude Max 5x', provider: 'claude', price: 100 },
  { name: 'Claude Max 20x', provider: 'claude', price: 200 },
  { name: 'ChatGPT Plus', provider: 'codex', price: 20 },
  { name: 'ChatGPT Pro', provider: 'codex', price: 200 },
  { name: 'Google AI Pro', provider: 'gemini-cli', price: 19.99 },
  { name: 'Google AI Ultra', provider: 'gemini-cli', price: 249.99 },
  { name: 'SuperGrok', provider: 'xai', price: 30 },
  { name: 'OpenCode Go', provider: 'openai-compatible-', price: 10 },
  { name: 'Command Code', provider: 'openai-compatible-', price: null },
  { name: 'OpenDesign', provider: 'openai-compatible-', price: null },
] as const;

export function presetProviders(provider: string, providers: string[]): string[] {
  return provider === 'openai-compatible-'
    ? providers.filter((p) => p.startsWith(provider))
    : providers.filter((p) => p === provider);
}

export const dateLabel = (date: string | null | undefined): string => {
  if (!date) return '—';
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString();
};

export const relativeTime = (date: string): string => {
  const delta = new Date(date).getTime() - Date.now();
  if (!Number.isFinite(delta)) return '—';
  const abs = Math.abs(delta);
  const unit = abs >= 86400000 ? 'day' : abs >= 3600000 ? 'hour' : 'minute';
  const divisor = unit === 'day' ? 86400000 : unit === 'hour' ? 3600000 : 60000;
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(
    Math.round(delta / divisor),
    unit
  );
};

export interface ProviderFamily {
  id: string;
  name: string;
  brandKey?: ProviderBrandLogoKey;
  colorKey?: string;
}

/** Prettify raw compatible provider keys or custom endpoints. */
export function prettifyCompatName(compat: string): string {
  let clean = compat.replace(/^openai-compatib(?:ility|le)[-_]/i, '').trim();
  clean = clean.replace(/[._-]+$/, '');
  clean = clean.replace(/[-_.]+/g, ' ').trim();
  if (!clean) return 'OpenAI Compatible';
  return clean
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Derive the provider family from a provider string or compatible name.
 * e.g. "openai-compatible-opencode go office 2" -> OpenCode Go
 *      "openai-compatible-command code." -> Command Code
 *      "openai-compatible-opendesign go 1" -> OpenDesign
 */
export function getProviderFamily(provider: string): ProviderFamily {
  const raw = String(provider || '').trim();
  const lower = raw.toLowerCase();

  // OpenCode Go
  if (lower.includes('opencode')) {
    return {
      id: 'opencodeGo',
      name: 'OpenCode Go',
      brandKey: 'opencodeGo',
      colorKey: 'opencode-go',
    };
  }

  // Command Code
  if (lower.includes('commandcode') || (lower.includes('command') && lower.includes('code'))) {
    return {
      id: 'commandCode',
      name: 'Command Code',
      brandKey: 'commandCode',
      colorKey: 'commandcode',
    };
  }

  // OpenDesign
  if (
    lower.includes('opendesign') ||
    lower.includes('open-design') ||
    (lower.includes('open') && lower.includes('design'))
  ) {
    return {
      id: 'openDesign',
      name: 'OpenDesign',
      brandKey: 'openDesign',
      colorKey: 'openDesign',
    };
  }

  // Claude / Anthropic
  if (lower.includes('claude') || lower.includes('anthropic')) {
    return {
      id: 'claude',
      name: 'Claude',
      brandKey: 'claude',
      colorKey: 'claude',
    };
  }

  // OpenAI Compatible prefix stripping for standard models
  if (lower.startsWith('openai-compatib')) {
    const rest = lower.replace(/^openai-compatib(?:ility|le)[-_]/i, '').trim();
    if (!rest || rest === 'openai' || rest === 'chatgpt' || rest === 'codex') {
      return {
        id: 'codex',
        name: 'Codex',
        brandKey: 'codex',
        colorKey: 'codex',
      };
    }
  } else if (lower.includes('codex') || lower.includes('chatgpt') || lower === 'openai') {
    return {
      id: 'codex',
      name: 'Codex',
      brandKey: 'codex',
      colorKey: 'codex',
    };
  }

  // Gemini / Google
  if (lower.includes('gemini') || lower.includes('aistudio')) {
    return {
      id: 'gemini',
      name: 'Gemini',
      brandKey: 'gemini',
      colorKey: 'gemini',
    };
  }

  // xAI / Grok
  if (lower.includes('xai') || lower.includes('x-ai') || lower.includes('grok')) {
    return {
      id: 'xai',
      name: 'xAI',
      brandKey: 'xai',
      colorKey: 'xai',
    };
  }

  // Kimi
  if (lower.includes('kimi')) {
    return {
      id: 'kimi',
      name: 'Kimi',
      brandKey: 'kimi',
      colorKey: 'kimi',
    };
  }

  // Meta
  if (lower.includes('meta') || lower.includes('llama')) {
    return {
      id: 'meta',
      name: 'Meta',
      brandKey: 'meta',
      colorKey: 'meta',
    };
  }

  // Vertex
  if (lower.includes('vertex')) {
    return {
      id: 'vertex',
      name: 'Vertex AI',
      brandKey: 'vertex',
      colorKey: 'vertex',
    };
  }

  // Devin
  if (lower.includes('devin')) {
    return {
      id: 'devin',
      name: 'Devin',
      brandKey: 'devin',
      colorKey: 'devin',
    };
  }

  // Fenno AI
  if (lower.includes('fenno')) {
    return {
      id: 'fennoAI',
      name: 'Fenno AI',
      brandKey: 'fennoAI',
      colorKey: 'fennoAI',
    };
  }

  // Qiniu Cloud
  if (lower.includes('qiniu')) {
    return {
      id: 'qiniuCloud',
      name: 'Qiniu Cloud',
      brandKey: 'qiniuCloud',
      colorKey: 'qiniuCloud',
    };
  }

  // APIKey Fun
  if (lower.includes('apikey') || lower.includes('api-key')) {
    return {
      id: 'apikeyFun',
      name: 'APIKey Fun',
      brandKey: 'apikeyFun',
      colorKey: 'apikeyFun',
    };
  }

  // Compatible fallback
  if (lower.startsWith('openai-compatib')) {
    const pretty = prettifyCompatName(raw);
    const slug = raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return {
      id: slug || 'openai-compatible',
      name: pretty,
      brandKey: 'openaiCompatibility',
      colorKey: 'unknown',
    };
  }

  const pretty = prettifyCompatName(raw);
  return {
    id: lower.replace(/[^a-z0-9]+/g, '-') || 'unknown',
    name: pretty,
    brandKey: undefined,
    colorKey: 'unknown',
  };
}

export type MultiplierTier = 'neutral' | 'red' | 'amber' | 'green';

/** Tier classification for value multipliers. */
export function getMultiplierTier(
  multiplier: number | null | undefined,
  hasUsage = true,
  priceUsd = 0
): MultiplierTier {
  if (!hasUsage || multiplier == null || priceUsd <= 0) return 'neutral';
  if (multiplier < 1) return 'red';
  if (multiplier < 3) return 'amber';
  return 'green';
}

export type WindowMeterTier = 'green' | 'amber' | 'red';

/** Tier classification for window meters by fill percentage or exhaustion. */
export function getWindowMeterTier(usedFraction: number, exhausted: boolean): WindowMeterTier {
  if (exhausted || usedFraction >= 0.85) return 'red';
  if (usedFraction >= 0.6) return 'amber';
  return 'green';
}

/** Calculate remaining days until target renewal date. */
export function getDaysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const target = new Date(date).getTime();
  if (!Number.isFinite(target)) return null;
  const diffMs = target - Date.now();
  return Math.ceil(diffMs / 86400000);
}

export interface PlanGroup {
  family: ProviderFamily;
  plans: PlanValue[];
  totals: {
    price_usd: number;
    value_usd: number;
    multiplier: number | null;
  };
}

/** Group plans by their detected provider family. */
export function groupPlansByFamily(plans: PlanValue[]): PlanGroup[] {
  const map = new Map<string, { family: ProviderFamily; plans: PlanValue[] }>();
  for (const plan of plans) {
    const family = getProviderFamily(plan.provider);
    const existing = map.get(family.id);
    if (existing) {
      existing.plans.push(plan);
    } else {
      map.set(family.id, { family, plans: [plan] });
    }
  }

  return Array.from(map.values()).map(({ family, plans: groupPlans }) => {
    const price_usd = groupPlans.reduce((sum, p) => sum + (p.price_usd || 0), 0);
    const value_usd = groupPlans.reduce((sum, p) => sum + (p.value_usd || 0), 0);
    const multiplier = price_usd > 0 ? value_usd / price_usd : null;
    return {
      family,
      plans: groupPlans,
      totals: {
        price_usd,
        value_usd,
        multiplier,
      },
    };
  });
}

/** Resolve color for provider accent stripes and badges in light/dark themes. */
export function resolveProviderThemeColor(
  colorKey?: string,
  isDark = false
): { bg: string; text: string; border?: string } {
  if (colorKey === 'openDesign') {
    return isDark
      ? { bg: '#3b0764', text: '#c084fc', border: '1px solid #6b21a8' }
      : { bg: '#f3e8ff', text: '#7e22ce', border: '1px solid #d8b4fe' };
  }
  const set = (colorKey && TYPE_COLORS[colorKey]) || TYPE_COLORS.unknown;
  return isDark && set.dark ? set.dark : set.light;
}
