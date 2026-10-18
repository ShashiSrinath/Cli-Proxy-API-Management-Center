/** Client API key names live at access.api-key-names as one map from raw key to name. */
import { apiClient } from './client';
import { getConfigValue } from './configValue';

const PATH = '/config/access/api-key-names';

const hasOwn = (names: Record<string, string>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(names, key);

/** Drops non-string and blank names; kept names are trimmed. */
const normalizeNames = (value: unknown): Record<string, string> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries: [string, string][] = [];
  for (const [key, name] of Object.entries(value)) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (trimmed) entries.push([key, trimmed]);
  }
  return Object.fromEntries(entries);
};

/** The trimmed name for a key, or '' when the key has none. */
export function getApiKeyName(names: Record<string, string>, apiKey: string): string {
  return hasOwn(names, apiKey) ? names[apiKey].trim() : '';
}

/** Names for the given keys only, so renamed or removed keys cannot keep stale names. */
export function pickApiKeyNames(
  names: Record<string, string>,
  apiKeys: readonly string[]
): Record<string, string> {
  const entries: [string, string][] = [];
  for (const key of new Set(apiKeys)) {
    const name = getApiKeyName(names, key);
    if (name) entries.push([key, name]);
  }
  return Object.fromEntries(entries);
}

export function areApiKeyNamesEqual(
  left: Record<string, string>,
  right: Record<string, string>
): boolean {
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => hasOwn(right, key) && left[key] === right[key])
  );
}

export const apiKeyNamesApi = {
  /** An absent field means no names are set, the same as an empty config list. */
  async list(): Promise<Record<string, string>> {
    return normalizeNames(await getConfigValue<unknown>(PATH, {}));
  },

  /** Blank names are omitted, and an empty map clears every name. */
  async replace(names: Record<string, string>): Promise<void> {
    await apiClient.put(PATH, normalizeNames(names));
  },
};
