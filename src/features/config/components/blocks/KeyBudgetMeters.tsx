import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNow } from '@/hooks/useNow';
import type { KeyBudgetWindow } from '@/types/keyBudgets';
import { parseTimestampMs } from '@/utils/timestamp';
import { formatRelativeInstant } from '@/utils/quota/relativeTime';
import styles from './KeyBudgetMeters.module.scss';

/**
 * Compact spend meters for one API key's budget windows: `$spent / $limit` plus the reset
 * countdown and a "Blocked" badge once a window is exhausted. Pure presentation: callers
 * resolve the row (the editor matches by mask, the dashboard by id).
 */
export interface KeyBudgetMetersProps {
  windows: readonly KeyBudgetWindow[];
  /** Blocked state from the payload; falls back to the per-window flags. */
  exceeded?: boolean;
  /** Omitted where the surface already labels the key (the editor's key rows). */
  label?: string;
  /** Usage tracking is off: budgets cannot be evaluated, every budgeted key is blocked. */
  disabled?: boolean;
}

const PERIOD_LABEL_KEYS: Record<KeyBudgetWindow['period'], string> = {
  day: 'keyBudgets.period.day',
  week: 'keyBudgets.period.week',
  month: 'keyBudgets.period.month',
};

/** "$12.34 / $60.00" using two decimals regardless of magnitude (limits are round numbers). */
function spendLabel(window: KeyBudgetWindow): string {
  const spent = Number.isFinite(window.spentUsd) ? window.spentUsd : 0;
  return `$${spent.toFixed(2)} / $${window.limitUsd.toFixed(2)}`;
}

function windowTitle(window: KeyBudgetWindow, periodLabel: string, resetText: string): string {
  const parts = [`${periodLabel}: ${spendLabel(window)}`];
  if (resetText) parts.push(resetText);
  return parts.join(' · ');
}

export const KeyBudgetMeters = memo(function KeyBudgetMeters({
  windows,
  exceeded = false,
  label,
  disabled = false,
}: KeyBudgetMetersProps) {
  const { t, i18n } = useTranslation();
  const now = useNow(windows.length > 0);

  // Nothing to meter. A tracking-off server still gets a badge, because a budgeted key is
  // blocked outright then (the backend fails closed with HTTP 429).
  if (windows.length === 0 && !disabled) return null;
  const blocked = disabled || exceeded || windows.some((window) => window.exceeded);

  return (
    <div className={styles.meters} role="group" aria-label={label ?? t('keyBudgets.label')}>
      {blocked && (
        <span
          className={styles.blocked}
          title={disabled && !exceeded ? t('keyBudgets.trackingDisabled') : undefined}
        >
          {t(disabled && !exceeded ? 'keyBudgets.unavailable' : 'keyBudgets.blocked')}
        </span>
      )}
      {windows.map((window) => {
        const periodLabel = t(PERIOD_LABEL_KEYS[window.period]);
        const resetsMs = parseTimestampMs(window.resetsAt);
        const resetText = Number.isFinite(resetsMs)
          ? t('keyBudgets.resetsIn', {
              time: formatRelativeInstant(resetsMs, now, i18n.language),
            })
          : '';
        const ratio =
          window.limitUsd > 0 ? Math.min(1, Math.max(0, window.spentUsd / window.limitUsd)) : 0;
        return (
          <span
            key={window.period}
            className={`${styles.meter} ${window.exceeded ? styles.meterExceeded : ''}`.trim()}
            title={windowTitle(window, periodLabel, resetText)}
          >
            <span className={styles.period}>{periodLabel}</span>
            <span className={styles.amount}>{spendLabel(window)}</span>
            <span className={styles.track} aria-hidden="true">
              <span
                className={`${styles.fill} ${window.exceeded ? styles.fillExceeded : ''}`.trim()}
                style={{ transform: `scaleX(${ratio})` }}
              />
            </span>
            {resetText && <span className={styles.reset}>{resetText}</span>}
          </span>
        );
      })}
    </div>
  );
});
