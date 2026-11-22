import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildRoutingRows } from '@/features/plans/routing';
import { RoutingRowItem } from '@/features/plans/RoutingRowItem';
import { getProviderFamily } from '@/features/plans/utils';
import { useNow } from '@/hooks/useNow';
import type { KeyBudgetRow } from '@/types/keyBudgets';
import type { PlansRouting } from '@/types/plans';
import { routingOrderForKey } from './keyRouting';
import plansStyles from '@/features/plans/PlansPage.module.scss';
import styles from './RoutingPage.module.scss';

interface KeyRoutingPanelProps {
  routing: PlansRouting;
  /** Configured client API keys with their provider allow-lists, in config order. */
  keys: KeyBudgetRow[];
}

/** Secret-safe label for a key: its configured name, else the masked value. */
function keyLabel(key: KeyBudgetRow): string {
  return key.name.trim() || key.masked;
}

/**
 * Shows the routing order as each client API key experiences it: the global order with
 * the credentials whose provider the key may not use removed.
 */
export function KeyRoutingPanel({ routing, keys }: KeyRoutingPanelProps) {
  const { t } = useTranslation();
  const now = useNow();
  const titleId = useId();
  const selectId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = keys.find((key) => key.id === selectedId) ?? keys[0] ?? null;
  const view = selected ? routingOrderForKey(routing, selected.providers) : null;
  const rows = view ? buildRoutingRows({ ...routing, order: view.order }, now) : null;

  return (
    <section className={styles.perKey} aria-labelledby={titleId}>
      <div className={styles.perKeyHeader}>
        <h2 id={titleId} className={styles.perKeyTitle}>
          {t('routingPage.perKey.title')}
        </h2>
        <p className={styles.perKeyExplainer}>{t('routingPage.perKey.explainer')}</p>
      </div>

      {keys.length === 0 ? (
        <p className={styles.perKeyEmpty}>{t('routingPage.perKey.empty')}</p>
      ) : (
        <>
          <div className={styles.perKeyControls}>
            <label className={styles.perKeyLabel} htmlFor={selectId}>
              {t('routingPage.perKey.selectLabel')}
            </label>
            <select
              id={selectId}
              className={styles.perKeySelect}
              value={selected?.id ?? ''}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {keys.map((key) => (
                <option key={key.id} value={key.id}>
                  {keyLabel(key)}
                </option>
              ))}
            </select>
            {selected && keyLabel(selected) !== selected.masked && (
              <span className={styles.perKeyMasked} title={t('routingPage.perKey.maskedTitle')}>
                {selected.masked}
              </span>
            )}
          </div>

          {selected && view && rows && (
            <div className={styles.perKeyBody}>
              <div className={styles.perKeyProviders}>
                {selected.providers.length === 0 ? (
                  <span className={styles.perKeyChip}>{t('routingPage.perKey.unrestricted')}</span>
                ) : (
                  <>
                    <span className={styles.perKeyProvidersLabel}>
                      {t('routingPage.perKey.providersLabel')}
                    </span>
                    {selected.providers.map((provider) => (
                      <span key={provider} className={styles.perKeyChip}>
                        {getProviderFamily(provider).name}
                      </span>
                    ))}
                  </>
                )}
                {view.hidden > 0 && (
                  <span className={styles.perKeyHidden}>
                    {t('routingPage.perKey.hidden', { count: view.hidden })}
                  </span>
                )}
              </div>

              {routing.order.length === 0 ? (
                <p className={styles.perKeyEmpty}>{t('plans.routing.empty')}</p>
              ) : view.order.length === 0 ? (
                <p className={styles.perKeyEmpty}>{t('routingPage.perKey.noMatches')}</p>
              ) : (
                <>
                  {rows.active.length > 0 && (
                    <ol className={plansStyles.routingList}>
                      {rows.active.map((row) => (
                        <RoutingRowItem key={row.entry.auth_id} row={row} />
                      ))}
                    </ol>
                  )}
                  {rows.inactive.length > 0 && (
                    <>
                      <h3 className={plansStyles.routingGroupLabel}>
                        {t('plans.routing.inactiveGroup', { count: rows.inactive.length })}
                      </h3>
                      <ol
                        className={`${plansStyles.routingList} ${plansStyles.routingListInactive}`}
                      >
                        {rows.inactive.map((row) => (
                          <RoutingRowItem key={row.entry.auth_id} row={row} />
                        ))}
                      </ol>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
