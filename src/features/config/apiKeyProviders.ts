/**
 * Upstream provider ids a client API key can be restricted to (access.api-key-providers).
 * Values mirror the backend auth provider keys; an openai-compatibility entry name matches
 * that provider, and "openai-compatibility" matches every openai-compatibility provider.
 */
export const API_KEY_PROVIDER_PRESETS = [
  'gemini',
  'gemini-cli',
  'gemini-interactions',
  'vertex',
  'aistudio',
  'antigravity',
  'codex',
  'claude',
  'xai',
  'meta',
  'devin',
  'kimi',
  'openai-compatibility',
];

export function normalizeApiKeyProviderId(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

/** Presets, then openai-compatibility names, then any extra selected ids, without duplicates. */
export function buildApiKeyProviderOptions(
  compatNames: Iterable<unknown>,
  selected: Iterable<unknown> = []
): string[] {
  const options: string[] = [];
  const seen = new Set<string>();
  const add = (value: unknown) => {
    const id = normalizeApiKeyProviderId(value);
    if (!id || seen.has(id)) return;
    seen.add(id);
    options.push(id);
  };
  API_KEY_PROVIDER_PRESETS.forEach(add);
  for (const name of compatNames) add(name);
  for (const id of selected) add(id);
  return options;
}

/** Moves or removes a key's provider list after the key itself was renamed or deleted. */
export function remapApiKeyProviders(
  current: Record<string, string[]>,
  previousKey: string | null,
  nextKey: string | null,
  providers?: string[]
): Record<string, string[]> {
  const next = { ...current };
  if (previousKey !== null) delete next[previousKey];
  if (nextKey === null) return next;
  const list = providers ?? (previousKey !== null ? current[previousKey] : undefined) ?? [];
  const normalized = Array.from(new Set(list.map(normalizeApiKeyProviderId).filter(Boolean)));
  if (normalized.length > 0) {
    next[nextKey] = normalized;
  } else {
    delete next[nextKey];
  }
  return next;
}
