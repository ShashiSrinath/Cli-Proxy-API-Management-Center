// One-time migration only: names now live on the server (access.api-key-names). These helpers
// read names that older builds kept in browser storage and clear them after a successful save.
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { apiKeysApi } from '@/services/api/apiKeys';
import { apiKeyNamesApi, areApiKeyNamesEqual, getApiKeyName } from '@/services/api/apiKeyNames';
import { guardConfigConnection } from '@/services/api/configValue';
import { obfuscatedStorage } from '@/services/storage/secureStorage';

const STORAGE_PREFIX = 'api-key-names:v1:';

/** Legacy entries were addressed by this fingerprint, so storage never held raw keys. */
export function apiKeyNameFingerprint(apiBase: string, apiKey: string): string {
  const input = JSON.stringify(['api-key-name', apiBase, apiKey]);
  // Pure JS hashing also works when the panel is served over non-localhost HTTP.
  return bytesToHex(sha256(new TextEncoder().encode(input)));
}

export function readApiKeyNames(apiBase: string): Record<string, string> {
  try {
    const stored = obfuscatedStorage.getItem<unknown>(STORAGE_PREFIX + apiBase);
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.fromEntries(
      Object.entries(stored).filter(
        (entry): entry is [string, string] =>
          /^[a-f0-9]{64}$/.test(entry[0]) && typeof entry[1] === 'string' && !!entry[1].trim()
      )
    );
  } catch {
    return {};
  }
}

/** Server names win; a legacy name only fills a configured key that the server has not named. */
export function migrateLegacyApiKeyNames(
  apiBase: string,
  apiKeys: readonly string[],
  serverNames: Record<string, string>
): Record<string, string> {
  const legacy = readApiKeyNames(apiBase);
  const migrated: [string, string][] = [];
  for (const key of new Set(apiKeys)) {
    if (getApiKeyName(serverNames, key)) continue;
    const name = legacy[apiKeyNameFingerprint(apiBase, key)];
    if (name) migrated.push([key, name]);
  }
  return Object.fromEntries([...Object.entries(serverNames), ...migrated]);
}

/** Call only after the server has saved names for these keys, so migrated entries are not re-read. */
export function clearLegacyApiKeyNames(apiBase: string, apiKeys: readonly string[]): void {
  try {
    const legacy = readApiKeyNames(apiBase);
    const fingerprints = apiKeys.map((key) => apiKeyNameFingerprint(apiBase, key));
    if (!fingerprints.some((fingerprint) => fingerprint in legacy)) return;
    for (const fingerprint of fingerprints) delete legacy[fingerprint];
    const storageKey = STORAGE_PREFIX + apiBase;
    if (Object.keys(legacy).length) obfuscatedStorage.setItem(storageKey, legacy);
    else obfuscatedStorage.removeItem(storageKey);
  } catch {
    // Storage unavailable: nothing readable was left to clear.
  }
}

/**
 * Copies legacy browser names for configured keys to the server without waiting for a config
 * save, so views that only read server names (the usage dashboard) show them. Returns true
 * when names were written.
 */
export async function syncLegacyApiKeyNames(apiBase: string): Promise<boolean> {
  if (!Object.keys(readApiKeyNames(apiBase)).length) return false;
  const assertConnection = guardConfigConnection();
  const [apiKeys, serverNames] = await Promise.all([apiKeysApi.list(), apiKeyNamesApi.list()]);
  const merged = migrateLegacyApiKeyNames(apiBase, apiKeys, serverNames);
  if (areApiKeyNamesEqual(merged, serverNames)) return false;
  assertConnection();
  await apiKeyNamesApi.replace(merged);
  clearLegacyApiKeyNames(apiBase, apiKeys);
  return true;
}
