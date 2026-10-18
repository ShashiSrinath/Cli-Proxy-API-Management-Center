import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import type { UsageBucket, UsageSeriesPoint } from '@/types/usage';
import { formatCompactNumber } from '@/utils/format';
import { USAGE_METRICS, type UsageMetric } from '../types';
import {
  axisMax,
  axisTicks,
  formatBucketLabel,
  formatBucketTitle,
  formatCount,
  formatUsd,
  niceAxisMax,
  sampledLabelIndexes,
  seriesPeak,
  stackSegments,
  stackTotal,
  type StackKey,
} from '../utils';
import { SegmentedControl } from './SegmentedControl';
import styles from './UsageChart.module.scss';

const TICK_INTERVALS = 4;
/** Horizontal room per bucket in the SVG viewBox; the bar takes BAR_UNITS of it. */
const COLUMN_UNITS = 10;
const BAR_UNITS = 7;
const PLOT_UNITS = 100;

const LEGEND_KEYS: Record<UsageMetric, StackKey[]> = {
  tokens: ['uncached', 'cacheRead', 'cacheWrite', 'output'],
  requests: ['requests'],
  cost: ['cost'],
};

const SEGMENT_LABEL_KEYS: Record<StackKey, string> = {
  uncached: 'usageDashboard.tokens.uncached',
  cacheRead: 'usageDashboard.tokens.cacheRead',
  cacheWrite: 'usageDashboard.tokens.cacheWrite',
  output: 'usageDashboard.tokens.output',
  requests: 'usageDashboard.chart.requests',
  cost: 'usageDashboard.chart.cost',
};

/** Token colours follow the cache story: reads are the good outcome, writes the cost, output the signal. */
const SEGMENT_COLORS: Record<StackKey, string> = {
  uncached: 'var(--text-tertiary)',
  cacheRead: 'var(--viz-success)',
  cacheWrite: 'var(--amber-color)',
  output: 'var(--text-primary)',
  requests: 'var(--text-secondary)',
  cost: 'var(--text-secondary)',
};

interface UsageChartProps {
  series: UsageSeriesPoint[];
  bucket: UsageBucket;
  timeZone: string;
  locale: string;
}

