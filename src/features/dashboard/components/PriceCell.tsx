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
    </div>
  );
}
