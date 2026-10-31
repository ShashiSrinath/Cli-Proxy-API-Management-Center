import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Collapsible } from '@/components/ui/Collapsible';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  IconAlertTriangle,
  IconPlus,
  IconRefreshCw,
} from '@/components/ui/icons';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { DashboardSkeleton } from '@/features/dashboard/components/DashboardSkeleton';
import { browserTimeZone } from '@/features/dashboard/utils';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { apiClient } from '@/services/api/client';
import { usagePlansApi } from '@/services/api/usagePlans';
import { useAuthStore, useThemeStore } from '@/stores';
import type { PlansResponse, SubscriptionPlan } from '@/types/plans';
import { BrandLogo } from './BrandLogo';
import { PlanCard } from './PlanCard';
import { PlanEditor } from './PlanEditor';
import { routingByAuthId } from './routing';
import { RoutingPanel } from './RoutingPanel';
import {
  estimate,
  formatUsd,
  getMultiplierTier,
  getProviderFamily,
  groupPlansByFamily,
  relativeTime,
} from './utils';
import styles from './PlansPage.module.scss';

export function PlansPage() {
  const { t } = useTranslation();
  const connected = useAuthStore((s) => s.connectionStatus === 'connected');
  const apiBase = useAuthStore((s) => s.apiBase);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const isDark = resolvedTheme === 'dark';

  const [offset, setOffset] = useState('0');
  const [data, setData] = useState<PlansResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<Partial<SubscriptionPlan> | null>(null);
  const [smartPending, setSmartPending] = useState<boolean | null>(null);

  const request = useRef(0);
  const unassignedRef = useRef<HTMLElement>(null);

  const refresh = useCallback(async () => {
    const id = ++request.current;
    const revision = apiClient.getConnectionRevision();
    setLoading(true);
    try {
      const result = await usagePlansApi.get(browserTimeZone(), Number(offset));
      if (id === request.current && revision === apiClient.getConnectionRevision()) {
        setData(result);
        setError('');
      }
    } catch (e) {
      if (id === request.current && revision === apiClient.getConnectionRevision()) {
        setError(e instanceof Error ? e.message : t('plans.loadFailed'));
      }
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [offset, t]);

  useEffect(() => {
    const requests = request;
    if (connected) void refresh();
    return () => {
      requests.current++;
    };
  }, [connected, apiBase, refresh]);

  useEffect(() => {
    return () => {
      setData(null);
      setEditor(null);
      setSmartPending(null);
    };
  }, [apiBase, connected]);

  useHeaderRefresh(refresh, connected);

  const edit = async (id: string) => {
    try {
      const revision = apiClient.getConnectionRevision();
      const config = await usagePlansApi.config();
      if (revision !== apiClient.getConnectionRevision()) return;
      const plan = config.find((p) => p.id === id);
      if (plan) setEditor(plan);
      else setError(t('plans.missingPlan'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('plans.loadFailed'));
    }
  };

  const toggleSmartRouting = async (enabled: boolean) => {
    const revision = apiClient.getConnectionRevision();
    setSmartPending(enabled);
    try {
      await usagePlansApi.setSmartRouting(enabled);
      if (revision !== apiClient.getConnectionRevision()) return;
      await refresh();
    } catch (e) {
      if (revision !== apiClient.getConnectionRevision()) return;
      setError(e instanceof Error ? e.message : t('plans.routing.toggleFailed'));
    } finally {
      if (revision === apiClient.getConnectionRevision()) setSmartPending(null);
    }
  };

  const routing = data?.routing;
  const routingIndex = useMemo(() => routingByAuthId(routing), [routing]);

  // Grouped plans
  const plans = data?.plans;
  const planGroups = useMemo(() => {
    if (!plans) return [];
    return groupPlansByFamily(plans);
  }, [plans]);

  // Overall KPI metrics
  const returnTier = useMemo(() => {
    if (!data) return 'neutral';
    return getMultiplierTier(
      data.totals.multiplier,
      (data.totals.value_usd > 0) || (data.plans ?? []).some((p) => (p.totals?.requests ?? 0) > 0),
      data.totals.price_usd
    );
  }, [data]);

  const returnCaptionKey = useMemo(() => {
    switch (returnTier) {
      case 'green':
        return 'plans.kpi.tierGreat';
      case 'amber':
        return 'plans.kpi.tierPayingOff';
      case 'red':
        return 'plans.kpi.tierCheaper';
      case 'neutral':
      default:
        return 'plans.kpi.tierNoUsage';
    }
  }, [returnTier]);

  const projectedMultiplier = useMemo(() => {
    if (!data || data.totals.price_usd <= 0) return '';
    return `≈${(data.totals.projected_value_usd / data.totals.price_usd).toFixed(1)}×`;
  }, [data]);

  return (
    <div className={styles.page} aria-busy={loading}>
      {/* 1. Header toolbar */}
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{t('plans.title')}</h1>
          <p className={styles.subtitle}>{t('plans.description')}</p>
        </div>

        <div className={styles.controls}>
          <div className={styles.cycleSelector}>
            <select
              className={styles.cycleSelect}
              value={offset}
              onChange={(e) => setOffset(e.target.value)}
              aria-label={t('plans.cycle')}
            >
              {Array.from({ length: 13 }, (_, i) => (
                <option key={i} value={String(-i)}>
                  {i === 0
                    ? t('plans.current')
                    : i === 1
                      ? t('plans.previous')
                      : t('plans.cyclesAgo', { count: i })}
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="secondary"
            onClick={() => void refresh()}
            loading={loading}
            disabled={!connected}
            title={t('plans.refresh')}
            aria-label={t('plans.refresh')}
          >
            <IconRefreshCw size={14} className={loading ? styles.spin : undefined} />
          </Button>

          <Button onClick={() => setEditor({})}>
            <IconPlus size={15} />
            {t('plans.addPlan')}
          </Button>
        </div>
      </header>

      {error && (
        <p className={styles.warning} role="alert">
          {error}
        </p>
      )}

      {!data &&
        (error ? (
          <EmptyState
            title={t('plans.loadFailed')}
            description={error}
            action={<Button onClick={() => void refresh()}>{t('plans.refresh')}</Button>}
          />
        ) : (
          <DashboardSkeleton />
        ))}

      {data && !data.enabled && (
        <EmptyState
          title={t('usageDashboard.states.disabledTitle')}
          description={t('usageDashboard.states.disabledDescription')}
        />
      )}

      {data?.enabled && (
        <>
          {/* 2. Summary KPI row of 4 tiles */}
          <section className={styles.kpiRow} aria-label={t('plans.title')}>
            <article className={styles.kpiTile}>
              <span className={styles.kpiLabel}>{t('plans.kpi.cost')}</span>
              <strong className={styles.kpiValue}>
                {formatUsd(data.totals.price_usd)}
              </strong>
              <span className={styles.kpiSub}>
                {t('plans.kpi.costSub', { count: data.plans.length })}
              </span>
            </article>

            <article className={styles.kpiTile}>
              <span className={styles.kpiLabel}>{t('plans.kpi.value')}</span>
              <strong className={styles.kpiValue}>
                {estimate(data.totals.value_usd)}
              </strong>
              <span className={styles.kpiSub}>{t('plans.kpi.valueSub')}</span>
            </article>

            <article className={styles.kpiTile}>
              <span className={styles.kpiLabel}>{t('plans.kpi.return')}</span>
              <strong className={`${styles.kpiValue} ${styles['kpiReturn_' + returnTier]}`}>
                {data.totals.multiplier == null ? '—' : `${data.totals.multiplier.toFixed(1)}×`}
              </strong>
              <span className={styles.kpiSub}>{t(returnCaptionKey)}</span>
            </article>

            <article className={styles.kpiTile}>
              <span className={styles.kpiLabel}>{t('plans.kpi.projected')}</span>
              <strong className={styles.kpiValue}>
                {estimate(data.totals.projected_value_usd)}
              </strong>
              <span className={styles.kpiSub}>
                {projectedMultiplier ? `${projectedMultiplier} ${t('plans.kpi.projectedReturn')}` : '—'}
              </span>
            </article>
          </section>

          {/* Smart routing order */}
          {data.routing && (
            <RoutingPanel
              routing={data.routing}
              pendingEnabled={smartPending}
              busy={smartPending !== null}
              disabled={!connected}
              onToggle={(enabled) => void toggleSmartRouting(enabled)}
            />
          )}

          {/* Warning callout for unassigned usage */}
          {(data.totals.unassigned_value_usd ?? 0) > 0 && (
            <div className={styles.unassignedCallout} role="alert">
              <div className={styles.calloutLeft}>
                <IconAlertTriangle size={18} className={styles.calloutIcon} />
                <span>
                  {t('plans.unassignedWarning', {
                    value: estimate(data.totals.unassigned_value_usd),
                  })}
                </span>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => unassignedRef.current?.scrollIntoView({ behavior: 'smooth' })}
              >
                {t('plans.reviewUnassigned')}
              </Button>
            </div>
          )}

          {/* 3 & 4. Groups by provider family and plan row-cards */}
          {data.plans.length === 0 ? (
            <EmptyState
              title={t('plans.emptyTitle')}
              description={t('plans.emptyDescription')}
              action={<Button onClick={() => setEditor({})}>{t('plans.addFirst')}</Button>}
            />
          ) : (
            planGroups.map((group) => {
              const groupTier = getMultiplierTier(
                group.totals.multiplier,
                group.totals.value_usd > 0,
                group.totals.price_usd
              );
              return (
                <section key={group.family.id} className={styles.groupSection}>
                  <div className={styles.groupHeader}>
                    <div className={styles.groupHeadLeft}>
                      <BrandLogo brandKey={group.family.brandKey} size={22} />
                      <h2 className={styles.groupTitle}>{group.family.name}</h2>
                      <span className={styles.groupCountBadge}>
                        {t('plans.planCount', { count: group.plans.length })}
                      </span>
                    </div>

                    <div className={styles.groupSubtotal}>
                      <span className={styles.groupSubtotalItem}>
                        {formatUsd(group.totals.price_usd)} / {t('plans.cycle')}
                      </span>
                      <span className={styles.subtotalDot}>·</span>
                      <span className={styles.groupSubtotalItem}>
                        {estimate(group.totals.value_usd)} {t('plans.value')}
                      </span>
                      <span className={styles.subtotalDot}>·</span>
                      <span
                        className={`${styles.groupMultiplier} ${styles['tierText_' + groupTier]}`}
                      >
                        {group.totals.multiplier == null
                          ? '—'
                          : `${group.totals.multiplier.toFixed(1)}×`}
                      </span>
                    </div>
                  </div>

                  <div className={styles.plansList}>
                    {group.plans.map((p) => (
                      <PlanCard
                        key={p.id}
                        plan={p}
                        onEdit={() => void edit(p.id)}
                        isDark={isDark}
                        routing={routingIndex}
                      />
                    ))}
                  </div>
                </section>
              );
            })
          )}

          {/* 6. Unassigned section */}
          <section ref={unassignedRef} className={styles.unassignedSection}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>{t('plans.unassigned')}</h2>
                <p className={styles.sectionSubtitle}>{t('plans.unassignedDescription')}</p>
              </div>
            </div>

            {data.unassigned.length === 0 ? (
              <div className={styles.emptyUnassigned}>
                <p>{t('plans.noneUnassigned')}</p>
              </div>
            ) : (
              <Table className={styles.unassignedTable}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('plans.provider')}</TableHead>
                    <TableHead>{t('plans.account')}</TableHead>
                    <TableHead alignRight>{t('plans.value')}</TableHead>
                    <TableHead alignRight>{t('plans.requests')}</TableHead>
                    <TableHead alignRight>{t('plans.action')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.unassigned.map((u) => {
                    const family = getProviderFamily(u.provider);
                    return (
                      <TableRow key={`${u.provider}:${u.auth_id}`}>
                        <TableCell>
                          <div className={styles.unassignedProviderCell}>
                            <BrandLogo brandKey={family.brandKey} size={18} />
                            <span>{family.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className={styles.unassignedAccountCell}>
                            <strong>{u.label || u.auth_id}</strong>
                          </div>
                        </TableCell>
                        <TableCell alignRight>
                          <strong className={styles.unassignedValueText}>
                            {estimate(u.value_usd)}
                          </strong>
                        </TableCell>
                        <TableCell alignRight>{u.requests.toLocaleString()}</TableCell>
                        <TableCell alignRight>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              setEditor({
                                name: u.label || family.name,
                                provider: u.provider,
                                credentials: u.auth_id ? [u.auth_id] : [],
                              })
                            }
                          >
                            <IconPlus size={14} />
                            {t('plans.createPlan')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </section>

          {/* 7. Collapsible accuracy notes footer */}
          <footer className={styles.footer}>
            <Collapsible
              label={t('plans.accuracyTitle')}
              hint={t('plans.accuracyHint')}
            >
              <div className={styles.accuracyDetails}>
                <p className={styles.accuracyText}>{t('plans.accuracy')}</p>
                <div className={styles.pricingMetaGrid}>
                  <div className={styles.pricingMetaItem}>
                    <span className={styles.pricingMetaLabel}>{t('plans.pricingSource')}:</span>
                    <strong>{data.pricing.source || '—'}</strong>
                  </div>
                  {data.pricing.catalog_size > 0 && (
                    <div className={styles.pricingMetaItem}>
                      <span className={styles.pricingMetaLabel}>{t('plans.catalogSize')}:</span>
                      <strong>
                        {data.pricing.catalog_size.toLocaleString()} {t('plans.models')}
                      </strong>
                    </div>
                  )}
                  {data.pricing.fetched_at && (
                    <div className={styles.pricingMetaItem}>
                      <span className={styles.pricingMetaLabel}>{t('plans.fetchedAt')}:</span>
                      <strong>{relativeTime(data.pricing.fetched_at)}</strong>
                    </div>
                  )}
                  {data.pricing.error && (
                    <div className={styles.pricingError}>
                      <IconAlertTriangle size={14} />
                      <span>{data.pricing.error}</span>
                    </div>
                  )}
                </div>
              </div>
            </Collapsible>
          </footer>
        </>
      )}

      {editor && data && (
        <PlanEditor
          initial={editor}
          providers={data.providers}
          credentials={data.available_credentials}
          close={() => setEditor(null)}
          saved={() => {
            setEditor(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
