import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import {
  IconAlertTriangle,
  IconChevronDown,
  IconPencil,
} from '@/components/ui/icons';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import type { PlanCredential, PlanValue, PlanWindow, RoutingOrderEntry } from '@/types/plans';
import { BrandLogo } from './BrandLogo';
import { CumulativeChart } from './CumulativeChart';
import { windowCreditsLeft, windowUsedFraction } from './routing';
import {
  dateLabel,
  estimate,
  formatUsd,
  getDaysUntil,
  getMultiplierTier,
  getProviderFamily,
  getWindowMeterTier,
  projectWindow,
  relativeTime,
  resolveProviderThemeColor,
} from './utils';
import styles from './PlansPage.module.scss';

interface PlanCardProps {
  plan: PlanValue;
  onEdit: () => void;
  isDark: boolean;
  /** Smart-routing entries by credential id; empty when the server lacks routing. */
  routing?: Map<string, RoutingOrderEntry>;
}

function formatShortWindowLabel(label: string): string {
  const clean = label.trim().toLowerCase();
  if (clean.includes('5') && (clean.includes('h') || clean.includes('hour'))) return '5h';
  if (clean.includes('week')) return 'Weekly';
  if (clean.includes('month')) return 'Monthly';
  if (clean.includes('credit')) return 'Credits';
  if (clean.includes('day')) return 'Daily';
  return label;
}

