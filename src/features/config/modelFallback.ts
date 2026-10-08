import type { ModelFallbackRule } from '@/types/visualConfig';
import { normalizeApiKeyProviderId } from './apiKeyProviders';

/**
 * Fallback mode (routing.model-fallback): once a main model is out of limits (HTTP 429 after
 * every credential was tried), the backend reroutes the request to the fallback model.
 */

/** Reasoning effort overrides for the fallback request; '' keeps the client's effort. */
export const MODEL_FALLBACK_REASONING_EFFORTS = [
  '',
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

function normalizeProviders(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.map(normalizeApiKeyProviderId).filter(Boolean)));
}

export function parseModelFallbackEnabled(raw: unknown): boolean {
  return Boolean(asRecord(raw)?.enabled);
}

export function parseModelFallbackRules(raw: unknown): ModelFallbackRule[] {
  const rules = asRecord(raw)?.rules;
  if (!Array.isArray(rules)) return [];
  return rules
    .map((item, index): ModelFallbackRule | null => {
      const record = asRecord(item);
      if (!record) return null;
      return {
        id: `model-fallback-${index}`,
        model: asString(record.model),
        fallbackModel: asString(record['fallback-model']),
        fallbackProviders: normalizeProviders(record['fallback-providers']),
        fallbackReasoningEffort: asString(record['fallback-reasoning-effort']).toLowerCase(),
      };
    })
    .filter((rule): rule is ModelFallbackRule => Boolean(rule));
}

/** Rules without both models are incomplete drafts and are not persisted. */
export function serializeModelFallbackRules(
  rules: ModelFallbackRule[]
): Array<Record<string, unknown>> {
  return rules
    .map((rule) => {
      const model = rule.model.trim();
      const fallbackModel = rule.fallbackModel.trim();
      if (!model || !fallbackModel) return null;
      const item: Record<string, unknown> = { model, 'fallback-model': fallbackModel };
      const providers = normalizeProviders(rule.fallbackProviders);
      if (providers.length > 0) item['fallback-providers'] = providers;
      const effort = rule.fallbackReasoningEffort.trim().toLowerCase();
      if (effort) item['fallback-reasoning-effort'] = effort;
      return item;
    })
    .filter((rule): rule is Record<string, unknown> => Boolean(rule));
}

export function areModelFallbackRulesEqual(
  left: ModelFallbackRule[] | undefined,
  right: ModelFallbackRule[] | undefined
): boolean {
  return (
    JSON.stringify(serializeModelFallbackRules(left ?? [])) ===
      JSON.stringify(serializeModelFallbackRules(right ?? [])) &&
    (left ?? []).length === (right ?? []).length
  );
}

/** Compat aliases (the client-visible names) plus known model ids, without duplicates. */
export function buildModelFallbackModelSuggestions(
  compatProviders: Array<{ models?: Array<{ name: string; alias?: string }> }>,
  modelIds: Iterable<string> = []
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (value: unknown) => {
    const id = asString(value);
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  compatProviders.forEach((provider) =>
    (provider.models ?? []).forEach((model) => add(model.alias || model.name))
  );
  for (const id of modelIds) add(id);
  return out;
}
