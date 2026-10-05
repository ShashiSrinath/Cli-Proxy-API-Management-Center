/**
 * Validation and type checking functions for quota management.
 */

import type { AuthFileItem } from '@/types';

export function resolveAuthProvider(file: AuthFileItem): string {
  const raw = file.provider ?? file.type ?? '';
  const key = String(raw).trim().toLowerCase().replace(/_/g, '-');
  if (key === 'x-ai' || key === 'grok') return 'xai';
  // Kimi International (kimi.ai) accounts share Kimi's quota API on another host.
  if (key === 'kimi-ai') return 'kimi';
  return key;
}

export function isAntigravityFile(file: AuthFileItem): boolean {
  return resolveAuthProvider(file) === 'antigravity';
}

export function isClaudeFile(file: AuthFileItem): boolean {
  return resolveAuthProvider(file) === 'claude';
}

export function isCodexFile(file: AuthFileItem): boolean {
  return resolveAuthProvider(file) === 'codex';
}

export function isDevinFile(file: AuthFileItem): boolean {
  return resolveAuthProvider(file) === 'devin';
}

export function isKimiFile(file: AuthFileItem): boolean {
  return resolveAuthProvider(file) === 'kimi';
}

export function isXaiFile(file: AuthFileItem): boolean {
  return resolveAuthProvider(file) === 'xai';
}

/**
 * OpenCode Go keys are config-defined OpenAI-compatible entries whose provider key
 * follows the user's entry name, so detect them by the backend quota probe URL.
 */
export function isOpencodeGoFile(file: AuthFileItem): boolean {
  const probe = (file as { quota_probe?: unknown }).quota_probe;
  const url =
    probe && typeof probe === 'object' && typeof (probe as { url?: unknown }).url === 'string'
      ? (probe as { url: string }).url.toLowerCase()
      : '';
  return (
    url.includes('opencode.ai/zen/go') ||
    resolveAuthProvider(file) === 'openai-compatible-opencode-go'
  );
}

export function isDisabledAuthFile(file: AuthFileItem): boolean {
  const raw = (file as { disabled?: unknown }).disabled;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  if (typeof raw === 'string') return raw.trim().toLowerCase() === 'true';
  return false;
}
