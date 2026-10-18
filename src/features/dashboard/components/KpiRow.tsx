import { useTranslation } from 'react-i18next';
import type { UsageStats } from '@/types/usage';
import { formatCompactNumber, formatPercent } from '@/utils/format';
import { cacheHitRate, failureRate, formatCount, formatUsd } from '../utils';
import styles from './KpiRow.module.scss';

interface KpiRowProps {
  totals: UsageStats;
  locale: string;
}

interface Tile {
  key: string;
  label: string;
  value: string;
  /** Exact figure for tiles whose headline is compacted. */
  title?: string;
  sub: string;
}

/** Range-wide totals. Each tile carries one line of context beneath its headline figure. */
export function KpiRow({ totals, locale }: KpiRowProps) {
  const { t } = useTranslation();
  const compact = (value: number) => formatCompactNumber(value);
  const exact = (value: number) => formatCount(value, locale);
  const hitRate = cacheHitRate(totals);

  const tiles: Tile[] = [
    {
      key: 'requests',
      label: t('usageDashboard.kpi.requests'),
      value: exact(totals.requests),
      sub: t('usageDashboard.kpi.failedSub', {
        failed: exact(totals.failed),
        percent: formatPercent(failureRate(totals)),
      }),
    },
    {
      key: 'input',
      label: t('usageDashboard.kpi.inputTokens'),
      value: compact(totals.inputTokens),
      title: exact(totals.inputTokens),
      sub: t('usageDashboard.kpi.inputSplit', {
        uncached: compact(totals.uncachedInputTokens),
        read: compact(totals.cacheReadTokens),
        write: compact(totals.cacheWriteTokens),
      }),
    },
    {
      key: 'output',
      label: t('usageDashboard.kpi.outputTokens'),
      value: compact(totals.outputTokens),
      title: exact(totals.outputTokens),
      sub: t('usageDashboard.kpi.reasoningSub', { count: compact(totals.reasoningTokens) }),
    },
    {
      key: 'cacheHit',
      label: t('usageDashboard.kpi.cacheHit'),
      value: formatPercent(hitRate),
      sub: t('usageDashboard.kpi.cacheHitSub', {
        read: compact(totals.cacheReadTokens),
        input: compact(totals.inputTokens),
      }),
    },
    {
      key: 'cost',
      label: t('usageDashboard.kpi.cost'),
      value: formatUsd(totals.costUsd, locale),
      sub: t('usageDashboard.kpi.costSub'),
    },
  ];

  return (
    <section className={styles.row} aria-label={t('usageDashboard.kpi.ariaLabel')}>
      {tiles.map((tile) => (
        <article key={tile.key} className={styles.tile}>
          <span className={styles.label}>{tile.label}</span>
          <strong className={styles.value} title={tile.title}>
            {tile.value}
          </strong>
          <span className={styles.sub}>{tile.sub}</span>
        </article>
      ))}
    </section>
  );
}
