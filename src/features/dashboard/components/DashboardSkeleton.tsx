import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/Skeleton';
import styles from './DashboardSkeleton.module.scss';

const KPI_PLACEHOLDERS = [0, 1, 2, 3, 4];

/** Placeholder layout for the first load, shaped like the KPI row, chart and tables. */
export function DashboardSkeleton() {
  const { t } = useTranslation();
  return (
    <div className={styles.root}>
      <p className={styles.srOnly} role="status">
        {t('usageDashboard.states.loading')}
      </p>
      <div className={styles.kpis}>
        {KPI_PLACEHOLDERS.map((key) => (
          <Skeleton key={key} height={92} rounded={12} />
        ))}
      </div>
      <Skeleton height={280} rounded={12} />
      <Skeleton height={360} rounded={12} />
    </div>
  );
}
