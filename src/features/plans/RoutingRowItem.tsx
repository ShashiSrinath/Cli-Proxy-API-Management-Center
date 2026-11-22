import { useTranslation } from 'react-i18next';
import { useNow } from '@/hooks/useNow';
import { BrandLogo } from './BrandLogo';
import { countdown, windowLabelKey, type RoutingRow } from './routing';
import { getProviderFamily, getWindowMeterTier } from './utils';
import styles from './PlansPage.module.scss';

interface RoutingRowItemProps {
  row: RoutingRow;
  /** Show the effective scheduler priority chip. */
  advanced?: boolean;
}

/** One credential line in a routing order list. */
export function RoutingRowItem({ row, advanced = false }: RoutingRowItemProps) {
  const { t } = useTranslation();
  const now = useNow();
  const { entry, status } = row;

  const windowName = (label: string) => {
    const key = windowLabelKey(label);
    return key ? t(`plans.routing.window.${key}`) : label;
  };

  const statusText = (): string => {
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

  const resetText = (): string => {
    const { reset } = row;
    if (reset.kind === 'unknown') return t('plans.routing.reset.unknown');
    if (reset.kind === 'due') return t('plans.routing.reset.due');
    return reset.estimated
      ? t('plans.routing.reset.estimated', { time: reset.duration })
      : t('plans.routing.reset.in', { time: reset.duration });
  };

  const family = getProviderFamily(entry.provider);
  const label = entry.label || entry.auth_id;
  const remaining = entry.remaining_fraction;
  const remainingPct = remaining == null ? null : Math.round(remaining * 100);

  return (
    <li
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
            {resetText()}
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
          {statusText()}
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
}
