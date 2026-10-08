import { memo, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { useConfigStore, useModelsStore } from '@/stores';
import type { ModelFallbackRule } from '@/types/visualConfig';
import { makeClientId } from '@/types/visualConfig';
import { buildApiKeyProviderOptions, normalizeApiKeyProviderId } from '../../apiKeyProviders';
import {
  buildModelFallbackModelSuggestions,
  MODEL_FALLBACK_REASONING_EFFORTS,
} from '../../modelFallback';
import styles from './Blocks.module.scss';

const T = 'config_management.visual.sections.network';

const createModelFallbackRule = (): ModelFallbackRule => ({
  id: makeClientId(),
  model: '',
  fallbackModel: '',
  fallbackProviders: [],
  fallbackReasoningEffort: '',
});

export const ModelFallbackRulesEditor = memo(function ModelFallbackRulesEditor({
  value,
  disabled,
  onChange,
}: {
  value: ModelFallbackRule[];
  disabled?: boolean;
  onChange: (next: ModelFallbackRule[]) => void;
}) {
  const { t } = useTranslation();
  const modelListId = useId();
  const [customProviders, setCustomProviders] = useState<Record<string, string>>({});
  const openaiCompatibility = useConfigStore((state) => state.config?.openaiCompatibility);
  const knownModels = useModelsStore((state) => state.models);

  const modelSuggestions = useMemo(
    () =>
      buildModelFallbackModelSuggestions(
        openaiCompatibility ?? [],
        knownModels.map((model) => model.name)
      ),
    [openaiCompatibility, knownModels]
  );
  const compatNames = useMemo(
    () => (openaiCompatibility ?? []).map((provider) => provider.name),
    [openaiCompatibility]
  );
  const effortOptions = MODEL_FALLBACK_REASONING_EFFORTS.map((effort) => ({
    value: effort,
    label: effort || t(`${T}.model_fallback_effort_default`),
  }));

  const updateRule = (id: string, patch: Partial<ModelFallbackRule>) => {
    onChange(value.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  };
  const addRule = () => onChange([...value, createModelFallbackRule()]);
  const removeRule = (id: string) => onChange(value.filter((rule) => rule.id !== id));
  const toggleProvider = (rule: ModelFallbackRule, provider: string, checked: boolean) => {
    updateRule(rule.id, {
      fallbackProviders: checked
        ? Array.from(new Set([...rule.fallbackProviders, provider]))
        : rule.fallbackProviders.filter((item) => item !== provider),
    });
  };
  const addCustomProvider = (rule: ModelFallbackRule) => {
    const provider = normalizeApiKeyProviderId(customProviders[rule.id]);
    if (!provider) return;
    toggleProvider(rule, provider, true);
    setCustomProviders((current) => ({ ...current, [rule.id]: '' }));
  };

  return (
    <div className={styles.storeAuthEditor}>
      <datalist id={modelListId}>
        {modelSuggestions.map((model) => (
          <option key={model} value={model} />
        ))}
      </datalist>
      {value.length === 0 ? (
        <p className={styles.storeAuthEmpty}>{t(`${T}.model_fallback_empty`)}</p>
      ) : null}
      {value.map((rule) => {
        const providerOptions = buildApiKeyProviderOptions(compatNames, rule.fallbackProviders);
        return (
          <div key={rule.id} className={styles.storeAuthRule}>
            <div className={styles.storeAuthRuleHeader}>
              <strong>
                {rule.model || rule.fallbackModel
                  ? `${rule.model || '?'} → ${rule.fallbackModel || '?'}`
                  : t(`${T}.model_fallback_rule`)}
              </strong>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeRule(rule.id)}
                disabled={disabled}
              >
                {t('config_management.visual.common.delete')}
              </Button>
            </div>
            <div className={styles.storeAuthGrid}>
              <label className={styles.storeAuthField}>
                <span>{t(`${T}.model_fallback_main_model`)}</span>
                <input
                  className="input"
                  list={modelListId}
                  value={rule.model}
                  placeholder="gpt-6.1-sol"
                  disabled={disabled}
                  onChange={(event) => updateRule(rule.id, { model: event.target.value })}
                />
              </label>
              <label className={styles.storeAuthField}>
                <span>{t(`${T}.model_fallback_fallback_model`)}</span>
                <input
                  className="input"
                  list={modelListId}
                  value={rule.fallbackModel}
                  placeholder="deepseek-v4.1-flash"
                  disabled={disabled}
                  onChange={(event) => updateRule(rule.id, { fallbackModel: event.target.value })}
                />
              </label>
              <label className={styles.storeAuthField}>
                <span>{t(`${T}.model_fallback_effort`)}</span>
                <Select
                  value={rule.fallbackReasoningEffort}
                  options={effortOptions}
                  disabled={disabled}
                  ariaLabel={t(`${T}.model_fallback_effort`)}
                  onChange={(fallbackReasoningEffort) =>
                    updateRule(rule.id, { fallbackReasoningEffort })
                  }
                />
              </label>
            </div>

            <div className={styles.storeAuthApplyTo}>
              <span>{t(`${T}.model_fallback_providers`)}</span>
              <div className={styles.apiKeyProviderGrid}>
                {providerOptions.map((provider) => (
                  <SelectionCheckbox
                    key={provider}
                    checked={rule.fallbackProviders.includes(provider)}
                    onChange={(checked) => toggleProvider(rule, provider, checked)}
                    label={provider}
                    disabled={disabled}
                  />
                ))}
              </div>
              <div className={styles.apiKeyModalInputRow}>
                <input
                  className="input"
                  value={customProviders[rule.id] ?? ''}
                  onChange={(event) =>
                    setCustomProviders((current) => ({
                      ...current,
                      [rule.id]: event.target.value,
                    }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addCustomProvider(rule);
                    }
                  }}
                  placeholder={t('config_management.visual.api_keys.providers_custom_placeholder')}
                  aria-label={t('config_management.visual.api_keys.providers_custom_placeholder')}
                  disabled={disabled}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => addCustomProvider(rule)}
                  disabled={disabled || !(customProviders[rule.id] ?? '').trim()}
                >
                  {t('config_management.visual.api_keys.providers_custom_add')}
                </Button>
              </div>
              <small>{t(`${T}.model_fallback_providers_hint`)}</small>
            </div>
          </div>
        );
      })}
      <div className={styles.actionRow}>
        <Button variant="secondary" size="sm" onClick={addRule} disabled={disabled}>
          {t(`${T}.model_fallback_add`)}
        </Button>
      </div>
    </div>
  );
});
