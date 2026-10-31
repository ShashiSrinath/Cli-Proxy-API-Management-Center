import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconChevronDown, IconNetwork } from '@/components/ui/icons';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useNow } from '@/hooks/useNow';
import type { PlansRouting } from '@/types/plans';
import { BrandLogo } from './BrandLogo';
import { buildRoutingRows, countdown, windowLabelKey, type RoutingRow } from './routing';
import { getProviderFamily, getWindowMeterTier, relativeTime } from './utils';
import styles from './PlansPage.module.scss';

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

  const windowName = (label: string) => {
    const key = windowLabelKey(label);
    return key ? t(`plans.routing.window.${key}`) : label;
  };

  const statusText = (row: RoutingRow): string => {
    const { entry, status } = row;
    if (status !== 'paused') return t(`plans.routing.status.${status}`);
    const time = countdown(entry.paused_until, now);
    if (entry.paused_window && time)
      return t('plans.routing.status.pausedDetail', {
        window: windowName(entry.paused_window),
        time,
      });
    if (entry.paused_window)
      return t('plans.routing.status.pausedWindow', { window: windowName(entry.paused_window) });
    if (time) return t('plans.routing.status.pausedUntil', { time });
    return t('plans.routing.status.paused');
  };

  const resetText = (row: RoutingRow): string => {
    const { reset } = row;
    if (reset.kind === 'unknown') return t('plans.routing.reset.unknown');
    if (reset.kind === 'due') return t('plans.routing.reset.due');
    return reset.estimated
      ? t('plans.routing.reset.estimated', { time: reset.duration })
      : t('plans.routing.reset.in', { time: reset.duration });
  };

  const renderRow = (row: RoutingRow) => {
    const { entry, status } = row;
    const family = getProviderFamily(entry.provider);
    const label = entry.label || entry.auth_id;
    const remaining = entry.remaining_fraction;
    const remainingPct = remaining == null ? null : Math.round(remaining * 100);
    return (
      <li
        key={entry.auth_id}
        className={`${styles.routingRow} ${styles['routingRow_' + status]}`}
        aria-current={status === 'serving' ? 'true' : undefined}
      >
        <span
          className={styles.rankBadge}
          aria-label={t('plans.routing.rankLabel', { rank: entry.rank })}
        >
          #{entry.rank}
        </span>
        <BrandLogo brandKey={family.brandKey} size={22} />
        <div className={styles.routingMain}>
          <div className={styles.routingTitleRow}>
            <strong className={styles.routingLabel} title={label}>
              {label}
            </strong>
            {entry.plan_name && <span className={styles.routingPlanName}>{entry.plan_name}</span>}
          </div>
          <div className={styles.routingChips}>
            <span
              className={styles.routingChip}
              title={t(`plans.routing.limitSourceHint.${entry.limit_type_source}`)}
            >
              {t(`plans.routing.limit.${entry.limit_type}`)}
              <span className={styles.routingChipHint}>
                · {t(`plans.routing.limitSource.${entry.limit_type_source}`)}
              </span>
            </span>
            {entry.routing !== 'auto' && (
              <span className={`${styles.routingChip} ${styles['routingChip_' + entry.routing]}`}>
                {t(`plans.routing.override.${entry.routing}`)}
              </span>
            )}
            <span
              className={`${styles.routingChip} ${
                row.reset.kind === 'in' && row.reset.estimated ? styles.routingChipMuted : ''
              }`}
            >
              {resetText(row)}
            </span>
            {advanced && (
              <span
                className={`${styles.routingChip} ${styles.routingChipMono}`}
                title={t('plans.routing.priorityHint')}
              >
                {t('plans.routing.priority', { value: entry.priority })}
              </span>
            )}
          </div>
          <p className={styles.routingReason}>{t(`plans.routing.reason.${row.reason}`)}</p>
        </div>
        <div className={styles.routingSide}>
          <span className={`${styles.routingState} ${styles['routingState_' + status]}`}>
            {statusText(row)}
          </span>
          {remainingPct != null && (
            <div className={styles.routingRemaining} title={t('plans.routing.remainingHint')}>
              <div className={styles.meterTrack}>
                <div
                  className={`${styles.meterFill} ${
                    styles['meterFill_' + getWindowMeterTier(1 - (remaining ?? 0), false)]
                  }`}
                  style={{ width: `${remainingPct}%` }}
                />
              </div>
              <span className={styles.routingRemainingText}>
                {t('plans.routing.remaining', { percent: remainingPct })}
              </span>
            </div>
          )}
        </div>
      </li>
    );
  };

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
