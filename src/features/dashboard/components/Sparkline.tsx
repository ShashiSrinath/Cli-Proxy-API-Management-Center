import styles from './Sparkline.module.scss';

const VIEW_HEIGHT = 24;
const BAR_WIDTH = 0.7;

interface SparklineProps {
  /** One value per bucket, oldest first. */
  values: number[];
  ariaLabel: string;
  className?: string;
}

/**
 * Miniature bar series for one key's requests over the range. Only the shape is drawn; the
 * numbers live in the row's own cells.
 */
export function Sparkline({ values, ariaLabel, className }: SparklineProps) {
  if (values.length === 0) {
    return (
      <span className={[styles.empty, className].filter(Boolean).join(' ')} aria-hidden="true" />
    );
  }

  const peak = Math.max(0, ...values);

  return (
    <svg
      className={[styles.sparkline, className].filter(Boolean).join(' ')}
      viewBox={`0 0 ${values.length} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
    >
      {values.map((value, index) => {
        if (!(value > 0) || peak <= 0) return null;
        const height = Math.max(1, (value / peak) * VIEW_HEIGHT);
        return (
          <rect
            key={index}
            className={styles.bar}
            x={index + (1 - BAR_WIDTH) / 2}
            y={VIEW_HEIGHT - height}
            width={BAR_WIDTH}
            height={height}
          />
        );
      })}
    </svg>
  );
}
