/**
 * Per-API-key view of the plan routing order. A client API key can be restricted to a set
 * of upstream providers (access.api-key-providers); the scheduler still applies one global
 * order, so the order a key sees is that global order with disallowed providers removed.
 *
 * Matching mirrors the backend's handlers.ProviderAllowList.Allows so the preview agrees
 * with what the proxy actually accepts.
 */
import type { PlansRouting, RoutingOrderEntry } from '@/types/plans';

const OPENAI_COMPATIBLE_PREFIX = 'openai-compatible-';
const OPENAI_COMPATIBLE_FAMILY = 'openai-compatibility';

/** Mirrors the backend's util.OpenAICompatibleProviderKey. */
export function openAICompatibleProviderKey(name: string): string {
  const clean = name.trim().toLowerCase();
  if (!clean) return OPENAI_COMPATIBLE_FAMILY;
  if (clean === OPENAI_COMPATIBLE_FAMILY || clean.startsWith(OPENAI_COMPATIBLE_PREFIX)) {
    return clean;
  }
  return OPENAI_COMPATIBLE_PREFIX + clean;
}

/**
 * Whether a credential's provider may be used by a key. A missing or empty allow-list
 * means the key is unrestricted, matching the backend.
 */
export function providerAllowed(
  provider: string,
  allowed: readonly string[] | null | undefined
): boolean {
  if (!allowed || allowed.length === 0) return true;
  const target = provider.trim().toLowerCase();
  if (!target) return false;
  for (const raw of allowed) {
    const entry = raw.trim().toLowerCase();
    if (!entry) continue;
    if (entry === target) return true;
    if (openAICompatibleProviderKey(entry) === target) return true;
    if (entry === OPENAI_COMPATIBLE_FAMILY && openAICompatibleProviderKey(target) === target) {
      return true;
    }
  }
  return false;
}

export interface KeyRoutingOrder {
  /** Allowed credentials in order, renumbered from 1 for this key. */
  order: RoutingOrderEntry[];
  /** Credentials in the global order that this key may not use. */
  hidden: number;
}

/** The effective routing order one API key sees. */
export function routingOrderForKey(
  routing: PlansRouting,
  allowed: readonly string[] | null | undefined
): KeyRoutingOrder {
  const ordered = [...routing.order].sort((a, b) => a.rank - b.rank);
  const visible = ordered.filter((entry) => providerAllowed(entry.provider, allowed));
  return {
    order: visible.map((entry, index) => ({ ...entry, rank: index + 1 })),
    hidden: ordered.length - visible.length,
  };
}
