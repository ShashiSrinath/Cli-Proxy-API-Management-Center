import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconChevronDown, IconNetwork } from '@/components/ui/icons';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useNow } from '@/hooks/useNow';
import type { PlansRouting } from '@/types/plans';
import { buildRoutingRows } from './routing';
import styles from './PlansPage.module.scss';
import { RoutingRowItem } from './RoutingRowItem';
import { relativeTime } from './utils';

interface RoutingPanelProps {
  routing: PlansRouting;
  /** Smart routing value to display while a toggle request is in flight. */
  pendingEnabled?: boolean | null;
  busy?: boolean;
  disabled?: boolean;
  onToggle: (enabled: boolean) => void;
}

export function RoutingPanel({
  routing,
  pendingEnabled = null,
  busy = false,
  disabled = false,
  onToggle,
}: RoutingPanelProps) {
  const { t } = useTranslation();
  const now = useNow();
  const bodyId = useId();
  const [open, setOpen] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const { active, inactive } = buildRoutingRows(routing, now);
  const enabled = pendingEnabled ?? routing.enabled;

  const renderRow = (row: (typeof active)[number]) => (
    <RoutingRowItem key={row.entry.auth_id} row={row} advanced={advanced} />
  );

  return (
    <section className={styles.routingPanel} aria-label={t('plans.routing.title')}>
      <div className={styles.routingHeader}>
        <div className={styles.routingHeadText}>
          <h2 className={styles.routingTitle}>
            <button
              type="button"
              className={styles.routingToggleBtn}
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => setOpen((v) => !v)}
            >
              <IconNetwork size={16} />
              <span>{t('plans.routing.title')}</span>
              <span className={styles.groupCountBadge}>
                {t('plans.routing.summary', { active: active.length, paused: inactive.length })}
              </span>
              <IconChevronDown
                size={16}
                className={`${styles.chevronIcon} ${open ? styles.chevronOpen : ''}`}
              />
            </button>
          </h2>
          <p className={styles.routingExplainer}>{t('plans.routing.explainer')}</p>
        </div>
        <div className={styles.routingControls}>
          {routing.computed_at && (
            <span className={styles.routingUpdated}>
              {t('plans.routing.updated', { time: relativeTime(routing.computed_at) })}
            </span>
          )}
          <ToggleSwitch
            checked={enabled}
            onChange={onToggle}
            disabled={busy || disabled}
            label={t('plans.routing.smartRouting')}
            ariaLabel={t('plans.routing.smartRoutingHint')}
            labelPosition="left"
          />
        </div>
      </div>

      {open && (
        <div id={bodyId} className={styles.routingBody}>
          {!enabled && <p className={styles.routingManualNote}>{t('plans.routing.manualNote')}</p>}
          {routing.order.length === 0 ? (
            <p className={styles.routingEmpty}>{t('plans.routing.empty')}</p>
          ) : (
            <>
              {active.length > 0 && <ol className={styles.routingList}>{active.map(renderRow)}</ol>}
              {inactive.length > 0 && (
                <>
                  <h3 className={styles.routingGroupLabel}>
                    {t('plans.routing.inactiveGroup', { count: inactive.length })}
                  </h3>
                  <ol className={`${styles.routingList} ${styles.routingListInactive}`}>
                    {inactive.map(renderRow)}
                  </ol>
                </>
              )}
            </>
          )}
          <div className={styles.routingFooter}>
            <span>{t('plans.routing.outsideNote')}</span>
            <button
              type="button"
              className={styles.routingAdvancedBtn}
              aria-pressed={advanced}
              onClick={() => setAdvanced((v) => !v)}
            >
              {t(advanced ? 'plans.routing.hideAdvanced' : 'plans.routing.showAdvanced')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
