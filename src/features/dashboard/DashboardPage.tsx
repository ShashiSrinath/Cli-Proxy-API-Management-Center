import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { ModelTable } from './components/ModelTable';
import { DashboardSkeleton } from './components/DashboardSkeleton';
import { KeysTable } from './components/KeysTable';
import { KpiRow } from './components/KpiRow';
import { PricingPanel } from './components/PricingPanel';
import { UsageChart } from './components/UsageChart';
import { UsageHeader } from './components/UsageHeader';
import { useUsageSummary } from './hooks/useUsageSummary';
import { buildKeyTitles, hasUsage } from './utils';
import styles from './DashboardPage.module.scss';

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const { summary, range, setRange, timeZone, loading, error, connected, refresh } =
    useUsageSummary();

  useHeaderRefresh(refresh, connected);

  const keyTitles = useMemo(
    () =>
      summary ? buildKeyTitles(summary.keys, t('usageDashboard.keys.unattributed')) : new Map(),
    [summary, t]
  );

  const header = (
    <UsageHeader
      summary={summary}
      range={range}
      onRangeChange={setRange}
      timeZone={timeZone}
      loading={loading}
      connected={connected}
      onRefresh={() => void refresh()}
    />
  );

  const page = (body: ReactNode) => (
    <div className={styles.page} aria-busy={loading}>
      {header}
      {body}
    </div>
  );

  if (!summary) {
    if (error) {
      return page(
        <EmptyState
          title={t('usageDashboard.states.loadFailed')}
          description={error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void refresh()}>
              {t('usageDashboard.states.retry')}
            </Button>
          }
        />
      );
    }
    return page(<DashboardSkeleton />);
  }

  if (!summary.enabled) {
    return page(
      <EmptyState
        title={t('usageDashboard.states.disabledTitle')}
        description={t('usageDashboard.states.disabledDescription')}
      />
    );
  }

  const staleError = error ? (
    <p className={styles.staleError} role="alert">
      {t('usageDashboard.states.staleError', { message: error })}
    </p>
  ) : null;

  const pricingPanel = <PricingPanel onChanged={() => void refresh()} />;

  if (!hasUsage(summary.totals)) {
    return page(
      <>
        {staleError}
        <EmptyState
          title={t('usageDashboard.states.emptyTitle')}
          description={t('usageDashboard.states.emptyDescription')}
        />
        <KeysTable keys={summary.keys} totalCostUsd={summary.totals.costUsd} locale={locale} />
        {pricingPanel}
      </>
    );
  }

  return page(
    <>
      {staleError}
      <KpiRow totals={summary.totals} locale={locale} />
      <UsageChart
        series={summary.series}
        bucket={summary.bucket}
        timeZone={timeZone}
        locale={locale}
      />
      <KeysTable keys={summary.keys} totalCostUsd={summary.totals.costUsd} locale={locale} />
      <Card title={t('usageDashboard.models.title')}>
        <ModelTable
          rows={summary.models}
          keyTitles={keyTitles}
          emptyText={t('usageDashboard.models.empty')}
          locale={locale}
        />
      </Card>
      {pricingPanel}
    </>
  );
}
