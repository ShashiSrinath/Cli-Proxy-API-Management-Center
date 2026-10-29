import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { DashboardSkeleton } from '@/features/dashboard/components/DashboardSkeleton';
import { SegmentedControl } from '@/features/dashboard/components/SegmentedControl';
import { browserTimeZone } from '@/features/dashboard/utils';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { apiClient } from '@/services/api/client';
import { usagePlansApi } from '@/services/api/usagePlans';
import { useAuthStore } from '@/stores';
import type { PlanValue, PlansResponse, SubscriptionPlan } from '@/types/plans';
import { PlanEditor } from './PlanEditor';
import { dateLabel, estimate, formatUsd, relativeTime } from './utils';
import styles from './PlansPage.module.scss';

function PlanCard({ plan, edit }: { plan: PlanValue; edit: () => void }) {
  const { t } = useTranslation();
  const multiplier = plan.multiplier;
  const scale = Math.max(1, multiplier ?? 0);
  const progress =
    plan.length_days > 0
      ? Math.min(100, Math.max(0, (plan.elapsed_days / plan.length_days) * 100))
      : 0;
  const color =
    multiplier == null
      ? styles.grey
      : multiplier < 1
        ? styles.red
        : multiplier < 3
          ? styles.amber
          : styles.green;
  const points = plan.series ?? [];
  const max = Math.max(plan.price_usd || 0, ...points.map((p) => p.cumulative_usd || 0), 1);
  const coords = points
    .map(
      (p, i) =>
        `${points.length === 1 ? 0 : (i / (points.length - 1)) * 100},${100 - ((p.cumulative_usd || 0) / max) * 90}`
    )
    .join(' ');
  const breakIndex = plan.break_even_at
    ? points.findIndex((p) => p.cumulative_usd >= plan.price_usd)
    : -1;
  return (
    <Card
      title={
        <>
          {plan.name} <span className={styles.badge}>{plan.provider}</span>
        </>
      }
      extra={
        <Button size="sm" variant="ghost" onClick={edit}>
          {t('plans.edit')}
        </Button>
      }
    >
      <div className={styles.planBody}>
        <div className={styles.row}>
          <span>
            {formatUsd(plan.price_usd)}/{t(`plans.${plan.cycle || 'monthly'}`)} ·{' '}
            {t('plans.renews', { date: dateLabel(plan.cycle_end) })}
          </span>
          <strong className={`${styles.multiplier} ${color}`}>
            {multiplier == null ? '—' : `${multiplier.toFixed(1)}×`}
          </strong>
        </div>
        <div className={styles.row}>
          <strong>{estimate(plan.value_usd)}</strong>
          <span>{scale.toFixed(1)}×</span>
        </div>
        <div className={styles.bar} aria-label={t('plans.valueBar')}>
          <div
            className={styles.fill}
            style={{ width: `${Math.min(100, ((multiplier ?? 0) / scale) * 100)}%` }}
          />
          <i style={{ left: `${100 / scale}%` }} title={t('plans.breakEven')} />
        </div>
        <div className={styles.row}>
          <span>{t('plans.cycleProgress', { percent: Math.round(progress) })}</span>
          <span>
            {t('plans.projected')}: {estimate(plan.projected_value_usd)}
          </span>
        </div>
        <div className={styles.bar}>
          <div className={styles.progress} style={{ width: `${progress}%` }} />
        </div>
        <div className={styles.row}>
          <span>
            {t('plans.last7')}: {estimate(plan.last_7d_value_usd)}
          </span>
          <span>
            {t('plans.effective')}: {formatUsd(plan.effective_usd_per_mtok)}
          </span>
        </div>
        {(plan.unpriced_token_share ?? 0) > 0.05 && (
          <p className={styles.warning}>
            {t('plans.unpriced', { percent: Math.round(plan.unpriced_token_share * 100) })}
          </p>
        )}
        {plan.notes && <p>{plan.notes}</p>}
        {(plan.credentials ?? []).map((c) => (
          <div className={styles.credential} key={c.auth_id}>
            <strong>{c.label}</strong> {c.disabled && <span>{t('plans.disabledCredential')}</span>}
            {c.windows_error && <p className={styles.warning}>{c.windows_error}</p>}
            {(c.windows ?? []).map((w) => (
              <div className={styles.window} key={w.key}>
                <div className={styles.row}>
                  <span>
                    {w.label} · {Math.round((w.used_fraction ?? 0) * 100)}%
                  </span>
                  <span>{t('plans.reset', { time: relativeTime(w.resets_at) })}</span>
                </div>
                <div className={styles.bar}>
                  <div
                    className={styles.progress}
                    style={{
                      width: `${Math.max(0, Math.min(100, (w.used_fraction ?? 0) * 100))}%`,
                    }}
                  />
                </div>
                <div className={styles.row}>
                  <span>{t('plans.used', { value: estimate(w.value_usd) })}</span>
                  <span>{t('plans.left', { value: estimate(w.est_headroom_usd) })}</span>
                </div>
                {w.provider_used != null && w.provider_limit != null && (
                  <small>
                    {t('plans.providerMetered', {
                      used: w.unit === 'usd' ? formatUsd(w.provider_used) : w.provider_used,
                      limit: w.unit === 'usd' ? formatUsd(w.provider_limit) : w.provider_limit,
                      unit: w.unit === 'usd' ? '' : w.unit,
                    })}
                  </small>
                )}
              </div>
            ))}
          </div>
        ))}
        <details>
          <summary>{t('plans.details')}</summary>
          <div className={styles.details}>
            <p>
              {t('plans.chartLegend', {
                value: estimate(plan.value_usd),
                price: formatUsd(plan.price_usd),
              })}
            </p>
            {points.length > 0 && (
              <svg
                viewBox="0 0 100 110"
                preserveAspectRatio="none"
                className={styles.chart}
                role="img"
                aria-label={t('plans.chartLabel')}
              >
                <line
                  x1="0"
                  x2="100"
                  y1={100 - (plan.price_usd / max) * 90}
                  y2={100 - (plan.price_usd / max) * 90}
                  className={styles.priceLine}
                />
                <polyline points={coords} className={styles.valueLine} />
                {breakIndex >= 0 && (
                  <circle
                    cx={points.length === 1 ? 0 : (breakIndex / (points.length - 1)) * 100}
                    cy={100 - (points[breakIndex].cumulative_usd / max) * 90}
                    r="2"
                    className={styles.dot}
                  >
                    <title>
                      {t('plans.breakEven')}: {dateLabel(plan.break_even_at)}
                    </title>
                  </circle>
                )}
              </svg>
            )}
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>{t('plans.model')}</th>
                    <th>{t('plans.requests')}</th>
                    <th>{t('plans.tokens')}</th>
                    <th>{t('plans.cost')}</th>
                    <th>{t('plans.share')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(plan.models ?? []).map((m) => (
                    <tr key={`${m.provider}:${m.model}`}>
                      <td>{m.model}</td>
                      <td>{(m.totals?.requests ?? 0).toLocaleString()}</td>
                      <td>
                        {(
                          (m.totals?.input_tokens ?? 0) + (m.totals?.output_tokens ?? 0)
                        ).toLocaleString()}
                      </td>
                      <td>{m.priced ? estimate(m.totals?.cost_usd) : '—'}</td>
                      <td>
                        {plan.value_usd > 0
                          ? `${(((m.totals?.cost_usd ?? 0) / plan.value_usd) * 100).toFixed(1)}%`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      </div>
    </Card>
  );
}

export function PlansPage() {
  const { t } = useTranslation();
  const connected = useAuthStore((s) => s.connectionStatus === 'connected');
  const apiBase = useAuthStore((s) => s.apiBase);
  const [offset, setOffset] = useState('0');
  const [data, setData] = useState<PlansResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<Partial<SubscriptionPlan> | null>(null);
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
      if (id === request.current && revision === apiClient.getConnectionRevision())
        setError(e instanceof Error ? e.message : t('plans.loadFailed'));
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
  return (
    <div className={styles.page} aria-busy={loading}>
      <header className={styles.header}>
        <div>
          <h1>{t('plans.title')}</h1>
          <p>{t('plans.description')}</p>
        </div>
        <div className={styles.controls}>
          <SegmentedControl
            options={[
              { value: '0', label: t('plans.current') },
              { value: '-1', label: t('plans.previous') },
            ]}
            value={offset}
            onChange={setOffset}
            ariaLabel={t('plans.cycle')}
          />
          <label className={styles.offset}>
            {t('plans.cycle')}{' '}
            <select value={offset} onChange={(e) => setOffset(e.target.value)}>
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
          </label>
          <Button
            variant="secondary"
            onClick={() => void refresh()}
            loading={loading}
            disabled={!connected}
          >
            {t('plans.refresh')}
          </Button>
          <Button onClick={() => setEditor({})}>{t('plans.addPlan')}</Button>
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
          <Card>
            <div className={styles.hero}>
              <strong>
                {t('plans.hero', {
                  price: formatUsd(data.totals.price_usd),
                  value: estimate(data.totals.value_usd),
                  multiplier:
                    data.totals.multiplier == null ? '—' : `${data.totals.multiplier.toFixed(1)}×`,
                })}
              </strong>
              <span>
                {t('plans.projected')}: {estimate(data.totals.projected_value_usd)}
              </span>
              <button
                type="button"
                onClick={() => unassignedRef.current?.scrollIntoView({ behavior: 'smooth' })}
              >
                {t('plans.unassignedValue', { value: estimate(data.totals.unassigned_value_usd) })}
              </button>
              <small title={data.pricing.error}>
                {t('plans.pricing', {
                  source: data.pricing.source || '—',
                  age: data.pricing.fetched_at ? relativeTime(data.pricing.fetched_at) : '—',
                })}
                {data.pricing.error ? ` · ${data.pricing.error}` : ''}
              </small>
            </div>
          </Card>
          {data.plans.length === 0 ? (
            <EmptyState
              title={t('plans.emptyTitle')}
              description={t('plans.emptyDescription')}
              action={<Button onClick={() => setEditor({})}>{t('plans.addFirst')}</Button>}
            />
          ) : (
            <div className={styles.grid}>
              {data.plans.map((p) => (
                <PlanCard key={p.id} plan={p} edit={() => void edit(p.id)} />
              ))}
            </div>
          )}
          <section ref={unassignedRef}>
            <Card title={t('plans.unassigned')}>
              <p>{t('plans.unassignedDescription')}</p>
              {data.unassigned.length === 0 && <p>{t('plans.noneUnassigned')}</p>}
              {data.unassigned.map((u) => (
                <div className={styles.unassigned} key={`${u.provider}:${u.auth_id}`}>
                  <span>
                    <strong>{u.label || u.provider}</strong> · {u.provider} ·{' '}
                    {estimate(u.value_usd)} · {t('plans.requestCount', { count: u.requests })}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setEditor({
                        name: u.label || u.provider,
                        provider: u.provider,
                        credentials: u.auth_id ? [u.auth_id] : [],
                      })
                    }
                  >
                    {t('plans.createPlan')}
                  </Button>
                </div>
              ))}
            </Card>
          </section>
          <p className={styles.footnote}>{t('plans.accuracy')}</p>
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
