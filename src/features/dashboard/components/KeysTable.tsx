import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { IconChevronDown } from '@/components/ui/icons';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { useNow } from '@/hooks/useNow';
import type { UsageKeyRow } from '@/types/usage';
import { formatCompactNumber, formatDateTimeValue, formatPercent } from '@/utils/format';
import { formatRelativeInstant } from '@/utils/quota/relativeTime';
import {
  cacheHitRate,
  DEFAULT_KEY_SORT,
  formatCount,
  formatUsd,
  hasUsage,
  keyMaskedHint,
  keyTitle,
  percentOf,
  providerLabel,
  sortKeyRows,
  toInstantMs,
  UNATTRIBUTED_KEY_ID,
} from '../utils';
import type { KeySort, KeySortColumn } from '../types';
import { ModelTable } from './ModelTable';
import { Sparkline } from './Sparkline';
import styles from './KeysTable.module.scss';

const COLUMN_COUNT = 9;

interface SortableColumn {
  column: KeySortColumn;
  labelKey: string;
  alignRight: boolean;
}

const SORTABLE_COLUMNS: SortableColumn[] = [
  { column: 'name', labelKey: 'usageDashboard.keys.columns.key', alignRight: false },
  { column: 'requests', labelKey: 'usageDashboard.keys.columns.requests', alignRight: true },
  { column: 'failed', labelKey: 'usageDashboard.keys.columns.failed', alignRight: true },
  { column: 'input', labelKey: 'usageDashboard.keys.columns.input', alignRight: true },
  { column: 'cached', labelKey: 'usageDashboard.keys.columns.cached', alignRight: true },
  { column: 'output', labelKey: 'usageDashboard.keys.columns.output', alignRight: true },
  { column: 'cost', labelKey: 'usageDashboard.keys.columns.cost', alignRight: true },
  { column: 'lastUsed', labelKey: 'usageDashboard.keys.columns.lastUsed', alignRight: false },
];

interface KeysTableProps {
  keys: UsageKeyRow[];
  /** Range-wide cost, the denominator for each key's share bar. */
  totalCostUsd: number;
  locale: string;
}

/**
 * One row per API key, sortable, with an inline per-model breakdown. Idle keys stay listed
 * (dimmed) so a configured key with no traffic is still visible.
 */
