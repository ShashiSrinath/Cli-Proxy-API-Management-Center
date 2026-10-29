import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { apiClient } from '@/services/api/client';
import { usagePlansApi } from '@/services/api/usagePlans';
import type { AvailablePlanCredential, SubscriptionPlan } from '@/types/plans';
import { presets, presetProviders, uniqueSlug } from './utils';
import styles from './PlansPage.module.scss';

type Draft = {
  id: string;
  name: string;
  provider: string;
  price: string;
  cycle: 'monthly' | 'weekly' | 'yearly';
  anchor: string;
  credentials: string[];
  notes: string;
};
export function PlanEditor({
  initial,
  providers,
  credentials,
  close,
  saved,
}: {
  initial?: Partial<SubscriptionPlan>;
  providers: string[];
  credentials: AvailablePlanCredential[];
  close: () => void;
  saved: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>({
    id: initial?.id ?? '',
    name: initial?.name ?? '',
    provider: initial?.provider ?? '',
    price: initial?.['price-usd']?.toString() ?? '',
    cycle: initial?.cycle ?? 'monthly',
    anchor: initial?.['anchor-date'] ?? '',
    credentials: initial?.credentials ?? [],
    notes: initial?.notes ?? '',
  });
  const [connectionRevision] = useState(() => apiClient.getConnectionRevision());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const patch = (values: Partial<Draft>) => setDraft((old) => ({ ...old, ...values }));
  const save = async () => {
    if (
      !draft.name.trim() ||
      !draft.provider ||
      draft.price.trim() === '' ||
      !Number.isFinite(Number(draft.price)) ||
      Number(draft.price) < 0
    ) {
      setError(t('plans.validation'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (connectionRevision !== apiClient.getConnectionRevision())
        throw new Error(t('plans.connectionChanged'));
      await usagePlansApi.update((plans) => {
        const id =
          draft.id ||
          uniqueSlug(
            draft.name,
            plans.map((p) => p.id)
          );
        const plan: SubscriptionPlan = {
          id,
          name: draft.name.trim(),
          provider: draft.provider,
          'price-usd': Number(draft.price),
          cycle: draft.cycle,
          'anchor-date': draft.anchor,
          credentials: draft.credentials,
          notes: draft.notes,
        };
        if (draft.id && !plans.some((p) => p.id === id)) throw new Error(t('plans.missingPlan'));
        return draft.id ? plans.map((p) => (p.id === id ? plan : p)) : [...plans, plan];
      });
      saved();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('plans.saveFailed'));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!window.confirm(t('plans.deleteConfirm', { name: draft.name }))) return;
    setBusy(true);
    setError('');
    try {
      if (connectionRevision !== apiClient.getConnectionRevision())
        throw new Error(t('plans.connectionChanged'));
      await usagePlansApi.update((plans) => plans.filter((p) => p.id !== draft.id));
      saved();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('plans.saveFailed'));
    } finally {
      setBusy(false);
    }
  };
  const providerOptions = Array.from(new Set([...providers, draft.provider].filter(Boolean)));
  return (
    <Modal
      open
      title={t(draft.id ? 'plans.editPlan' : 'plans.addPlan')}
      onClose={close}
      closeDisabled={busy}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            {t('common.cancel')}
          </Button>
          {draft.id && (
            <Button variant="danger" onClick={() => void remove()} disabled={busy}>
              {t('plans.delete')}
            </Button>
          )}
          <Button onClick={() => void save()} loading={busy}>
            {t('plans.save')}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <label>
          {t('plans.preset')}
          <select
            defaultValue=""
            onChange={(e) => {
              const p = presets[Number(e.target.value)];
              if (!p || e.target.value === '') return;
              const matches = presetProviders(p.provider, providers);
              patch({
                name: p.name,
                provider: matches[0] ?? (p.provider === 'openai-compatible-' ? '' : p.provider),
                price: p.price === null ? '' : String(p.price),
                credentials: [],
              });
            }}
          >
            <option value="">{t('plans.custom')}</option>
            {presets.map((p, i) => (
              <option value={i} key={p.name}>
                {p.name}
                {p.price !== null ? ` · $${p.price}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('plans.name')}
          <input value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
        </label>
        <label>
          {t('plans.provider')}
          <select
            value={draft.provider}
            onChange={(e) => patch({ provider: e.target.value, credentials: [] })}
          >
            <option value="">{t('plans.selectProvider')}</option>
            {providerOptions.map((p) => (
              <option value={p} key={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('plans.price')}
          <input
            type="number"
            min="0"
            step="0.01"
            value={draft.price}
            onChange={(e) => patch({ price: e.target.value })}
          />
        </label>
        <label>
          {t('plans.cycle')}
          <select
            value={draft.cycle}
            onChange={(e) => patch({ cycle: e.target.value as Draft['cycle'] })}
          >
            {(['monthly', 'weekly', 'yearly'] as const).map((c) => (
              <option value={c} key={c}>
                {t(`plans.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('plans.anchor')}
          <input
            type="date"
            value={draft.anchor}
            onChange={(e) => patch({ anchor: e.target.value })}
          />
          <small>{t('plans.anchorHint')}</small>
        </label>
        <fieldset>
          <legend>{t('plans.credentials')}</legend>
          <small>{t('plans.credentialsHint')}</small>
          {credentials
            .filter((c) => c.provider === draft.provider)
            .map((c) => (
              <label className={styles.checkbox} key={c.auth_id}>
                <input
                  type="checkbox"
                  checked={draft.credentials.includes(c.auth_id)}
                  onChange={(e) =>
                    patch({
                      credentials: e.target.checked
                        ? [...draft.credentials, c.auth_id]
                        : draft.credentials.filter((id) => id !== c.auth_id),
                    })
                  }
                />
                {c.label} {c.plan_id && <small>({t('plans.ownedBy', { plan: c.plan_id })})</small>}
              </label>
            ))}
        </fieldset>
        <label>
          {t('plans.notes')}
          <textarea value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} />
        </label>
        {error && (
          <p role="alert" className={styles.warning}>
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
