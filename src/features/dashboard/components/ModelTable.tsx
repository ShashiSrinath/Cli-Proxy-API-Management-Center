import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import type { UsageModelRow } from '@/types/usage';
import { formatCompactNumber } from '@/utils/format';
import { formatCount, formatUsd, providerLabel, sortModelRows, topKeyShares } from '../utils';
import { PriceCell } from './PriceCell';
import styles from './ModelTable.module.scss';

interface ModelTableProps {
  rows: UsageModelRow[];
  /** Key id to display title. Supplying it adds the "top keys" column (all-keys table only). */
  keyTitles?: Map<string, string>;
  emptyText: string;
  locale: string;
}

/** Per-model usage and price. Used for the all-keys table and inside each key's expansion. */
export function ModelTable({ rows, keyTitles, emptyText, locale }: ModelTableProps) {
  const { t } = useTranslation();
  const sorted = useMemo(() => sortModelRows(rows), [rows]);
  const showTopKeys = keyTitles !== undefined;

  if (sorted.length === 0) {
    return <p className={styles.empty}>{emptyText}</p>;
  }

  const compact = (value: number) => formatCompactNumber(value);

  return (
    <Table className={styles.table}>
      <TableHeader>
        <TableRow>
          <TableHead>{t('usageDashboard.models.columns.provider')}</TableHead>
          <TableHead>{t('usageDashboard.models.columns.model')}</TableHead>
          <TableHead alignRight>{t('usageDashboard.models.columns.requests')}</TableHead>
          <TableHead alignRight>{t('usageDashboard.models.columns.input')}</TableHead>
          <TableHead alignRight>{t('usageDashboard.models.columns.output')}</TableHead>
          <TableHead alignRight>{t('usageDashboard.models.columns.cost')}</TableHead>
          <TableHead>{t('usageDashboard.models.columns.price')}</TableHead>
          {showTopKeys && <TableHead>{t('usageDashboard.models.columns.topKeys')}</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row) => {
          const { totals } = row;
          const { shares, hidden } = topKeyShares(row);
          return (
            <TableRow key={`${row.provider}|${row.model}`}>
              <TableCell className={styles.provider}>
                {providerLabel(row.provider, t('usageDashboard.unknownProvider'))}
              </TableCell>
              <TableCell className={styles.model} title={row.model}>
                {row.model || t('usageDashboard.unknownModel')}
              </TableCell>
              <TableCell alignRight className={styles.num}>
                {formatCount(totals.requests, locale)}
              </TableCell>
              <TableCell alignRight className={styles.num}>
                <span title={formatCount(totals.inputTokens, locale)} className={styles.primary}>
                  {compact(totals.inputTokens)}
                </span>
                <span className={styles.split} title={t('usageDashboard.tokens.split')}>
                  {compact(totals.uncachedInputTokens)} · {compact(totals.cacheReadTokens)} ·{' '}
                  {compact(totals.cacheWriteTokens)}
                </span>
              </TableCell>
              <TableCell alignRight className={styles.num}>
                <span title={formatCount(totals.outputTokens, locale)} className={styles.primary}>
                  {compact(totals.outputTokens)}
                </span>
                {totals.reasoningTokens > 0 && (
                  <span className={styles.split}>
                    {t('usageDashboard.kpi.reasoningSub', {
                      count: compact(totals.reasoningTokens),
                    })}
                  </span>
                )}
              </TableCell>
              <TableCell alignRight className={styles.num}>
                {row.priced ? formatUsd(totals.costUsd, locale) : '—'}
              </TableCell>
              <TableCell>
                <PriceCell model={row} />
              </TableCell>
              {showTopKeys && (
                <TableCell>
                  {shares.length === 0 ? (
                    <span className={styles.none}>—</span>
                  ) : (
                    <div className={styles.topKeys}>
                      {shares.map((share) => (
                        <span
                          key={share.id}
                          className={styles.keyChip}
                          title={`${formatUsd(share.costUsd, locale)} · ${formatCount(share.requests, locale)}`}
                        >
                          {keyTitles?.get(share.id) ?? share.id}
                        </span>
                      ))}
                      {hidden > 0 && (
                        <span className={styles.more}>
                          {t('usageDashboard.models.moreKeys', { count: hidden })}
                        </span>
                      )}
                    </div>
                  )}
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