export function PlanCard({ plan, onEdit, isDark, routing }: PlanCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const family = getProviderFamily(plan.provider);
  const themeColor = resolveProviderThemeColor(family.colorKey, isDark);

  const hasUsage = (plan.value_usd > 0) || ((plan.totals?.requests ?? 0) > 0);
  const multiplier = plan.multiplier;
  const tier = getMultiplierTier(multiplier, hasUsage, plan.price_usd);

  // Renewal text
  const daysUntilRenewal = getDaysUntil(plan.cycle_end);
  const renewalText =
    daysUntilRenewal != null && daysUntilRenewal > 0
      ? t('plans.renewsInDays', { days: daysUntilRenewal })
      : t('plans.renews', { date: dateLabel(plan.cycle_end) });

  // Account label derived from credentials
  const credentials = plan.credentials ?? [];
  const accountLabel =
    credentials.length === 1
      ? credentials[0].label || credentials[0].auth_id
      : credentials.length > 1
        ? `${credentials.length} accounts`
        : family.name;

  // Value-vs-price fill percentage
  const barWidth =
    plan.price_usd > 0
      ? Math.min(100, Math.max(0, (plan.value_usd / plan.price_usd) * 100))
      : plan.value_usd > 0
        ? 100
        : 0;

  // Cycle progress
  const progress =
    plan.length_days > 0
      ? Math.min(100, Math.max(0, (plan.elapsed_days / plan.length_days) * 100))
      : 0;

  const renderRankBadge = (authId: string) => {
    const entry = routing?.get(authId);
    if (!entry) return null;
    const text =
      entry.state === 'active'
        ? t('plans.routing.card.rank', { rank: entry.rank })
        : t(`plans.routing.card.${entry.state}`);
    return (
      <span
        className={`${styles.cardRankBadge} ${styles['cardRankBadge_' + entry.state] ?? ''}`}
        title={t('plans.routing.card.rankHint')}
      >
        {text}
      </span>
    );
  };

  // Window meter renderer
  const renderMeter = (w: PlanWindow) => {
    const known = windowUsedFraction(w);
    if (known == null) {
      const credits = windowCreditsLeft(w);
      return (
        <div key={w.key} className={styles.meterItem}>
          <div className={styles.meterTop}>
            <span className={styles.meterLabel}>{formatShortWindowLabel(w.label)}</span>
            {w.exhausted && <span className={styles.exhaustedChip}>{t('plans.exhausted')}</span>}
          </div>
          <span className={styles.meterUnknown}>
            {credits != null
              ? t('plans.routing.card.creditsLeft', { value: estimate(credits) })
              : t('plans.routing.card.usageUnknown')}
          </span>
          {w.resets_at && (
            <span className={styles.meterReset}>
              {t('plans.resetsIn', { time: relativeTime(w.resets_at) })}
            </span>
          )}
        </div>
      );
    }
    const fraction = known;
    const pct = Math.round(fraction * 100);
    const isExhausted = Boolean(w.exhausted || fraction >= 1);
    const meterTier = getWindowMeterTier(fraction, isExhausted);
    const projection = projectWindow(w);
    const projectedPct = projection ? Math.round(projection.fraction * 100) : null;
    const projectionTier = projection ? getWindowMeterTier(projection.fraction, false) : null;

    return (
      <div key={w.key} className={styles.meterItem}>
        <div className={styles.meterTop}>
          <span className={styles.meterLabel}>{formatShortWindowLabel(w.label)}</span>
          <span className={styles.meterPct}>{pct}%</span>
          {isExhausted && (
            <span className={styles.exhaustedChip}>{t('plans.exhausted')}</span>
          )}
        </div>
        <div className={styles.meterTrack}>
          {projectedPct != null && (
            <div
              className={`${styles.meterProjected} ${styles['meterFill_' + projectionTier]}`}
              style={{ width: `${Math.min(100, projectedPct)}%` }}
            />
          )}
          <div
            className={`${styles.meterFill} ${styles['meterFill_' + meterTier]}`}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
        {projection && (
          <span
            className={`${styles.meterProjection} ${styles['projection_' + projectionTier]}`}
            title={t('plans.projectionHint')}
          >
            {projection.exhaustsAt
              ? t('plans.projectedOut', { time: relativeTime(projection.exhaustsAt) })
              : t('plans.projectedAtReset', { percent: projectedPct })}
          </span>
        )}
        <span className={styles.meterReset}>
          {t('plans.resetsIn', { time: relativeTime(w.resets_at) })}
        </span>
      </div>
    );
  };

  const allWindows = credentials.flatMap((c) => c.windows ?? []);
  const isSingleCredential = credentials.length <= 1;

  return (
    <article
      className={`${styles.planCard} ${expanded ? styles.planCardExpanded : ''}`}
      style={{ '--provider-accent': themeColor.text } as CSSProperties}
    >
      <div
        className={styles.cardSummary}
        onClick={() => setExpanded((prev) => !prev)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((prev) => !prev);
          }
        }}
        aria-expanded={expanded}
      >
        {/* Left Column: Plan name, account label, renews */}
        <div className={styles.summaryLeft}>
          <div className={styles.planTitleRow}>
            <strong className={styles.planName}>{plan.name}</strong>
            <span className={styles.planBadges}>
              {isSingleCredential && credentials[0] && renderRankBadge(credentials[0].auth_id)}
              {plan.limit_type && (
                <span
                  className={styles.cardLimitChip}
                  title={t(
                    `plans.routing.limitSourceHint.${plan.limit_type_source === 'config' ? 'config' : 'auto'}`
                  )}
                >
                  {t(`plans.routing.limit.${plan.limit_type}`)}
                </span>
              )}
              {(plan.routing === 'prefer' || plan.routing === 'avoid') && (
                <span className={`${styles.cardLimitChip} ${styles['routingChip_' + plan.routing]}`}>
                  {t(`plans.routing.override.${plan.routing}`)}
                </span>
              )}
            </span>
          </div>
          <div className={styles.planMetaRow}>
            <span className={styles.accountLabel} title={accountLabel}>
              {accountLabel}
            </span>
            <span className={styles.metaDivider}>·</span>
            <span className={styles.renewText}>{renewalText}</span>
          </div>
        </div>

        {/* Middle Column: Big API value, price, multiplier tier badge, value-vs-price bar */}
        <div className={styles.summaryMiddle}>
          {!hasUsage ? (
            <div className={styles.noTrafficText}>{t('plans.noTrafficThisCycle')}</div>
          ) : (
            <>
              <div className={styles.middleValRow}>
                <span className={styles.bigApiValue}>{estimate(plan.value_usd)}</span>
                <span className={styles.mutedPrice}>
                  {t('plans.ofPrice', { price: formatUsd(plan.price_usd) })}
                </span>
                <span className={`${styles.multiplierBadge} ${styles['badge_' + tier]}`}>
                  {multiplier == null ? '—' : `${multiplier.toFixed(1)}×`}
                </span>
              </div>
              <div className={styles.valueBarTrack}>
                <div
                  className={`${styles.valueBarFill} ${styles['barFill_' + tier]}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </>
          )}
        </div>

        {/* Right Column: Limit Windows */}
        <div className={styles.summaryRight}>
          {allWindows.length === 0 ? (
            <span className={styles.noWindowsText}>{t('plans.noWindows')}</span>
          ) : isSingleCredential ? (
            <div className={styles.metersInline}>{allWindows.map(renderMeter)}</div>
          ) : (
            <div className={styles.credentialSubRows}>
              {credentials.map((cred: PlanCredential) => (
                <div key={cred.auth_id} className={styles.credSubRow}>
                  <span className={styles.credSubLabel} title={cred.label || cred.auth_id}>
                    {renderRankBadge(cred.auth_id)} {cred.label || cred.auth_id}
                  </span>
                  <div className={styles.metersInline}>
                    {(cred.windows ?? []).map(renderMeter)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions Column: Edit Icon + Chevron */}
        <div className={styles.summaryActions}>
          <Button
            variant="ghost"
            size="sm"
            className={styles.actionIconBtn}
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            title={t('plans.edit')}
            aria-label={t('plans.edit')}
          >
            <IconPencil size={15} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={styles.actionIconBtn}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((prev) => !prev);
            }}
            title={expanded ? t('plans.collapseDetails') : t('plans.expandDetails')}
            aria-label={expanded ? t('plans.collapseDetails') : t('plans.expandDetails')}
          >
            <IconChevronDown
              size={16}
              className={`${styles.chevronIcon} ${expanded ? styles.chevronOpen : ''}`}
            />
          </Button>
        </div>
      </div>

      {/* Expanded Details Panel */}
      {expanded && (
        <div className={styles.cardDetails}>
          {/* Cycle progress & projection */}
          <div className={styles.detailsProgressSection}>
            <div className={styles.progressRow}>
              <span className={styles.progressLabel}>
                {t('plans.cycleProgress', { percent: Math.round(progress) })}
              </span>
              <span className={styles.progressProjected}>
                {t('plans.projected')}: <strong>{estimate(plan.projected_value_usd)}</strong>
              </span>
            </div>
            <div className={styles.cycleProgressTrack}>
              <div
                className={styles.cycleProgressFill}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Key Stat Pills */}
          <div className={styles.statsGrid}>
            <div className={styles.statTile}>
              <span className={styles.statLabel}>{t('plans.last7')}</span>
              <strong className={styles.statValue}>{estimate(plan.last_7d_value_usd)}</strong>
            </div>
            <div className={styles.statTile}>
              <span className={styles.statLabel}>{t('plans.effective')}</span>
              <strong className={styles.statValue}>
                {plan.effective_usd_per_mtok != null
                  ? formatUsd(plan.effective_usd_per_mtok)
                  : '—'}
              </strong>
            </div>
            <div className={styles.statTile}>
              <span className={styles.statLabel}>{t('plans.breakEven')}</span>
              <strong className={styles.statValue}>
                {plan.break_even_at ? dateLabel(plan.break_even_at) : '—'}
              </strong>
            </div>
            <div className={styles.statTile}>
              <span className={styles.statLabel}>{t('plans.requests')}</span>
              <strong className={styles.statValue}>
                {(plan.totals?.requests ?? 0).toLocaleString()}
              </strong>
            </div>
          </div>

          {/* Unpriced-token warning if > 5% */}
          {(plan.unpriced_token_share ?? 0) > 0.05 && (
            <div className={styles.unpricedWarning}>
              <IconAlertTriangle size={15} />
              <span>
                {t('plans.unpriced', {
                  percent: Math.round(plan.unpriced_token_share * 100),
                })}
              </span>
            </div>
          )}

          {/* Detailed Windows Breakdown */}
          {allWindows.length > 0 && (
            <div className={styles.windowDetailsGrid}>
              {credentials.map((c) =>
                (c.windows ?? []).map((w) => {
                  const projection = projectWindow(w);
                  return (
                    <div key={`${c.auth_id}-${w.key}`} className={styles.windowDetailCard}>
                      <div className={styles.windowDetailHead}>
                        <strong>{w.label}</strong>
                        {w.resets_at && (
                          <span>{t('plans.resetsIn', { time: relativeTime(w.resets_at) })}</span>
                        )}
                      </div>
                      <div className={styles.windowDetailStats}>
                        {w.value_usd > 0 && (
                          <span>
                            {t('plans.used', { value: estimate(w.value_usd) })}
                          </span>
                        )}
                        {w.est_headroom_usd != null && (
                          <span>
                            {t('plans.headroom', { value: estimate(w.est_headroom_usd) })}
                          </span>
                        )}
                      </div>
                      {projection && (
                        <div
                          className={`${styles.windowProjectionText} ${
                            styles['projection_' + getWindowMeterTier(projection.fraction, false)]
                          }`}
                          title={t('plans.projectionHint')}
                        >
                          {projection.exhaustsAt
                            ? t('plans.projectedOutDetail', {
                                time: relativeTime(projection.exhaustsAt),
                              })
                            : projection.valueUsd != null
                              ? t('plans.projectedDetailValue', {
                                  percent: Math.round(projection.fraction * 100),
                                  value: estimate(projection.valueUsd),
                                })
                              : t('plans.projectedDetail', {
                                  percent: Math.round(projection.fraction * 100),
                                })}
                        </div>
                      )}
                      {windowCreditsLeft(w) != null && (
                        <div className={styles.providerMeteredText}>
                          {t('plans.routing.card.creditsLeft', {
                            value: estimate(windowCreditsLeft(w)),
                          })}
                        </div>
                      )}
                      {w.provider_used != null && w.provider_limit != null && (
                        <div className={styles.providerMeteredText}>
                          {t('plans.providerMetered', {
                            used:
                              w.unit === 'usd'
                                ? formatUsd(w.provider_used)
                                : w.provider_used.toLocaleString(),
                            limit:
                              w.unit === 'usd'
                                ? formatUsd(w.provider_limit)
                                : w.provider_limit.toLocaleString(),
                            unit: w.unit === 'usd' ? '' : w.unit,
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Cumulative Chart */}
          <div className={styles.chartWrapper}>
            <CumulativeChart
              series={plan.series ?? []}
              priceUsd={plan.price_usd}
              breakEvenAt={plan.break_even_at}
            />
          </div>

          {/* Models Table */}
          <div className={styles.modelsTableSection}>
            <h3 className={styles.modelsTableTitle}>{t('plans.model')}</h3>
            {(plan.models ?? []).length === 0 ? (
              <p className={styles.noModelsText}>{t('plans.noModelTraffic')}</p>
            ) : (
              <Table className={styles.modelsTable}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('plans.model')}</TableHead>
                    <TableHead alignRight>{t('plans.requests')}</TableHead>
                    <TableHead alignRight>{t('plans.tokens')}</TableHead>
                    <TableHead alignRight>{t('plans.cost')}</TableHead>
                    <TableHead alignRight>{t('plans.share')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(plan.models ?? []).map((m) => (
                    <TableRow key={`${m.provider}:${m.model}`}>
                      <TableCell>
                        <div className={styles.modelNameCell}>
                          <BrandLogo brandKey={family.brandKey} size={15} />
                          <span>{m.model}</span>
                        </div>
                      </TableCell>
                      <TableCell alignRight>
                        {(m.totals?.requests ?? 0).toLocaleString()}
                      </TableCell>
                      <TableCell alignRight>
                        {(
                          (m.totals?.input_tokens ?? 0) + (m.totals?.output_tokens ?? 0)
                        ).toLocaleString()}
                      </TableCell>
                      <TableCell alignRight>
                        {m.priced ? estimate(m.totals?.cost_usd) : '—'}
                      </TableCell>
                      <TableCell alignRight>
                        {plan.value_usd > 0
                          ? `${(((m.totals?.cost_usd ?? 0) / plan.value_usd) * 100).toFixed(1)}%`
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
