import { memo, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { ExcludedModelChipRow, ExcludedModelRuleChip } from '@/components/excludedModels';
import { useAuthStore, useConfigStore, useModelsStore, useNotificationStore } from '@/stores';
import { areApiKeyNamesEqual, getApiKeyName, pickApiKeyNames } from '@/services/api/apiKeyNames';
import {
  buildApiKeyProviderOptions,
  normalizeApiKeyProviderId,
  remapApiKeyProviders,
} from '../../apiKeyProviders';
import {
  apiKeyLimitDraft,
  apiKeyLimitFromDraft,
  buildApiKeyModelSuggestions,
  EMPTY_API_KEY_LIMIT_DRAFT,
  formatApiKeyModelPatterns,
  hasApiKeyLimit,
  indexBudgetsByApiKeyMask,
  isApiKeyLimitAmountInvalid,
  isApiKeyTimeZoneInvalid,
  parseApiKeyModelPatterns,
  remapApiKeyEntries,
  type ApiKeyLimitDraft,
} from '../../apiKeyModels';
import { useKeyBudgets } from '@/hooks/useKeyBudgets';
import { copyToClipboard } from '@/utils/clipboard';
import type { ApiKeyLimit, VisualConfigValues } from '@/types/visualConfig';
import { makeClientId } from '@/types/visualConfig';
import { generateSecureApiKey } from '@/utils/apiKey';
import { maskApiKey } from '@/utils/format';
import { isValidApiKeyCharset } from '@/utils/validation';
import { browserTimeZone } from '@/features/dashboard/utils';
import { ApiKeyStrengthMeter } from './ApiKeyStrengthMeter';
import { KeyBudgetMeters } from './KeyBudgetMeters';
import styles from './Blocks.module.scss';

interface ApiKeysCardEditorProps {
  value: string;
  /** Provider allow-lists keyed by API key; keys without an entry may use every provider. */
  providers: Record<string, string[]>;
  /** Model allow-lists keyed by API key; keys without an entry may use every model. */
  models: Record<string, string[]>;
  /** USD spend caps keyed by API key; keys without an entry are uncapped. */
  limits: Record<string, ApiKeyLimit>;
  /** Display names keyed by API key; saved with the configuration, not in this editor. */
  names: Record<string, string>;
  disabled?: boolean;
  onChange: (patch: Partial<VisualConfigValues>) => void;
}

export const ApiKeysCardEditor = memo(function ApiKeysCardEditor(props: ApiKeysCardEditorProps) {
  const apiBase = useAuthStore((state) => state.apiBase);
  return <ScopedApiKeysCardEditor key={apiBase} {...props} />;
});

function ScopedApiKeysCardEditor({
  value,
  providers,
  models,
  limits,
  names,
  disabled,
  onChange,
}: ApiKeysCardEditorProps) {
  const [nameValue, setNameValue] = useState('');
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const apiKeys = useMemo(
    () =>
      value
        .split('\n')
        .map((key) => key.trim())
        .filter(Boolean),
    [value]
  );
  const [apiKeyIds, setApiKeyIds] = useState(() => apiKeys.map(() => makeClientId()));
  const renderApiKeyIds = useMemo(() => {
    if (apiKeyIds.length === apiKeys.length) return apiKeyIds;
    if (apiKeyIds.length > apiKeys.length) return apiKeyIds.slice(0, apiKeys.length);
    return [
      ...apiKeyIds,
      ...Array.from({ length: apiKeys.length - apiKeyIds.length }, () => makeClientId()),
    ];
  }, [apiKeyIds, apiKeys.length]);

  const apiKeyInputId = useId();
  const nameInputId = useId();
  const nameHintId = `${nameInputId}-hint`;
  const apiKeyHintId = `${apiKeyInputId}-hint`;
  const apiKeyErrorId = `${apiKeyInputId}-error`;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingApiKeyId, setEditingApiKeyId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [formError, setFormError] = useState('');
  const [providerSelection, setProviderSelection] = useState<string[]>([]);
  const [customProvider, setCustomProvider] = useState('');
  const [modelsText, setModelsText] = useState('');
  const [limitDraft, setLimitDraft] = useState<ApiKeyLimitDraft>({
    ...EMPTY_API_KEY_LIMIT_DRAFT,
  });
  const [limitError, setLimitError] = useState('');
  const providersLabelId = useId();
  const providersHintId = `${providersLabelId}-hint`;
  const modelsLabelId = useId();
  const modelsHintId = `${modelsLabelId}-hint`;
  const modelsListId = `${modelsLabelId}-list`;
  const limitsLabelId = useId();
  const limitsHintId = `${limitsLabelId}-hint`;
  const openaiCompatibility = useConfigStore((state) => state.config?.openaiCompatibility);
  const knownModels = useModelsStore((state) => state.models);
  const providerOptions = useMemo(
    () =>
      buildApiKeyProviderOptions(
        (openaiCompatibility ?? []).map((provider) => provider.name),
        providerSelection
      ),
    [openaiCompatibility, providerSelection]
  );
  const modelSuggestions = useMemo(
    () =>
      buildApiKeyModelSuggestions(
        openaiCompatibility ?? [],
        knownModels.map((model) => model.name)
      ),
    [openaiCompatibility, knownModels]
  );
  const timezoneSuggestion = useMemo(() => browserTimeZone(), []);
  const modelPatternChips = useMemo(() => parseApiKeyModelPatterns(modelsText), [modelsText]);

  // Spend figures are only useful for keys that actually have a cap configured.
  const { budgets, error: budgetsError } = useKeyBudgets(
    Object.keys(limits).some((key) => hasApiKeyLimit(limits[key]))
  );
  const budgetsByKey = useMemo(
    () => indexBudgetsByApiKeyMask(apiKeys, budgets?.keys ?? []),
    [apiKeys, budgets]
  );

  const openAddModal = () => {
    setProviderSelection([]);
    setCustomProvider('');
    setNameValue('');
    setEditingApiKeyId(null);
    setInputValue('');
    setModelsText('');
    // New keys start from the browser's zone, which the backend otherwise defaults to UTC.
    setLimitDraft({ ...EMPTY_API_KEY_LIMIT_DRAFT, timezone: timezoneSuggestion });
    setLimitError('');
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (apiKeyId: string) => {
    const editingIndex = renderApiKeyIds.findIndex((id) => id === apiKeyId);
    const apiKey = apiKeys[editingIndex] ?? '';
    setNameValue(getApiKeyName(names, apiKey));
    setEditingApiKeyId(apiKeyId);
    setInputValue(apiKey);
    setProviderSelection(providers[apiKey] ?? []);
    setCustomProvider('');
    setModelsText(formatApiKeyModelPatterns(models[apiKey] ?? []));
    setLimitDraft(apiKeyLimitDraft(limits[apiKey]));
    setLimitError('');
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setInputValue('');
    setEditingApiKeyId(null);
    setFormError('');
    setLimitError('');
  };

  const updateApiKeys = (patch: Partial<VisualConfigValues>) => onChange(patch);

  const handleDelete = (apiKeyId: string) => {
    const index = renderApiKeyIds.findIndex((id) => id === apiKeyId);
    if (index < 0) return;
    const nextKeys = apiKeys.filter((_, i) => i !== index);
    const deletedKey = apiKeys[index];
    setApiKeyIds(renderApiKeyIds.filter((id) => id !== apiKeyId));
    const stillConfigured = nextKeys.includes(deletedKey);
    updateApiKeys({
      apiKeysText: nextKeys.join('\n'),
      apiKeyProviders: stillConfigured
        ? providers
        : remapApiKeyProviders(providers, deletedKey, null),
      apiKeyModels: stillConfigured ? models : remapApiKeyEntries(models, deletedKey, null),
      apiKeyLimits: stillConfigured ? limits : remapApiKeyEntries(limits, deletedKey, null),
      apiKeyNames: pickApiKeyNames(names, nextKeys),
    });
  };

  const toggleProvider = (provider: string, checked: boolean) => {
    setProviderSelection((current) =>
      checked
        ? Array.from(new Set([...current, provider]))
        : current.filter((item) => item !== provider)
    );
  };

  const handleAddCustomProvider = () => {
    const provider = normalizeApiKeyProviderId(customProvider);
    if (!provider) return;
    toggleProvider(provider, true);
    setCustomProvider('');
  };

  const handleSave = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setFormError(t('config_management.visual.api_keys.error_empty'));
      return;
    }
    if (!isValidApiKeyCharset(trimmed)) {
      setFormError(t('config_management.visual.api_keys.error_invalid'));
      return;
    }
    const amountInvalid =
      isApiKeyLimitAmountInvalid(limitDraft.daily) ||
      isApiKeyLimitAmountInvalid(limitDraft.weekly) ||
      isApiKeyLimitAmountInvalid(limitDraft.monthly);
    if (amountInvalid) {
      setLimitError(t('config_management.visual.api_keys.limits_error_amount'));
      return;
    }
    if (isApiKeyTimeZoneInvalid(limitDraft.timezone)) {
      setLimitError(t('config_management.visual.api_keys.limits_error_timezone'));
      return;
    }
    setLimitError('');

    const editingIndex = editingApiKeyId
      ? renderApiKeyIds.findIndex((id) => id === editingApiKeyId)
      : -1;
    const nextKeys =
      editingApiKeyId === null
        ? [...apiKeys, trimmed]
        : apiKeys.map((key, idx) => (idx === editingIndex ? trimmed : key));
    // A renamed key carries its name: the new key takes the name field, the old key drops out.
    const nextNames = pickApiKeyNames({ ...names, [trimmed]: nameValue }, nextKeys);
    if (editingApiKeyId === null) {
      setApiKeyIds([...renderApiKeyIds, makeClientId()]);
    }
    const previousKey = editingIndex >= 0 ? (apiKeys[editingIndex] ?? null) : null;
    const nextProviders = remapApiKeyProviders(providers, previousKey, trimmed, providerSelection);
    const modelPatterns = parseApiKeyModelPatterns(modelsText);
    const nextModels = remapApiKeyEntries(models, previousKey, trimmed, modelPatterns);
    if (modelPatterns.length === 0) delete nextModels[trimmed];
    const nextLimitDraft = apiKeyLimitFromDraft(limitDraft);
    const nextLimits = remapApiKeyEntries(
      limits,
      previousKey,
      trimmed,
      nextLimitDraft ?? undefined
    );
    if (!nextLimitDraft) delete nextLimits[trimmed];
    if (
      nextKeys.join('\n') !== apiKeys.join('\n') ||
      JSON.stringify(nextProviders) !== JSON.stringify(providers) ||
      JSON.stringify(nextModels) !== JSON.stringify(models) ||
      JSON.stringify(nextLimits) !== JSON.stringify(limits) ||
      !areApiKeyNamesEqual(nextNames, names)
    ) {
      updateApiKeys({
        apiKeysText: nextKeys.join('\n'),
        apiKeyProviders: nextProviders,
        apiKeyModels: nextModels,
        apiKeyLimits: nextLimits,
        apiKeyNames: nextNames,
      });
    }
    closeModal();
  };

  const handleCopy = async (apiKey: string) => {
    const copied = await copyToClipboard(apiKey);
    showNotification(
      t(copied ? 'notification.link_copied' : 'notification.copy_failed'),
      copied ? 'success' : 'error'
    );
  };

  const handleGenerate = () => {
    setInputValue(generateSecureApiKey());
    setFormError('');
  };

  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <datalist id={modelsListId}>
        {modelSuggestions.map((model) => (
          <option key={model} value={model} />
        ))}
      </datalist>
      <div className={styles.blockHeaderRow}>
        <label style={{ margin: 0 }}>{t('config_management.visual.api_keys.label')}</label>
        <Button size="sm" onClick={openAddModal} disabled={disabled}>
          {t('config_management.visual.api_keys.add')}
        </Button>
      </div>

      {apiKeys.length === 0 ? (
        <div className={styles.emptyState}>{t('config_management.visual.api_keys.empty')}</div>
      ) : (
        <div className="item-list" style={{ marginTop: 4 }}>
          {apiKeys.map((key, index) => {
            const modelPatterns = models[key] ?? [];
            const budget = budgetsByKey.get(key);
            return (
              <div key={renderApiKeyIds[index] ?? `${key}-${index}`} className="item-row">
                <div className="item-meta">
                  <div className="pill">#{index + 1}</div>
                  <div className="item-title">
                    {getApiKeyName(names, key) ||
                      t('config_management.visual.api_keys.input_label')}
                  </div>
                  <div className="item-subtitle">{maskApiKey(String(key || ''))}</div>
                  <div className="item-subtitle">
                    {providers[key]?.length
                      ? t('config_management.visual.api_keys.providers_summary', {
                          providers: providers[key].join(', '),
                        })
                      : t('config_management.visual.api_keys.providers_all')}
                  </div>
                  <div className="item-subtitle">
                    {modelPatterns.length
                      ? t('config_management.visual.api_keys.models_summary', {
                          models: modelPatterns.join(', '),
                        })
                      : t('config_management.visual.api_keys.models_all')}
                  </div>
                  {hasApiKeyLimit(limits[key]) && (
                    <div className={styles.apiKeyRowLimits}>
                      {budget && (
                        <KeyBudgetMeters
                          windows={budget.windows}
                          exceeded={budget.exceeded}
                          disabled={budgets?.enabled === false}
                        />
                      )}
                      <span className="hint">
                        {budgetsError
                          ? t('keyBudgets.states.unavailable')
                          : t('config_management.visual.api_keys.limits_summary', {
                              limits: formatLimitSummary(limits[key], t),
                            })}
                      </span>
                    </div>
                  )}
                </div>
                <div className="item-actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleCopy(key)}
                    disabled={disabled}
                  >
                    {t('common.copy')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openEditModal(renderApiKeyIds[index] ?? '')}
                    disabled={disabled}
                  >
                    {t('config_management.visual.common.edit')}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(renderApiKeyIds[index] ?? '')}
                    disabled={disabled}
                  >
                    {t('config_management.visual.common.delete')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="hint">{t('config_management.visual.api_keys.hint')}</div>
      {Object.keys(limits).some((key) => hasApiKeyLimit(limits[key])) && (
        <>
          <div className="hint">{t('config_management.visual.api_keys.limits_footnote')}</div>
          {budgets && !budgets.enabled && (
            <div className="hint">{t('keyBudgets.trackingDisabled')}</div>
          )}
        </>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={
          editingApiKeyId !== null
            ? t('config_management.visual.api_keys.edit_title')
            : t('config_management.visual.api_keys.add_title')
        }
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={disabled}>
              {t('config_management.visual.common.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={disabled}>
              {editingApiKeyId !== null
                ? t('config_management.visual.common.update')
                : t('config_management.visual.common.add')}
            </Button>
          </>
        }
      >
        <div className="form-group">
          <label htmlFor={nameInputId}>{t('config_management.visual.api_keys.name_label')}</label>
          <input
            id={nameInputId}
            className="input"
            value={nameValue}
            onChange={(event) => setNameValue(event.target.value)}
            placeholder={t('config_management.visual.api_keys.name_placeholder')}
            aria-describedby={nameHintId}
            disabled={disabled}
          />
          <div id={nameHintId} className="hint">
            {t('config_management.visual.api_keys.name_hint')}
          </div>
        </div>
        <div className="form-group">
          <label htmlFor={apiKeyInputId}>
            {t('config_management.visual.api_keys.input_label')}
          </label>
          <div className={styles.apiKeyModalInputRow}>
            <input
              id={apiKeyInputId}
              className="input"
              placeholder={t('config_management.visual.api_keys.input_placeholder')}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={disabled}
              aria-describedby={formError ? `${apiKeyErrorId} ${apiKeyHintId}` : apiKeyHintId}
              aria-invalid={Boolean(formError)}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleGenerate}
              disabled={disabled}
            >
              {t('config_management.visual.api_keys.generate')}
            </Button>
          </div>
          <ApiKeyStrengthMeter value={inputValue} />
          <div id={apiKeyHintId} className="hint">
            {t('config_management.visual.api_keys.input_hint')}
          </div>
          {formError && (
            <div id={apiKeyErrorId} className="error-box">
              {formError}
            </div>
          )}
        </div>
        <div
          className="form-group"
          role="group"
          aria-labelledby={providersLabelId}
          aria-describedby={providersHintId}
        >
          <label id={providersLabelId}>
            {t('config_management.visual.api_keys.providers_label')}
          </label>
          <div className={styles.apiKeyProviderGrid}>
            {providerOptions.map((provider) => (
              <SelectionCheckbox
                key={provider}
                checked={providerSelection.includes(provider)}
                onChange={(checked) => toggleProvider(provider, checked)}
                label={provider}
                disabled={disabled}
              />
            ))}
          </div>
          <div className={styles.apiKeyModalInputRow}>
            <input
              className="input"
              value={customProvider}
              onChange={(event) => setCustomProvider(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleAddCustomProvider();
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
              onClick={handleAddCustomProvider}
              disabled={disabled || !customProvider.trim()}
            >
              {t('config_management.visual.api_keys.providers_custom_add')}
            </Button>
          </div>
          <div id={providersHintId} className="hint">
            {t('config_management.visual.api_keys.providers_hint')}
          </div>
        </div>
        <div
          className="form-group"
          role="group"
          aria-labelledby={modelsLabelId}
          aria-describedby={modelsHintId}
        >
          <label id={modelsLabelId} htmlFor={`${modelsLabelId}-input`}>
            {t('config_management.visual.api_keys.models_label')}
          </label>
          <input
            id={`${modelsLabelId}-input`}
            className="input"
            list={modelsListId}
            value={modelsText}
            onChange={(event) => setModelsText(event.target.value)}
            placeholder={t('config_management.visual.api_keys.models_placeholder')}
            disabled={disabled}
            aria-describedby={modelsHintId}
          />
          {modelPatternChips.length > 0 && (
            <ExcludedModelChipRow>
              {modelPatternChips.map((pattern) => (
                <ExcludedModelRuleChip
                  key={pattern}
                  label={pattern}
                  variant={pattern.includes('*') ? 'wildcard' : 'exact'}
                  disabled={disabled}
                  removeAriaLabel={t('config_management.visual.api_keys.models_remove', {
                    model: pattern,
                  })}
                  onRemove={() =>
                    setModelsText(
                      formatApiKeyModelPatterns(
                        modelPatternChips.filter(
                          (item) => item.toLowerCase() !== pattern.toLowerCase()
                        )
                      )
                    )
                  }
                />
              ))}
            </ExcludedModelChipRow>
          )}
          <div id={modelsHintId} className="hint">
            {t('config_management.visual.api_keys.models_hint')}{' '}
            <code className={styles.apiKeyModelsHintCode}>*</code>
          </div>
        </div>
        <div
          className="form-group"
          role="group"
          aria-labelledby={limitsLabelId}
          aria-describedby={limitsHintId}
        >
          <label id={limitsLabelId}>{t('config_management.visual.api_keys.limits_label')}</label>
          <div className={styles.apiKeyLimitGrid}>
            {(
              [
                ['daily', 'limits_daily'],
                ['weekly', 'limits_weekly'],
                ['monthly', 'limits_monthly'],
              ] as const
            ).map(([field, labelKey]) => (
              <label key={field} className={styles.apiKeyLimitField}>
                <span>{t(`config_management.visual.api_keys.${labelKey}`)}</span>
                <div className={styles.apiKeyLimitCurrency}>
                  <span aria-hidden="true">$</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={limitDraft[field]}
                    onChange={(event) =>
                      setLimitDraft((current) => ({ ...current, [field]: event.target.value }))
                    }
                    placeholder={t('config_management.visual.api_keys.limits_placeholder')}
                    disabled={disabled}
                    aria-label={t(`config_management.visual.api_keys.${labelKey}`)}
                  />
                </div>
              </label>
            ))}
          </div>
          <label className={styles.apiKeyLimitField} style={{ marginTop: 10 }}>
            <span>{t('config_management.visual.api_keys.limits_timezone')}</span>
            <div className={styles.apiKeyModalInputRow}>
              <input
                className="input"
                value={limitDraft.timezone}
                onChange={(event) =>
                  setLimitDraft((current) => ({ ...current, timezone: event.target.value }))
                }
                placeholder={timezoneSuggestion || 'UTC'}
                disabled={disabled}
                aria-label={t('config_management.visual.api_keys.limits_timezone')}
              />
              {!limitDraft.timezone.trim() && timezoneSuggestion && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setLimitDraft((current) => ({ ...current, timezone: timezoneSuggestion }))
                  }
                  disabled={disabled}
                >
                  {t('config_management.visual.api_keys.limits_timezone_suggest', {
                    timezone: timezoneSuggestion,
                  })}
                </Button>
              )}
            </div>
          </label>
          <div id={limitsHintId} className="hint">
            {t('config_management.visual.api_keys.limits_hint')}
          </div>
          {limitError && (
            <div className="error-box" role="alert">
              {limitError}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

/** "Daily $5.00 · Monthly $60.00 · Asia/Kolkata" for keys whose live spend is not available. */
function formatLimitSummary(limit: ApiKeyLimit, t: (key: string) => string): string {
  const parts: string[] = [];
  if (typeof limit.dailyUsd === 'number') {
    parts.push(`${t('keyBudgets.period.day')} $${limit.dailyUsd.toFixed(2)}`);
  }
  if (typeof limit.weeklyUsd === 'number') {
    parts.push(`${t('keyBudgets.period.week')} $${limit.weeklyUsd.toFixed(2)}`);
  }
  if (typeof limit.monthlyUsd === 'number') {
    parts.push(`${t('keyBudgets.period.month')} $${limit.monthlyUsd.toFixed(2)}`);
  }
  if (limit.timezone) parts.push(limit.timezone);
  return parts.join(' · ');
}
