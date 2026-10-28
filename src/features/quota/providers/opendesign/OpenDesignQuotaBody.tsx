import { useTranslation } from 'react-i18next';
import { useNow } from '@/hooks/useNow';
import type { OpenDesignQuotaState } from '@/types';
import { formatRelativeInstant } from '@/utils/quota';
import { QuotaMeter } from '../../components/QuotaMeter';
import type { QuotaBodyProps } from '../../types';

export function OpenDesignQuotaBody({ quota, classes }: QuotaBodyProps<OpenDesignQuotaState>) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  if (!quota.data) return null;
  const { windows, wallet } = quota.data;
  return (
    <>
      {windows.map((window, index) => {
        const remaining =
          window.limit > 0
            ? Math.max(0, Math.min(100, (window.remaining / window.limit) * 100))
            : 0;
        const reset = window.resetsAt ? Date.parse(window.resetsAt) : NaN;
        const time = Number.isFinite(reset)
          ? formatRelativeInstant(reset, now, i18n.resolvedLanguage)
          : t('opendesign_quota.unknown');
        const label =
          window.label === '5h'
            ? t('opendesign_quota.five_hour')
            : window.label === 'weekly'
              ? t('opendesign_quota.weekly')
              : window.label;
        return (
          <div className={classes.quotaRow} key={`${window.label}-${index}`}>
            <div className={classes.quotaRowHeader}>
              <span className={classes.quotaModel}>{label}</span>
              <span className={classes.quotaPercent}>
                {t('opendesign_quota.remaining', { percent: Number(remaining.toFixed(1)) })}
              </span>
            </div>
            <div
              role="meter"
              aria-label={label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={remaining}
            >
              <QuotaMeter percent={remaining} classes={classes} index={index} />
            </div>
            <div className={classes.quotaMeta}>
              {t('opendesign_quota.used', {
                used: window.used.toLocaleString(i18n.resolvedLanguage),
                limit: window.limit.toLocaleString(i18n.resolvedLanguage),
              })}{' '}
              · {t('opendesign_quota.resets', { time })}
            </div>
            {window.remaining <= 0 && wallet <= 0 && (
              <div role="status" className={classes.codexResetCreditsError}>
                {t('opendesign_quota.paused', {
                  time: Number.isFinite(reset)
                    ? new Date(reset).toLocaleString(i18n.resolvedLanguage)
                    : t('opendesign_quota.unknown'),
                })}
              </div>
            )}
          </div>
        );
      })}
      <div className={classes.quotaRow}>
        {t('opendesign_quota.wallet', { amount: `$${wallet.toFixed(2)}` })}
      </div>
    </>
  );
}
