import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  apiKeyNameFingerprint,
  clearLegacyApiKeyNames,
  migrateLegacyApiKeyNames,
  readApiKeyNames,
} from '../src/features/config/apiKeyNames';
import { obfuscatedStorage } from '../src/services/storage/secureStorage';

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let values: Map<string, string>;

beforeEach(() => {
  values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
});

afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

/** Writes browser entries in the shape the retired editor stored, keyed by fingerprint. */
const seedLegacyNames = (apiBase: string, names: Record<string, string>) => {
  obfuscatedStorage.setItem(
    `api-key-names:v1:${apiBase}`,
    Object.fromEntries(
      Object.entries(names).map(([key, name]) => [apiKeyNameFingerprint(apiBase, key), name])
    )
  );
};

describe('legacy browser API key names', () => {
  test('fingerprints match the scheme older builds wrote, and never contain raw keys', () => {
    const apiBase = 'https://one.test';
    const apiKey = 'sk-fixture-not-a-real-credential';
    const expected = createHash('sha256')
      .update(JSON.stringify(['api-key-name', apiBase, apiKey]))
      .digest('hex');
    expect(apiKeyNameFingerprint(apiBase, apiKey)).toBe(expected);
    seedLegacyNames(apiBase, { [apiKey]: 'Fixture' });
    expect(JSON.stringify(obfuscatedStorage.getItem(`api-key-names:v1:${apiBase}`))).not.toContain(
      apiKey
    );
    expect(apiKeyNameFingerprint('https://two.test', apiKey)).not.toBe(expected);
  });

  test('migrates a legacy name only into a configured key the server has not named', () => {
    seedLegacyNames('https://one.test', { alpha: 'Alice', beta: 'Bob', gamma: 'Carol' });
    expect(
      migrateLegacyApiKeyNames('https://one.test', ['alpha', 'beta'], { beta: 'Server Bob' })
    ).toEqual({ beta: 'Server Bob', alpha: 'Alice' });
    expect(migrateLegacyApiKeyNames('https://two.test', ['alpha'], {})).toEqual({});
  });

  test('handles special property names without prototype pollution', () => {
    // A computed key creates an own property; the literal form would set the prototype instead.
    seedLegacyNames('server', { ['__proto__']: 'Special' });
    const migrated = migrateLegacyApiKeyNames('server', ['__proto__'], {});
    expect(Object.keys(migrated)).toEqual(['__proto__']);
    expect(Object.getOwnPropertyDescriptor(migrated, '__proto__')?.value).toBe('Special');
    expect(Object.getPrototypeOf(migrated)).toBe(Object.prototype);
  });

  test('ignores malformed data and invalid entries', () => {
    values.set('api-key-names:v1:server', '{invalid');
    expect(readApiKeyNames('server')).toEqual({});
    const fingerprint = apiKeyNameFingerprint('server', 'valid');
    obfuscatedStorage.setItem('api-key-names:v1:server', {
      [fingerprint]: 'Name',
      ['a'.repeat(64)]: 4,
      ['b'.repeat(64)]: '',
      'not-a-fingerprint': 'Invalid',
    });
    expect(readApiKeyNames('server')).toEqual({ [fingerprint]: 'Name' });
    obfuscatedStorage.setItem('api-key-names:v1:server', ['Name']);
    expect(readApiKeyNames('server')).toEqual({});
  });

  test('clears only the given keys and removes storage once nothing is left', () => {
    seedLegacyNames('server', { one: 'First', two: 'Second' });
    clearLegacyApiKeyNames('server', ['one']);
    expect(readApiKeyNames('server')).toEqual({
      [apiKeyNameFingerprint('server', 'two')]: 'Second',
    });
    clearLegacyApiKeyNames('server', ['two']);
    expect(values.size).toBe(0);
  });

  test('leaves storage untouched when no legacy entry matches the keys', () => {
    seedLegacyNames('server', { one: 'First' });
    const before = [...values.values()].join('');
    clearLegacyApiKeyNames('server', ['unrelated']);
    expect([...values.values()].join('')).toBe(before);
  });

  test('does not need Web Crypto or a secure context', () => {
    seedLegacyNames('http://lan.test', { 'fixture-key': 'LAN' });
    const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    try {
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
      expect(migrateLegacyApiKeyNames('http://lan.test', ['fixture-key'], {})).toEqual({
        'fixture-key': 'LAN',
      });
    } finally {
      if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
      else Reflect.deleteProperty(globalThis, 'crypto');
    }
  });

  test('reports unavailable storage instead of throwing', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('Storage blocked');
      },
    });
    expect(readApiKeyNames('server')).toEqual({});
    expect(migrateLegacyApiKeyNames('server', ['key'], { key: 'Server' })).toEqual({
      key: 'Server',
    });
    expect(() => clearLegacyApiKeyNames('server', ['key'])).not.toThrow();
  });
});
