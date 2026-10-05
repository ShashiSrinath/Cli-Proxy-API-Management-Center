import { memo, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import { apiKeyNameFingerprint, readApiKeyNames, saveApiKeyName } from '../../apiKeyNames';
import {
  buildApiKeyProviderOptions,
  normalizeApiKeyProviderId,
  remapApiKeyProviders,
} from '../../apiKeyProviders';
import { copyToClipboard } from '@/utils/clipboard';
import { makeClientId } from '@/types/visualConfig';
import { generateSecureApiKey } from '@/utils/apiKey';
import { maskApiKey } from '@/utils/format';
import { isValidApiKeyCharset } from '@/utils/validation';
import { ApiKeyStrengthMeter } from './ApiKeyStrengthMeter';
import styles from './Blocks.module.scss';

interface ApiKeysCardEditorProps {
  value: string;
  /** Provider allow-lists keyed by API key; keys without an entry may use every provider. */
  providers: Record<string, string[]>;
  disabled?: boolean;
  onChange: (nextValue: string, nextProviders: Record<string, string[]>) => void;
}

export const ApiKeysCardEditor = memo(function ApiKeysCardEditor(props: ApiKeysCardEditorProps) {
  const apiBase = useAuthStore((state) => state.apiBase);
  return <ScopedApiKeysCardEditor key={apiBase} {...props} apiBase={apiBase} />;
});

function ScopedApiKeysCardEditor({
  value,
  providers,
  disabled,
  onChange,
  apiBase,
}: ApiKeysCardEditorProps & { apiBase: string }) {
  const [names, setNames] = useState(() => readApiKeyNames(apiBase));
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
  const nameFingerprints = useMemo(
    () => apiKeys.map((key) => apiKeyNameFingerprint(apiBase, key)),
    [apiBase, apiKeys]
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
  const providersLabelId = useId();
  const providersHintId = `${providersLabelId}-hint`;
  const openaiCompatibility = useConfigStore((state) => state.config?.openaiCompatibility);
  const providerOptions = useMemo(
    () =>
      buildApiKeyProviderOptions(
        (openaiCompatibility ?? []).map((provider) => provider.name),
        providerSelection
      ),
    [openaiCompatibility, providerSelection]
  );

  const openAddModal = () => {
    setProviderSelection([]);
    setCustomProvider('');
    setNameValue('');
    setEditingApiKeyId(null);
    setInputValue('');
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (apiKeyId: string) => {
    const editingIndex = renderApiKeyIds.findIndex((id) => id === apiKeyId);
    const latestNames = readApiKeyNames(apiBase);
    setNames(latestNames);
    setNameValue(latestNames[nameFingerprints[editingIndex]] ?? '');
    setEditingApiKeyId(apiKeyId);
    setInputValue(apiKeys[editingIndex] ?? '');
    setProviderSelection(providers[apiKeys[editingIndex] ?? ''] ?? []);
    setCustomProvider('');
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setInputValue('');
    setEditingApiKeyId(null);
    setFormError('');
  };

  const updateApiKeys = (nextKeys: string[], nextProviders: Record<string, string[]>) => {
    onChange(nextKeys.join('\n'), nextProviders);
  };

  const handleDelete = (apiKeyId: string) => {
    const index = renderApiKeyIds.findIndex((id) => id === apiKeyId);
    if (index < 0) return;
    const nextKeys = apiKeys.filter((_, i) => i !== index);
    const deletedKey = apiKeys[index];
    setApiKeyIds(renderApiKeyIds.filter((id) => id !== apiKeyId));
    updateApiKeys(
      nextKeys,
      nextKeys.includes(deletedKey) ? providers : remapApiKeyProviders(providers, deletedKey, null)
    );
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

    const editingIndex = editingApiKeyId
      ? renderApiKeyIds.findIndex((id) => id === editingApiKeyId)
      : -1;
    const nextKeys =
      editingApiKeyId === null
        ? [...apiKeys, trimmed]
        : apiKeys.map((key, idx) => (idx === editingIndex ? trimmed : key));
    if (!saveApiKeyName(apiBase, trimmed, nameValue)) {
      setFormError(t('config_management.visual.api_keys.name_save_error'));
      return;
    }
    setNames(readApiKeyNames(apiBase));
    // Retain old fingerprints: configuration edits can still be discarded or fail to save.
    if (editingApiKeyId === null) {
      setApiKeyIds([...renderApiKeyIds, makeClientId()]);
    }
    const nextProviders = remapApiKeyProviders(
      providers,
      editingIndex >= 0 ? (apiKeys[editingIndex] ?? null) : null,
      trimmed,
      providerSelection
    );
    if (
      nextKeys.join('\n') !== apiKeys.join('\n') ||
      JSON.stringify(nextProviders) !== JSON.stringify(providers)
    ) {
      updateApiKeys(nextKeys, nextProviders);
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
          {apiKeys.map((key, index) => (
            <div key={renderApiKeyIds[index] ?? `${key}-${index}`} className="item-row">
              <div className="item-meta">
                <div className="pill">#{index + 1}</div>
                <div className="item-title">
                  {names[nameFingerprints[index]] ??
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
          ))}
        </div>
      )}

      <div className="hint">{t('config_management.visual.api_keys.hint')}</div>

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
      </Modal>
    </div>
  );
}
