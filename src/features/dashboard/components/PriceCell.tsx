import { useTranslation } from 'react-i18next';
import type { UsageModelRow } from '@/types/usage';
import { formatPrice } from '../utils';
import styles from './PriceCell.module.scss';

interface PriceCellProps {
  model: UsageModelRow;
}

/**
 * Price used for a model: where it came from, and the USD-per-million rates applied to each
 * token kind (in, out, cache read, cache write). The matched catalog id is in the tooltip.
 */
export function PriceCell({ model }: PriceCellProps) {
  const { t } = useTranslation();
  const { price, priced } = model;
  const source = price.source;
  const matched = price.matchedId
    ? t('usageDashboard.price.matched', { id: price.matchedId })
    : t('usageDashboard.price.unmatched');

  return (
    <div className={styles.cell} title={matched}>
      <span className={`${styles.source} ${styles[source]}`}>
        {t(`usageDashboard.pricing.sources.${source}`)}
      </span>
      {priced ? (
        <span className={styles.numbers} title={t('usageDashboard.price.splitTitle')}>
          {[price.input, price.output, price.cacheRead, price.cacheWrite]
            .map((value) => formatPrice(value))
            .join(' · ')}
        </span>
      ) : (
        <span className={styles.unpriced}>{t('usageDashboard.price.unpriced')}</span>
      )}
      {price.conditional?.map((rate, index) => {
        const time = (value: number) =>
          `${String(Math.floor(value / 100)).padStart(2, '0')}:${String(value % 100).padStart(2, '0')}`;
        const labels = [
          rate.utcDays.map((day) => t(`usageDashboard.price.days.${day}`)).join(', '),
          rate.utcStart !== undefined && rate.utcEnd !== undefined
            ? `${time(rate.utcStart)}–${time(rate.utcEnd)} UTC`
            : '',
          rate.minPromptTokens
            ? t('usageDashboard.price.minPrompt', { count: rate.minPromptTokens.toLocaleString() })
            : '',
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <span
            className={styles.numbers}
            key={`${labels}-${index}`}
            title={t('usageDashboard.price.splitTitle')}
          >
            {labels}:{' '}
            {[rate.input, rate.output, rate.cacheRead, rate.cacheWrite]
              .map(formatPrice)
              .join(' · ')}
          </span>
        );
      })}
    </div>
  );
}
