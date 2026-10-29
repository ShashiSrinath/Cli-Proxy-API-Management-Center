import { useCallback, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { dateLabel, estimate, formatUsd } from './utils';
import styles from './PlansPage.module.scss';

interface ChartPoint {
  t: string;
  value_usd: number;
  cumulative_usd: number;
}

interface CumulativeChartProps {
  series: ChartPoint[];
  priceUsd: number;
  breakEvenAt?: string | null;
}

export function CumulativeChart({ series, priceUsd, breakEvenAt }: CumulativeChartProps) {
  const { t } = useTranslation();
  const gradientId = useId();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const points = useMemo(() => series || [], [series]);

  const maxVal = useMemo(() => {
    const highestCumulative = points.reduce(
      (max, p) => Math.max(max, p.cumulative_usd || 0),
      0
    );
    const raw = Math.max(priceUsd || 0, highestCumulative, 1);
    // Add 15% headroom for clean breathing room
    return Math.ceil(raw * 1.15);
  }, [points, priceUsd]);

  const width = 600;
  const height = 180;
  const padLeft = 55;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 32;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const getY = useCallback(
    (val: number) => padTop + plotH - (Math.max(0, val) / maxVal) * plotH,
    [maxVal, padTop, plotH]
  );

  const getX = useCallback(
    (idx: number) =>
      points.length <= 1 ? padLeft + plotW / 2 : padLeft + (idx / (points.length - 1)) * plotW,
    [padLeft, plotW, points.length]
  );

  const priceY = getY(priceUsd);

  const pathD = useMemo(() => {
    if (points.length === 0) return '';
    const coords = points.map(
      (p, i) => `${getX(i).toFixed(1)},${getY(p.cumulative_usd || 0).toFixed(1)}`
    );
    return `M ${coords.join(' L ')}`;
  }, [points, getX, getY]);

  const areaD = useMemo(() => {
    if (points.length === 0) return '';
    const firstX = getX(0).toFixed(1);
    const lastX = getX(points.length - 1).toFixed(1);
    const baseLine = (padTop + plotH).toFixed(1);
    return `${pathD} L ${lastX},${baseLine} L ${firstX},${baseLine} Z`;
  }, [pathD, points.length, getX, padTop, plotH]);

  const breakEvenIdx = useMemo(() => {
    if (!breakEvenAt || priceUsd <= 0) return -1;
    return points.findIndex((p) => (p.cumulative_usd || 0) >= priceUsd);
  }, [breakEvenAt, points, priceUsd]);

  const latestVal = points.length > 0 ? points[points.length - 1].cumulative_usd : 0;

  // Grid tick levels
  const yTicks = [0, maxVal / 2, maxVal];

  const hoveredPoint = hoveredIdx != null && points[hoveredIdx] ? points[hoveredIdx] : null;

  return (
    <div className={styles.chartContainer}>
      <div className={styles.chartHeader}>
        <div className={styles.chartTitle}>
          <span>{t('plans.cumulativeChartTitle')}</span>
        </div>
        <div className={styles.chartLegend}>
          <div className={styles.legendItem}>
            <span className={styles.legendDashedLine} />
            <span>
              {t('plans.planPrice')}: <strong>{formatUsd(priceUsd)}</strong>
            </span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendSolidLine} />
            <span>
              {t('plans.cumulativeValue')}: <strong>{estimate(latestVal)}</strong>
            </span>
          </div>
          {breakEvenAt && (
            <div className={styles.breakEvenPill}>
              {t('plans.breakEven')}: {dateLabel(breakEvenAt)}
            </div>
          )}
        </div>
      </div>

      <div className={styles.chartSvgWrap}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className={styles.chartSvg}
          role="img"
          aria-label={t('plans.chartLabel')}
          onMouseLeave={() => setHoveredIdx(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--viz-success, #10b981)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--viz-success, #10b981)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Y-axis gridlines and labels */}
          {yTicks.map((tick, i) => {
            const y = getY(tick);
            return (
              <g key={i} className={styles.chartGridGroup}>
                <line
                  x1={padLeft}
                  x2={padLeft + plotW}
                  y1={y}
                  y2={y}
                  className={styles.chartGridLine}
                />
                <text x={padLeft - 8} y={y + 4} textAnchor="end" className={styles.chartAxisText}>
                  {formatUsd(tick)}
                </text>
              </g>
            );
          })}

          {/* Plan price reference line */}
          {priceUsd > 0 && (
            <g className={styles.chartPriceGroup}>
              <line
                x1={padLeft}
                x2={padLeft + plotW}
                y1={priceY}
                y2={priceY}
                className={styles.chartPriceLine}
              />
              <text
                x={padLeft + plotW}
                y={priceY - 6}
                textAnchor="end"
                className={styles.chartPriceTag}
              >
                {t('plans.planPrice')}: {formatUsd(priceUsd)}
              </text>
            </g>
          )}

          {/* Cumulative area fill */}
          {areaD && <path d={areaD} fill={`url(#${gradientId})`} />}

          {/* Cumulative line stroke */}
          {pathD && <path d={pathD} className={styles.chartPathLine} />}

          {/* Break-even point highlight */}
          {breakEvenIdx >= 0 && (
            <g className={styles.chartBreakPoint}>
              <circle
                cx={getX(breakEvenIdx)}
                cy={getY(points[breakEvenIdx].cumulative_usd || 0)}
                r="5"
                className={styles.chartBreakCircle}
              />
              <circle
                cx={getX(breakEvenIdx)}
                cy={getY(points[breakEvenIdx].cumulative_usd || 0)}
                r="9"
                className={styles.chartBreakRing}
              />
            </g>
          )}

          {/* Hover guideline and dot */}
          {hoveredIdx != null && hoveredPoint && (
            <g className={styles.chartHoverGroup}>
              <line
                x1={getX(hoveredIdx)}
                x2={getX(hoveredIdx)}
                y1={padTop}
                y2={padTop + plotH}
                className={styles.chartHoverLine}
              />
              <circle
                cx={getX(hoveredIdx)}
                cy={getY(hoveredPoint.cumulative_usd || 0)}
                r="4.5"
                className={styles.chartHoverDot}
              />
            </g>
          )}

          {/* X-axis date labels */}
          {points.length > 0 && (
            <g className={styles.chartXLabels}>
              <text x={padLeft} y={height - 10} textAnchor="start" className={styles.chartAxisText}>
                {dateLabel(points[0].t)}
              </text>
              {points.length > 2 && (
                <text
                  x={padLeft + plotW / 2}
                  y={height - 10}
                  textAnchor="middle"
                  className={styles.chartAxisText}
                >
                  {dateLabel(points[Math.floor(points.length / 2)].t)}
                </text>
              )}
              {points.length > 1 && (
                <text
                  x={padLeft + plotW}
                  y={height - 10}
                  textAnchor="end"
                  className={styles.chartAxisText}
                >
                  {dateLabel(points[points.length - 1].t)}
                </text>
              )}
            </g>
          )}

          {/* Transparent hit target rects for smooth hovering */}
          {points.map((_, i) => {
            const x = getX(i);
            const w = plotW / Math.max(1, points.length);
            return (
              <rect
                key={i}
                x={x - w / 2}
                y={padTop}
                width={w}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHoveredIdx(i)}
                style={{ cursor: 'pointer' }}
              />
            );
          })}
        </svg>

        {hoveredPoint && (
          <div
            className={styles.chartTooltip}
            style={{
              left: `${(getX(hoveredIdx!) / width) * 100}%`,
              top: `${(getY(hoveredPoint.cumulative_usd || 0) / height) * 100}%`,
            }}
          >
            <div className={styles.tooltipDate}>{dateLabel(hoveredPoint.t)}</div>
            <div className={styles.tooltipRow}>
              <span>{t('plans.cumulativeValue')}:</span>
              <strong>{estimate(hoveredPoint.cumulative_usd)}</strong>
            </div>
            <div className={styles.tooltipRow}>
              <span>{t('plans.cost')}:</span>
              <span>{estimate(hoveredPoint.value_usd)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
