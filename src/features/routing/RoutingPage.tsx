import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconRefreshCw } from '@/components/ui/icons';
import { DashboardSkeleton } from '@/features/dashboard/components/DashboardSkeleton';
import { browserTimeZone } from '@/features/dashboard/utils';
import { RoutingPanel } from '@/features/plans/RoutingPanel';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { apiClient } from '@/services/api/client';
import { usagePlansApi } from '@/services/api/usagePlans';
import { useAuthStore } from '@/stores';
import type { PlansResponse } from '@/types/plans';
import plansStyles from '@/features/plans/PlansPage.module.scss';
import styles from './RoutingPage.module.scss';

const RULE_KEYS = ['paused', 'override', 'weekly', 'reset', 'headroom', 'unplanned'] as const;

export function RoutingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const connected = useAuthStore((s) => s.connectionStatus === 'connected');
  const apiBase = useAuthStore((s) => s.apiBase);

  const [data, setData] = useState<PlansResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [smartPending, setSmartPending] = useState<boolean | null>(null);
  const request = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++request.current;
    const revision = apiClient.getConnectionRevision();
    setLoading(true);
    try {
      const result = await usagePlansApi.get(browserTimeZone(), 0);
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
  }, [t]);

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
      setSmartPending(null);
    };
  }, [apiBase, connected]);

  useHeaderRefresh(refresh, connected);

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

  const routing = data?.routing ?? null;
  const hasPlans = (data?.plans.length ?? 0) > 0;

  return (
    <div className={plansStyles.page} aria-busy={loading}>
      <header className={plansStyles.header}>
        <div className={plansStyles.titleBlock}>
          <h1 className={plansStyles.title}>{t('routingPage.title')}</h1>
          <p className={plansStyles.subtitle}>{t('routingPage.description')}</p>
        </div>
        <div className={plansStyles.controls}>
          <Button
            variant="secondary"
            onClick={() => void refresh()}
            loading={loading}
            disabled={!connected}
            title={t('plans.refresh')}
            aria-label={t('plans.refresh')}
          >
            <IconRefreshCw size={14} className={loading ? plansStyles.spin : undefined} />
          </Button>
          <Button variant="secondary" onClick={() => navigate('/plans')}>
            {t('routingPage.managePlans')}
          </Button>
        </div>
      </header>

      {error && (
        <p className={plansStyles.warning} role="alert">
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

      {data?.enabled && !hasPlans && (
        <EmptyState
          title={t('routingPage.emptyTitle')}
          description={t('routingPage.emptyDescription')}
          action={
            <Button onClick={() => navigate('/plans')}>{t('routingPage.managePlans')}</Button>
          }
        />
      )}

      {data?.enabled && hasPlans && !routing && (
        <EmptyState
          title={t('routingPage.unsupportedTitle')}
          description={t('routingPage.unsupportedDescription')}
        />
      )}

      {data?.enabled && hasPlans && routing && (
        <>
          <RoutingPanel
            routing={routing}
            pendingEnabled={smartPending}
            busy={smartPending !== null}
            disabled={!connected}
            onToggle={(enabled) => void toggleSmartRouting(enabled)}
          />
          <section className={styles.rules} aria-labelledby="routing-rules-title">
            <h2 id="routing-rules-title" className={styles.rulesTitle}>
              {t('routingPage.rulesTitle')}
            </h2>
            <ol className={styles.rulesList}>
              {RULE_KEYS.map((key) => (
                <li key={key} className={styles.rule}>
                  <strong className={styles.ruleName}>{t(`routingPage.rules.${key}.title`)}</strong>
                  <span className={styles.ruleText}>{t(`routingPage.rules.${key}.text`)}</span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