export function KeysTable({ keys, totalCostUsd, locale }: KeysTableProps) {
  const { t } = useTranslation();
  const [sort, setSort] = useState<KeySort>(DEFAULT_KEY_SORT);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  const unattributedLabel = t('usageDashboard.keys.unattributed');

  const sorted = useMemo(
    () => sortKeyRows(keys, sort, unattributedLabel),
    [keys, sort, unattributedLabel]
  );

  const handleSort = (column: KeySortColumn) => {
    setSort((current) =>
      current.column === column
        ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: column === 'name' ? 'asc' : 'desc' }
    );
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const ariaSortFor = (column: KeySortColumn) => {
    if (sort.column !== column) return 'none';
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  };

  return (
    <Card
      title={t('usageDashboard.keys.title')}
      extra={<span className={styles.hint}>{t('usageDashboard.keys.description')}</span>}
    >
      <Table className={styles.table}>
        <TableHeader>
          <TableRow>
            {SORTABLE_COLUMNS.map((def) => {
              const active = sort.column === def.column;
              return (
                <TableHead
                  key={def.column}
                  alignRight={def.alignRight}
                  aria-sort={ariaSortFor(def.column)}
                >
                  <button
                    type="button"
                    className={`${styles.sortButton} ${active ? styles.sortActive : ''}`.trim()}
                    onClick={() => handleSort(def.column)}
                  >
                    {t(def.labelKey)}
                    <IconChevronDown
                      size={12}
                      className={`${styles.sortIcon} ${
                        active && sort.direction === 'asc' ? styles.sortIconAsc : ''
                      }`.trim()}
                    />
                  </button>
                </TableHead>
              );
            })}
            <TableHead>{t('usageDashboard.keys.columns.trend')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT} className={styles.empty}>
                {t('usageDashboard.keys.empty')}
              </TableCell>
            </TableRow>
          )}
          {sorted.map((row) => (
            <KeyRows
              key={row.id}
              row={row}
              unattributedLabel={unattributedLabel}
              totalCostUsd={totalCostUsd}
              locale={locale}
              expanded={expandedIds.has(row.id)}
              onToggle={() => toggleExpanded(row.id)}
            />
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

interface KeyRowsProps {
  row: UsageKeyRow;
  unattributedLabel: string;
  totalCostUsd: number;
  locale: string;
  expanded: boolean;
  onToggle: () => void;
}

/** A key's summary row, plus its model breakdown when expanded. */
function KeyRows({
  row,
  unattributedLabel,
  totalCostUsd,
  locale,
  expanded,
  onToggle,
}: KeyRowsProps) {
  const { t } = useTranslation();
  const now = useNow();
  const { totals } = row;
  const title = keyTitle(row, unattributedLabel);
  const masked = keyMaskedHint(row);
  const idle = !hasUsage(totals);
  const isUnattributed = row.id === UNATTRIBUTED_KEY_ID;
  const detailId = `usage-key-detail-${row.id}`;

  const compact = (value: number) => formatCompactNumber(value);
  const hit = cacheHitRate(totals);
  const shareRaw = percentOf(totals.costUsd, totalCostUsd);
  const share = Number.isFinite(shareRaw) ? Math.min(100, Math.max(0, shareRaw)) : null;
  const lastUsedMs = toInstantMs(row.lastUsed);
  const firstSeenMs = toInstantMs(row.firstSeen);
  const providersText =
    row.providers.length > 0
      ? t('usageDashboard.keys.providers', {
          providers: row.providers
            .map((provider) => providerLabel(provider, t('usageDashboard.unknownProvider')))
            .join(', '),
        })
      : t('usageDashboard.keys.allProviders');
  const detailMeta = [
    providersText,
    firstSeenMs === null
      ? ''
      : t('usageDashboard.keys.firstSeen', { time: formatDateTimeValue(row.firstSeen, locale) }),
  ]
    .filter(Boolean)
    .join(' · ');

  const rowClass = [styles.row, idle ? styles.idle : '', expanded ? styles.open : '']
    .filter(Boolean)
    .join(' ');

  return (
    <Fragment>
      <TableRow className={rowClass} onClick={onToggle}>
        <TableCell>
          <div className={styles.identity}>
            <button
              type="button"
              className={styles.toggle}
              aria-expanded={expanded}
              aria-controls={expanded ? detailId : undefined}
              aria-label={
                expanded ? t('usageDashboard.keys.collapse') : t('usageDashboard.keys.expand')
              }
            >
              <IconChevronDown size={14} className={expanded ? styles.chevronOpen : undefined} />
            </button>
            <div className={styles.names}>
              <span className={styles.name}>{title}</span>
              {masked && <code className={styles.masked}>{masked}</code>}
              {!row.configured && !isUnattributed && (
                <span className={styles.removed} title={t('usageDashboard.keys.removedHint')}>
                  {t('usageDashboard.keys.removed')}
                </span>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell alignRight className={styles.num}>
          {formatCount(totals.requests, locale)}
        </TableCell>
        <TableCell
          alignRight
          className={`${styles.num} ${totals.failed > 0 ? styles.failed : ''}`.trim()}
        >
          {formatCount(totals.failed, locale)}
        </TableCell>
        <TableCell alignRight className={styles.num}>
          <span className={styles.primary} title={formatCount(totals.inputTokens, locale)}>
            {compact(totals.inputTokens)}
          </span>
          <span className={styles.split} title={t('usageDashboard.tokens.split')}>
            {compact(totals.uncachedInputTokens)} · {compact(totals.cacheReadTokens)} ·{' '}
            {compact(totals.cacheWriteTokens)}
          </span>
        </TableCell>
        <TableCell alignRight className={styles.num}>
          <span className={styles.primary} title={formatCount(totals.cacheReadTokens, locale)}>
            {compact(totals.cacheReadTokens)}
          </span>
          <span className={styles.split}>
            {t('usageDashboard.keys.cachedShare', { percent: formatPercent(hit) })}
          </span>
        </TableCell>
        <TableCell alignRight className={styles.num}>
          <span className={styles.primary} title={formatCount(totals.outputTokens, locale)}>
            {compact(totals.outputTokens)}
          </span>
          {totals.reasoningTokens > 0 && (
            <span className={styles.split}>
              {t('usageDashboard.kpi.reasoningSub', { count: compact(totals.reasoningTokens) })}
            </span>
          )}
        </TableCell>
        <TableCell alignRight className={styles.num}>
          <span className={styles.primary}>{formatUsd(totals.costUsd, locale)}</span>
          {share !== null && (
            <span
              className={styles.shareTrack}
              title={t('usageDashboard.keys.share', { percent: formatPercent(share) })}
              aria-hidden="true"
            >
              <span className={styles.shareFill} style={{ width: `${share}%` }} />
            </span>
          )}
        </TableCell>
        <TableCell className={styles.num}>
          {lastUsedMs === null ? (
            <span className={styles.never}>{t('usageDashboard.keys.never')}</span>
          ) : (
            <span title={formatDateTimeValue(row.lastUsed, locale)}>
              {formatRelativeInstant(lastUsedMs, now, locale)}
            </span>
          )}
        </TableCell>
        <TableCell>
          <Sparkline
            values={row.series.map((point) => point.requests)}
            ariaLabel={t('usageDashboard.keys.trend', { name: title })}
          />
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow id={detailId}>
          <TableCell colSpan={COLUMN_COUNT} className={styles.detailCell}>
            <div className={styles.detail}>
              {detailMeta && <p className={styles.detailMeta}>{detailMeta}</p>}
              <ModelTable
                rows={row.models}
                emptyText={t('usageDashboard.keys.noModels')}
                locale={locale}
              />
            </div>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}
