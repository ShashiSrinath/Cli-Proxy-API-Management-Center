import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { CommandCodeQuotaState } from '@/types';
import { useNow } from '@/hooks/useNow';
import { buildResetDisplay } from '@/utils/quota';
import { QuotaMeter } from '../../components/QuotaMeter';
import { QuotaResetLabel } from '../../components/QuotaResetLabel';
import { collectQuotaRowInstants, pickUrgentRowId } from '../../resetSchedule';
import type { QuotaBodyProps } from '../../types';

export function CommandCodeQuotaBody({ quota, classes }: QuotaBodyProps<CommandCodeQuotaState>) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const soonestRowId = useMemo(
    () => pickUrgentRowId(collectQuotaRowInstants('commandcode', quota), now),
    [quota, now]
  );
  const data = quota.data;
  if (!data || data.windows.every((window) => window.usedPercent === null)) {
    return <div className={classes.quotaMessage}>{t('commandcode_quota.empty_data')}</div>;
  }

  const creditsRemaining = data.creditsRemaining;

  return (
    <>
      {data.windows.map((window, index) => {
        const remaining = window.usedPercent === null ? null : 100 - window.usedPercent;
        const resetDisplay = buildResetDisplay(
          null,
          window.resetAt === undefined ? null : window.resetAt * 1000,
          now,
          i18n.resolvedLanguage
        );
        const label = t(`commandcode_quota.${window.id}`);
        return (
          <div key={window.id} className={classes.quotaRow}>
            <div className={classes.quotaRowHeader}>
              <span className={classes.quotaModel}>{label}</span>
              <div className={classes.quotaMeta}>
                <span className={classes.quotaPercent}>
                  {remaining === null
                    ? t('commandcode_quota.unknown')
                    : t('commandcode_quota.remaining', { percent: Number(remaining.toFixed(1)) })}
                </span>
                {resetDisplay && (
                  <QuotaResetLabel
                    display={resetDisplay}
                    classes={classes}
                    soon={window.id === soonestRowId}
                  />
                )}
              </div>
            </div>
            <div
              role={remaining === null ? undefined : 'meter'}
              aria-label={remaining === null ? undefined : label}
              aria-valuemin={remaining === null ? undefined : 0}
              aria-valuemax={remaining === null ? undefined : 100}
              aria-valuenow={remaining ?? undefined}
            >
              <QuotaMeter percent={remaining} classes={classes} index={index} />
            </div>
          </div>
        );
      })}
      {typeof creditsRemaining === 'number' && Number.isFinite(creditsRemaining) && (
        <div className={classes.quotaRow}>
          <div className={classes.quotaRowHeader}>
            <span className={classes.quotaModel}>{t('commandcode_quota.credits')}</span>
            <div className={classes.quotaMeta}>
              <span className={classes.quotaAmount}>
                {t('commandcode_quota.credits_remaining', {
                  amount: `$${creditsRemaining.toFixed(2)}`,
                })}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