/** Stacked bars per bucket, with a metric toggle and a hover tooltip. */
export function UsageChart({ series, bucket, timeZone, locale }: UsageChartProps) {
  const { t } = useTranslation();
  const [metric, setMetric] = useState<UsageMetric>('tokens');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const columns = useMemo(
    () => series.map((point) => ({ point, segments: stackSegments(point, metric) })),
    [series, metric]
  );
  const peak = useMemo(() => seriesPeak(series, metric), [series, metric]);
  const scaleMax =
    metric === 'cost' ? niceAxisMax(peak, TICK_INTERVALS) : axisMax(peak, TICK_INTERVALS);
  const ticks = useMemo(() => axisTicks(scaleMax, TICK_INTERVALS), [scaleMax]);
  const labelIndexes = useMemo(() => sampledLabelIndexes(series.length), [series.length]);

  const totals = useMemo(() => {
    const sums = new Map<StackKey, number>();
    series.forEach((point) =>
      stackSegments(point, metric).forEach((segment) =>
        sums.set(segment.key, (sums.get(segment.key) ?? 0) + segment.value)
      )
    );
    return sums;
  }, [series, metric]);

  const metricLabel = t(`usageDashboard.chart.metrics.${metric}`);
  const bucketLabel = t(`usageDashboard.chart.bucket.${bucket}`);
  const count = series.length;
  const hasUsage = peak > 0;
  const activePoint = activeIndex === null ? undefined : columns[activeIndex];

  const formatValue = (value: number): string =>
    metric === 'cost' ? formatUsd(value, locale) : formatCompactNumber(value);
  const formatExact = (key: StackKey, value: number): string =>
    key === 'cost' ? formatUsd(value, locale) : formatCount(value, locale);

  const tooltipLeft = activeIndex === null || count === 0 ? 0 : ((activeIndex + 0.5) / count) * 100;
  const tooltipAlign =
    tooltipLeft < 20
      ? 'translateX(0)'
      : tooltipLeft > 80
        ? 'translateX(-100%)'
        : 'translateX(-50%)';

  return (
    <Card
      className={styles.card}
      title={t('usageDashboard.chart.title')}
      extra={
        <SegmentedControl
          options={USAGE_METRICS.map((value) => ({
            value,
            label: t(`usageDashboard.chart.metrics.${value}`),
          }))}
          value={metric}
          onChange={setMetric}
          ariaLabel={t('usageDashboard.chart.metricLabel')}
        />
      }
    >
      <figure className={styles.chart}>
        <figcaption className={styles.legend}>
          {LEGEND_KEYS[metric].map((key) => (
            <span key={key} className={styles.legendItem}>
              <i
                className={styles.swatch}
                style={{ background: SEGMENT_COLORS[key] }}
                aria-hidden="true"
              />
              {t(SEGMENT_LABEL_KEYS[key])}
              <b className={styles.legendValue}>{formatExact(key, totals.get(key) ?? 0)}</b>
            </span>
          ))}
        </figcaption>

        <div className={styles.body}>
          <div className={styles.yAxis} aria-hidden="true">
            {ticks.map((tick, index) => (
              <span
                key={index}
                className={styles.yTick}
                style={{ top: `${(index / TICK_INTERVALS) * 100}%` }}
              >
                {formatValue(tick)}
              </span>
            ))}
          </div>

          <div className={styles.main}>
            <div className={styles.plot}>
              <div className={styles.gridlines} aria-hidden="true">
                {ticks.map((_, index) => (
                  <span
                    key={index}
                    className={styles.gridline}
                    style={{ top: `${(index / TICK_INTERVALS) * 100}%` }}
                  />
                ))}
              </div>

              <svg
                className={styles.bars}
                viewBox={`0 0 ${Math.max(1, count) * COLUMN_UNITS} ${PLOT_UNITS}`}
                preserveAspectRatio="none"
                role="img"
                aria-label={t('usageDashboard.chart.ariaLabel', {
                  metric: metricLabel,
                  bucket: bucketLabel,
                })}
              >
                {columns.map(({ segments }, index) => {
                  let offset = 0;
                  return (
                    <g key={index}>
                      {segments.map((segment) => {
                        if (!(segment.value > 0)) return null;
                        const height = (segment.value / scaleMax) * PLOT_UNITS;
                        const y = PLOT_UNITS - offset - height;
                        offset += height;
                        return (
                          <rect
                            key={segment.key}
                            x={index * COLUMN_UNITS + (COLUMN_UNITS - BAR_UNITS) / 2}
                            y={y}
                            width={BAR_UNITS}
                            height={height}
                            style={{ fill: SEGMENT_COLORS[segment.key] }}
                          />
                        );
                      })}
                    </g>
                  );
                })}
              </svg>

              <div className={styles.hits} onMouseLeave={() => setActiveIndex(null)}>
                {columns.map((_, index) => (
                  <div
                    key={index}
                    className={`${styles.hit} ${activeIndex === index ? styles.hitActive : ''}`.trim()}
                    onMouseEnter={() => setActiveIndex(index)}
                  />
                ))}
              </div>

              {!hasUsage && <p className={styles.empty}>{t('usageDashboard.chart.empty')}</p>}

              {activePoint && activeIndex !== null && (
                <div
                  className={styles.tooltip}
                  style={{ left: `${tooltipLeft}%`, transform: tooltipAlign }}
                  role="status"
                >
                  <span className={styles.tooltipTitle}>
                    {formatBucketTitle(series[activeIndex].t, bucket, timeZone, locale)}
                  </span>
                  {activePoint.segments.map((segment) => (
                    <TooltipRow
                      key={segment.key}
                      swatch={SEGMENT_COLORS[segment.key]}
                      label={t(SEGMENT_LABEL_KEYS[segment.key])}
                      value={formatExact(segment.key, segment.value)}
                    />
                  ))}
                  {metric === 'tokens' && (
                    <span className={styles.tooltipTotal}>
                      {t('usageDashboard.chart.total')}
                      <b>{formatCount(stackTotal(activePoint.segments), locale)}</b>
                    </span>
                  )}
                  {metric === 'requests' && (
                    <TooltipRow
                      label={t('usageDashboard.chart.failed')}
                      value={formatCount(activePoint.point.failed, locale)}
                    />
                  )}
                </div>
              )}
            </div>

            <div className={styles.xAxis} aria-hidden="true">
              {labelIndexes.map((index) => (
                <span
                  key={index}
                  className={styles.xTick}
                  style={{ left: `${((index + 0.5) / count) * 100}%` }}
                >
                  {formatBucketLabel(series[index].t, bucket, timeZone, locale)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </figure>
    </Card>
  );
}

function TooltipRow({ swatch, label, value }: { swatch?: string; label: string; value: string }) {
  return (
    <span className={styles.tooltipRow}>
      {swatch && <i className={styles.swatch} style={{ background: swatch }} aria-hidden="true" />}
      {label}
      <b>{value}</b>
    </span>
  );
}
