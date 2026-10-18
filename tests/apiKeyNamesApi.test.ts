import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { apiClient } from '@/services/api/client';
import {
  apiKeyNamesApi,
  areApiKeyNamesEqual,
  getApiKeyName,
  pickApiKeyNames,
} from '@/services/api/apiKeyNames';

const PATH = '/config/access/api-key-names';
const spies: Array<{ mockRestore(): void }> = [];
const spy = (method: 'get' | 'put') => {
  const mocked = spyOn(apiClient, method);
  spies.push(mocked);
  return mocked;
};
afterEach(() => spies.splice(0).forEach((mocked) => mocked.mockRestore()));

const httpError = (status: number, apiCode?: string) =>
  Object.assign(new Error(`status ${status}`), { status, apiCode });

describe('apiKeyNamesApi.list', () => {
  test('an absent field (404 not_found) reads as no names', async () => {
    spy('get').mockRejectedValue(httpError(404, 'not_found'));
    expect(await apiKeyNamesApi.list()).toEqual({});
  });

  test('other 404s and server errors propagate instead of wiping names', async () => {
    const get = spy('get');
    get.mockRejectedValueOnce(httpError(404));
    await expect(apiKeyNamesApi.list()).rejects.toMatchObject({ status: 404 });
    get.mockRejectedValueOnce(httpError(500, 'internal'));
    await expect(apiKeyNamesApi.list()).rejects.toMatchObject({ status: 500 });
  });

  test('reads the server path and keeps only non-blank string names, trimmed', async () => {
    const get = spy('get');
    get.mockResolvedValue({
      'sk-one': '  Alice  ',
      'sk-two': '   ',
      'sk-three': 42,
      'sk-four': null,
      'sk-five': 'Bob',
    });
    expect(await apiKeyNamesApi.list()).toEqual({ 'sk-one': 'Alice', 'sk-five': 'Bob' });
    expect(get).toHaveBeenCalledWith(PATH);
  });

  test('non-object payloads read as no names', async () => {
    const get = spy('get');
    for (const value of [null, 'text', 7, ['Alice'], true]) {
      get.mockResolvedValueOnce(value);
      expect(await apiKeyNamesApi.list()).toEqual({});
    }
  });
});

describe('apiKeyNamesApi.replace', () => {
  test('PUTs the whole map with blank names omitted and names trimmed', async () => {
    const put = spy('put');
    put.mockResolvedValue(undefined);
    await apiKeyNamesApi.replace({ 'sk-one': ' Alice ', 'sk-two': '  ', 'sk-three': 'Carol' });
    expect(put).toHaveBeenCalledWith(PATH, { 'sk-one': 'Alice', 'sk-three': 'Carol' });
  });

  test('sends an empty object to clear every name', async () => {
    const put = spy('put');
    put.mockResolvedValue(undefined);
    await apiKeyNamesApi.replace({ 'sk-one': '' });
    expect(put).toHaveBeenLastCalledWith(PATH, {});
  });

  test('write failures propagate to the caller', async () => {
    spy('put').mockRejectedValue(httpError(500, 'write_failed'));
    await expect(apiKeyNamesApi.replace({ 'sk-one': 'Alice' })).rejects.toMatchObject({
      status: 500,
    });
  });
});

describe('API key name helpers', () => {
  test('getApiKeyName returns trimmed names and never inherited properties', () => {
    expect(getApiKeyName({ 'sk-one': ' Alice ' }, 'sk-one')).toBe('Alice');
    expect(getApiKeyName({ 'sk-one': 'Alice' }, 'sk-two')).toBe('');
    expect(getApiKeyName({}, 'constructor')).toBe('');
    expect(getApiKeyName({}, 'toString')).toBe('');
  });

  test('pickApiKeyNames restricts to listed keys, trims, drops blanks and duplicates', () => {
    const names = { 'sk-one': ' Alice ', 'sk-two': '  ', 'sk-gone': 'Stale' };
    expect(pickApiKeyNames(names, ['sk-one', 'sk-two', 'sk-one', 'sk-new'])).toEqual({
      'sk-one': 'Alice',
    });
    expect(pickApiKeyNames(names, [])).toEqual({});
  });

  test('areApiKeyNamesEqual ignores key order but detects value and key differences', () => {
    expect(areApiKeyNamesEqual({ a: 'One', b: 'Two' }, { b: 'Two', a: 'One' })).toBe(true);
    expect(areApiKeyNamesEqual({ a: 'One' }, { a: 'Other' })).toBe(false);
    expect(areApiKeyNamesEqual({ a: 'One' }, { a: 'One', b: 'Two' })).toBe(false);
    expect(areApiKeyNamesEqual({ a: 'One', b: 'Two' }, { a: 'One', c: 'Two' })).toBe(false);
    expect(areApiKeyNamesEqual({}, {})).toBe(true);
  });
});
