import { describe, expect, test } from 'bun:test';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useVisualConfig } from '../src/hooks/useVisualConfig';
import { readConfiguredApiKeys } from '../src/features/config/hooks/useConfigDocument';

type Visual = ReturnType<typeof useVisualConfig>;

// Render-phase updates exercise the actual hook/reducer without mocking React.
function runSteps(...steps: ((visual: Visual) => void)[]) {
  function Harness() {
    const visual = useVisualConfig();
    const [step, setStep] = useState(0);
    steps[step](visual);
    if (step + 1 < steps.length) setStep(step + 1);
    return null;
  }
  renderToStaticMarkup(createElement(Harness));
}

const yaml = 'server: {port: 8317}\naccess: {api-keys: [sk-one, sk-two]}\n';
const serverNames = { 'sk-one': 'Alice' };

describe('visual config API key names', () => {
  test('a load with matching draft and server names is clean', () => {
    runSteps(
      (v) => {
        v.loadVisualValuesFromYaml(yaml, { server: serverNames, draft: { ...serverNames } });
      },
      (v) => {
        expect(v.visualDirty).toBe(false);
        expect(v.visualValues.apiKeyNames).toEqual(serverNames);
      }
    );
  });

  test('a load whose draft names differ from the server is dirty', () => {
    runSteps(
      (v) => {
        v.loadVisualValuesFromYaml(yaml, {
          server: serverNames,
          draft: { 'sk-one': 'Alicia' },
        });
      },
      (v) => {
        expect([...v.visualDirtyFields]).toEqual(['apiKeyNames']);
        expect(v.visualValues.apiKeyNames).toEqual({ 'sk-one': 'Alicia' });
      }
    );
  });

  test('editing names toggles dirty against the server snapshot, not the YAML', () => {
    runSteps(
      (v) => {
        v.loadVisualValuesFromYaml(yaml, { server: serverNames, draft: serverNames });
      },
      (v) => {
        v.setVisualValues({ apiKeyNames: { 'sk-one': 'Renamed' } });
      },
      (v) => {
        expect(v.visualDirtyFields.has('apiKeyNames')).toBe(true);
        expect(v.visualValues.apiKeyNames).toEqual({ 'sk-one': 'Renamed' });
        v.setVisualValues({ apiKeyNames: { ...serverNames } });
      },
      (v) => {
        expect(v.visualDirty).toBe(false);
      }
    );
  });

  test('name order does not make the draft dirty', () => {
    runSteps(
      (v) => {
        v.loadVisualValuesFromYaml(yaml, {
          server: { 'sk-one': 'Alice', 'sk-two': 'Bob' },
          draft: { 'sk-one': 'Alice', 'sk-two': 'Bob' },
        });
      },
      (v) => {
        v.setVisualValues({ apiKeyNames: { 'sk-two': 'Bob', 'sk-one': 'Alice' } });
      },
      (v) => {
        expect(v.visualDirty).toBe(false);
      }
    );
  });

  test('a YAML-only reload keeps the unsaved name draft and the server snapshot', () => {
    runSteps(
      (v) => {
        v.loadVisualValuesFromYaml(yaml, { server: serverNames, draft: serverNames });
      },
      (v) => {
        v.setVisualValues({ apiKeyNames: { 'sk-one': 'Draft' } });
      },
      (v) => {
        v.loadVisualValuesFromYaml(yaml);
      },
      (v) => {
        expect(v.visualValues.apiKeyNames).toEqual({ 'sk-one': 'Draft' });
        expect(v.visualDirtyFields.has('apiKeyNames')).toBe(true);
        // The snapshot still reflects the server, so a later name save computes its diff correctly.
        v.setVisualValues({ apiKeyNames: { 'sk-one': 'Alice' } });
      },
      (v) => {
        expect(v.visualDirty).toBe(false);
      }
    );
  });

  test('a rebase keeps the retained name draft as dirty', () => {
    const latest = `${yaml}observability: {logs: {debug: true}}\n`;
    runSteps(
      (v) => {
        v.loadVisualValuesFromYaml(yaml, { server: serverNames, draft: serverNames });
      },
      (v) => {
        v.setVisualValues({ apiKeyNames: { 'sk-one': 'Retained' } });
      },
      (v) => {
        expect(v.rebaseVisualValuesFromYaml(latest, latest)).toEqual({ ok: true });
      },
      (v) => {
        expect(v.visualValues.apiKeyNames).toEqual({ 'sk-one': 'Retained' });
        expect(v.visualDirtyFields.has('apiKeyNames')).toBe(true);
        expect(v.visualValues.debug).toBe(true);
      }
    );
  });

  test('a fresh reload with new names replaces both the draft and the snapshot', () => {
    runSteps(
      (v) => {
        v.loadVisualValuesFromYaml(yaml, { server: serverNames, draft: { 'sk-one': 'Draft' } });
      },
      (v) => {
        expect(v.visualDirty).toBe(true);
        v.loadVisualValuesFromYaml(yaml, {
          server: { 'sk-two': 'Bob' },
          draft: { 'sk-two': 'Bob' },
        });
      },
      (v) => {
        expect(v.visualDirty).toBe(false);
        expect(v.visualValues.apiKeyNames).toEqual({ 'sk-two': 'Bob' });
      }
    );
  });

  test('a load without names starts with none and stays clean', () => {
    runSteps(
      (v) => {
        v.loadVisualValuesFromYaml(yaml);
      },
      (v) => {
        expect(v.visualValues.apiKeyNames).toEqual({});
        expect(v.visualDirty).toBe(false);
      }
    );
  });
});

describe('readConfiguredApiKeys', () => {
  test('returns trimmed, non-blank string keys from access.api-keys', () => {
    expect(
      readConfiguredApiKeys(
        'access:\n  api-keys:\n    - " sk-one "\n    - "  "\n    - 7\n    - sk-two\n'
      )
    ).toEqual(['sk-one', 'sk-two']);
  });

  test('returns no keys when the section is missing, malformed, or not a list', () => {
    expect(readConfiguredApiKeys('server: {port: 8317}\n')).toEqual([]);
    expect(readConfiguredApiKeys('access: {api-keys: sk-one}\n')).toEqual([]);
    expect(readConfiguredApiKeys('access: [sk-one]\n')).toEqual([]);
    expect(readConfiguredApiKeys('- sk-one\n')).toEqual([]);
    expect(readConfiguredApiKeys('access: {api-keys: [sk-one\n')).toEqual([]);
    expect(readConfiguredApiKeys('')).toEqual([]);
  });
});
