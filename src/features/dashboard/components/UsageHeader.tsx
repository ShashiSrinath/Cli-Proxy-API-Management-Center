import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { IconRefreshCw } from '@/components/ui/icons';
import { useNow } from '@/hooks/useNow';
import type { UsageSummary, UsageRange } from '@/types/usage';
import { formatRelativeInstant } from '@/utils/quota/relativeTime';
import { resolveTimeZoneLabel } from '@/utils/time/timezone';
import { USAGE_RANGES } from '../types';
import { toInstantMs, unpricedModelCount } from '../utils';
import { SegmentedControl } from './SegmentedControl';
import styles from './UsageHeader.module.scss';

const KNOWN_SOURCES = ['openrouter', 'override', 'none'] as const;

interface UsageHeaderProps {
  summary: UsageSummary | null;
  range: UsageRange;
  onRangeChange: (range: UsageRange) => void;
  timeZone: string;
  loading: boolean;
  connected: boolean;
  onRefresh: () => void;
}

/** Title, range and refresh controls, and the pricing and timezone context for the figures below. */
export function UsageHeader({
  summary,
  range,
  onRangeChange,
  timeZone,
  loading,
  connected,
  onRefresh,
}: UsageHeaderProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const now = useNow();

  const generatedMs = summary ? toInstantMs(summary.generatedAt) : null;
  const rangeOptions = USAGE_RANGES.map((value) => ({
    value,
    label: t(`usageDashboard.range.${value}`),
  }));

  const pricing = summary?.pricing ?? null;
  const fetchedMs = pricing ? toInstantMs(pricing.fetchedAt) : null;
  const sourceText = (() => {
    const source = pricing?.source ?? '';
    if (KNOWN_SOURCES.some((known) => known === source)) {
      return t(`usageDashboard.pricing.sources.${source}`);
    }
    return source || t('usageDashboard.pricing.sources.none');
  })();
  const unpriced = summary ? unpricedModelCount(summary.models) : 0;

  return (
    <header className={styles.header}>
      <div className={styles.titleBlock}>
        <h1 className={styles.title}>{t('usageDashboard.title')}</h1>
        <p className={styles.description}>{t('usageDashboard.description')}</p>
        <p className={styles.meta}>
          {t('usageDashboard.timezone', { zone: timeZone, offset: resolveTimeZoneLabel() })}
          {generatedMs !== null && (
            <>
              {' · '}
              {t('usageDashboard.updated', {
                time: formatRelativeInstant(generatedMs, now, locale),
              })}
            </>
          )}
        </p>
      </div>

      <div className={styles.controls}>
        <div className={styles.chips}>
          {pricing && pricing.error && (
            <span className={`${styles.chip} ${styles.chipWarning}`} title={pricing.error}>
              {t('usageDashboard.pricing.chipError')}
            </span>
          )}
          {pricing && !pricing.error && fetchedMs === null && (
            <span className={styles.chip}>
              {t('usageDashboard.pricing.chipNotFetched', { source: sourceText })}
            </span>
          )}
          {pricing && !pricing.error && fetchedMs !== null && (
            <span className={styles.chip}>
              {t('usageDashboard.pricing.chipUpdated', {
                source: sourceText,
                time: formatRelativeInstant(fetchedMs, now, locale),
              })}
            </span>
          )}
          {unpriced > 0 && (
            <span className={`${styles.chip} ${styles.chipWarning}`}>
              {t('usageDashboard.pricing.chipUnpriced', { count: unpriced })}
            </span>
          )}
        </div>

        <SegmentedControl
          options={rangeOptions}
          value={range}
          onChange={onRangeChange}
          ariaLabel={t('usageDashboard.range.label')}
        />

        <Button
          variant="secondary"
          size="sm"
          onClick={onRefresh}
          disabled={!connected}
          title={t('usageDashboard.refresh')}
        >
          <IconRefreshCw size={14} className={loading ? styles.spin : undefined} />
          {t('usageDashboard.refresh')}
        </Button>
      </div>
    </header>
  );
}
