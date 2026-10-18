import { useCallback, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AutocompleteInput } from '@/components/ui/AutocompleteInput';
import { Button } from '@/components/ui/Button';
import { Collapsible } from '@/components/ui/Collapsible';
import { Card } from '@/components/ui/Card';
import { IconPlus, IconTrash2 } from '@/components/ui/icons';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { useNow } from '@/hooks/useNow';
import { usageApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import { formatDateTimeValue } from '@/utils/format';
import { formatRelativeInstant } from '@/utils/quota/relativeTime';
import { usePricingAdmin } from '../hooks/usePricingAdmin';
import {
  buildOverrideMap,
  draftsFromOverrides,
  emptyOverrideDraft,
  formatCount,
  overridesFingerprint,
  toInstantMs,
  validateOverrideDrafts,
  type OverrideDraft,
  type OverrideIssue,
  type OverridePriceField,
} from '../utils';
import styles from './PricingPanel.module.scss';

const PRICE_COLUMNS: { field: OverridePriceField; labelKey: string }[] = [
  { field: 'input', labelKey: 'usageDashboard.pricing.overrides.columns.input' },
  { field: 'output', labelKey: 'usageDashboard.pricing.overrides.columns.output' },
  { field: 'cacheRead', labelKey: 'usageDashboard.pricing.overrides.columns.cacheRead' },
  { field: 'cacheWrite', labelKey: 'usageDashboard.pricing.overrides.columns.cacheWrite' },
];

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

interface PricingPanelProps {
  /** Runs after a change that affects usage figures: prices refreshed, overrides saved, data cleared. */
  onChanged: () => void;
}

/**
 * Collapsible pricing admin: catalog status and refresh, editable overrides, and the
 * destructive "clear usage data" action. The catalog loads the first time the panel opens.
 */
export function PricingPanel({ onChanged }: PricingPanelProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const now = useNow();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const { pricing, loading, error, load, refreshPrices, saveOverrides } = usePricingAdmin();

  const [drafts, setDrafts] = useState<OverrideDraft[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const draftSeq = useRef(0);
  const nextDraftId = useCallback(() => `draft-${++draftSeq.current}`, []);

  const catalogOptions = useMemo(
    () => (pricing?.catalog ?? []).map((entry) => ({ value: entry.id, label: entry.name })),
    [pricing]
  );
  const issues = useMemo(() => validateOverrideDrafts(drafts), [drafts]);
  const rowNumberById = useMemo(
    () => new Map(drafts.map((draft, index) => [draft.id, index + 1])),
    [drafts]
  );
  const invalidPatternIds = useMemo(() => {
    const ids = new Set<string>();
    issues.forEach((issue) => {
      if (issue.code === 'patternRequired' || issue.code === 'duplicatePattern') {
        ids.add(issue.draftId);
      }
    });
    return ids;
  }, [issues]);
  const invalidPriceKeys = useMemo(() => {
    const keys = new Set<string>();
    issues.forEach((issue) => {
      if (issue.code === 'invalidPrice') keys.add(`${issue.draftId}:${issue.field}`);
    });
    return keys;
  }, [issues]);
  const dirty =
    pricing !== null &&
    overridesFingerprint(buildOverrideMap(drafts)) !== overridesFingerprint(pricing.overrides);
  const canSave = dirty && issues.length === 0 && !saving && !refreshing;

  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (!event.currentTarget.open || loading || pricing !== null) return;
    void load().then((next) => {
      if (next) setDrafts(draftsFromOverrides(next.overrides, nextDraftId));
    });
  };

  const handleRefreshPrices = async () => {
    setRefreshing(true);
    try {
      const next = await refreshPrices();
      if (next.error) {
        showNotification(
          t('usageDashboard.notify.refreshFailed', { message: next.error }),
          'error'
        );
      } else {
        showNotification(t('usageDashboard.pricing.refreshed'), 'success');
      }
      onChanged();
    } catch (err: unknown) {
      showNotification(
        t('usageDashboard.notify.refreshFailed', { message: messageOf(err) }),
        'error'
      );
    } finally {
      setRefreshing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const next = await saveOverrides(buildOverrideMap(drafts));
      setDrafts(draftsFromOverrides(next.overrides, nextDraftId));
      showNotification(t('usageDashboard.pricing.overrides.saved'), 'success');
      onChanged();
    } catch (err: unknown) {
      showNotification(t('usageDashboard.notify.saveFailed', { message: messageOf(err) }), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setDrafts(draftsFromOverrides(pricing?.overrides ?? {}, nextDraftId));
  };

  const updateDraft = (id: string, patch: Partial<OverrideDraft>) => {
    setDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft))
    );
  };

  const updatePrice = (id: string, field: OverridePriceField, value: string) => {
    setDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, [field]: value } : draft))
    );
  };

  const removeDraft = (id: string) => {
    setDrafts((current) => current.filter((draft) => draft.id !== id));
  };

  const addDraft = () => {
    const id = nextDraftId();
    setDrafts((current) => [...current, emptyOverrideDraft(id)]);
  };

  const handleClear = () => {
    showConfirmation({
      title: t('usageDashboard.pricing.danger.confirmTitle'),
      message: t('usageDashboard.pricing.danger.confirmMessage'),
      confirmText: t('usageDashboard.pricing.danger.confirm'),
      variant: 'danger',
      onConfirm: async () => {
        try {
          await usageApi.clear();
          showNotification(t('usageDashboard.pricing.danger.cleared'), 'success');
          onChanged();
        } catch (err: unknown) {
          showNotification(
            t('usageDashboard.notify.clearFailed', { message: messageOf(err) }),
            'error'
          );
        }
      },
    });
  };

  const issueText = (issue: OverrideIssue): string => {
    let body: string;
    switch (issue.code) {
      case 'patternRequired':
        body = t('usageDashboard.pricing.issues.patternRequired');
        break;
      case 'duplicatePattern':
        body = t('usageDashboard.pricing.issues.duplicatePattern', { pattern: issue.pattern });
        break;
      case 'invalidPrice':
        body = t('usageDashboard.pricing.issues.invalidPrice', {
          field: t(
            PRICE_COLUMNS.find((column) => column.field === issue.field)?.labelKey ??
              'usageDashboard.pricing.overrides.columns.input'
          ),
        });
        break;
      case 'emptyOverride':
        body = t('usageDashboard.pricing.issues.emptyOverride');
        break;
    }
    return t('usageDashboard.pricing.issues.rowPrefix', {
      row: rowNumberById.get(issue.draftId) ?? 0,
      message: body,
    });
  };

  const fetchedMs = pricing ? toInstantMs(pricing.fetchedAt) : null;
  const sourceKey = pricing?.source ?? '';
  const sourceLabel =
    sourceKey === 'openrouter' || sourceKey === 'override' || sourceKey === 'none'
      ? t(`usageDashboard.pricing.sources.${sourceKey}`)
      : sourceKey || t('usageDashboard.pricing.sources.none');

  return (
    <Collapsible
      label={t('usageDashboard.pricing.title')}
      hint={t('usageDashboard.pricing.hint')}
      onToggle={handleToggle}
    >
      <div className={styles.body}>
        {pricing === null && loading && (
          <p className={styles.muted}>{t('usageDashboard.pricing.loading')}</p>
        )}
        {pricing === null && !loading && error !== null && (
          <div className={styles.errorBox} role="alert">
            <span>{t('usageDashboard.pricing.loadFailed')}</span>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              {t('usageDashboard.states.retry')}
            </Button>
          </div>
        )}

        {pricing !== null && (
          <>
            <div className={styles.statusRow}>
              <dl className={styles.status}>
                <div>
                  <dt>{t('usageDashboard.pricing.status.source')}</dt>
                  <dd>{sourceLabel}</dd>
                </div>
                <div>
                  <dt>{t('usageDashboard.pricing.status.fetched')}</dt>
                  <dd title={formatDateTimeValue(pricing.fetchedAt, locale)}>
                    {fetchedMs === null
                      ? t('usageDashboard.pricing.status.never')
                      : formatRelativeInstant(fetchedMs, now, locale)}
                  </dd>
                </div>
                <div>
                  <dt>{t('usageDashboard.pricing.status.catalog')}</dt>
                  <dd>
                    {t('usageDashboard.pricing.status.catalogCount', {
                      count: formatCount(pricing.catalog.length, locale),
                    })}
                  </dd>
                </div>
              </dl>
              <Button
                variant="secondary"
                size="sm"
                loading={refreshing}
                disabled={saving}
                onClick={() => void handleRefreshPrices()}
              >
                {t('usageDashboard.pricing.refresh')}
              </Button>
            </div>

            {pricing.error && (
              <p className={styles.errorBox} role="alert">
                {t('usageDashboard.pricing.status.error', { message: pricing.error })}
              </p>
            )}
            {pricing.openrouterDisabled && (
              <p className={styles.note}>{t('usageDashboard.pricing.openrouterDisabled')}</p>
            )}

            <Card title={t('usageDashboard.pricing.overrides.title')}>
              <p className={styles.muted}>{t('usageDashboard.pricing.overrides.hint')}</p>

              {drafts.length === 0 ? (
                <p className={styles.muted}>{t('usageDashboard.pricing.overrides.empty')}</p>
              ) : (
                <Table className={styles.table}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('usageDashboard.pricing.overrides.columns.pattern')}</TableHead>
                      <TableHead>
                        {t('usageDashboard.pricing.overrides.columns.openrouterId')}
                      </TableHead>
                      {PRICE_COLUMNS.map((column) => (
                        <TableHead key={column.field} alignRight>
                          {t(column.labelKey)}
                        </TableHead>
                      ))}
                      <TableHead>
                        <span className={styles.srOnly}>
                          {t('usageDashboard.pricing.overrides.columns.actions')}
                        </span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drafts.map((draft) => (
                      <TableRow key={draft.id}>
                        <TableCell>
                          <input
                            className={styles.input}
                            value={draft.pattern}
                            placeholder={t('usageDashboard.pricing.overrides.placeholders.pattern')}
                            aria-label={t('usageDashboard.pricing.overrides.columns.pattern')}
                            aria-invalid={invalidPatternIds.has(draft.id)}
                            disabled={saving}
                            onChange={(event) =>
                              updateDraft(draft.id, { pattern: event.target.value })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <AutocompleteInput
                            wrapperClassName={styles.autocomplete}
                            value={draft.openrouterId}
                            options={catalogOptions}
                            placeholder={t(
                              'usageDashboard.pricing.overrides.placeholders.openrouterId'
                            )}
                            disabled={saving}
                            onChange={(value) => updateDraft(draft.id, { openrouterId: value })}
                          />
                        </TableCell>
                        {PRICE_COLUMNS.map((column) => (
                          <TableCell key={column.field} alignRight>
                            <input
                              className={`${styles.input} ${styles.priceInput}`}
                              inputMode="decimal"
                              value={draft[column.field]}
                              placeholder={t('usageDashboard.pricing.overrides.placeholders.price')}
                              aria-label={t(column.labelKey)}
                              aria-invalid={invalidPriceKeys.has(`${draft.id}:${column.field}`)}
                              disabled={saving}
                              onChange={(event) =>
                                updatePrice(draft.id, column.field, event.target.value)
                              }
                            />
                          </TableCell>
                        ))}
                        <TableCell alignRight>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={saving}
                            title={t('usageDashboard.pricing.overrides.remove')}
                            aria-label={t('usageDashboard.pricing.overrides.remove')}
                            onClick={() => removeDraft(draft.id)}
                          >
                            <IconTrash2 size={14} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {issues.length > 0 && (
                <ul className={styles.issues} role="alert">
                  {issues.map((issue, index) => (
                    <li key={`${issue.draftId}-${issue.code}-${index}`}>{issueText(issue)}</li>
                  ))}
                </ul>
              )}

              <div className={styles.actions}>
                <Button variant="secondary" size="sm" disabled={saving} onClick={addDraft}>
                  <IconPlus size={14} />
                  {t('usageDashboard.pricing.overrides.add')}
                </Button>
                <div className={styles.actionsEnd}>
                  {dirty && (
                    <span className={styles.dirty}>
                      {t('usageDashboard.pricing.overrides.dirty')}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!dirty || saving}
                    onClick={handleDiscard}
                  >
                    {t('usageDashboard.pricing.overrides.discard')}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={saving}
                    disabled={!canSave}
                    onClick={() => void handleSave()}
                  >
                    {t('usageDashboard.pricing.overrides.save')}
                  </Button>
                </div>
              </div>
            </Card>
          </>
        )}

        <section className={styles.danger} aria-labelledby="usage-danger-title">
          <div>
            <h3 id="usage-danger-title" className={styles.dangerTitle}>
              {t('usageDashboard.pricing.danger.title')}
            </h3>
            <p className={styles.muted}>{t('usageDashboard.pricing.danger.clearHint')}</p>
          </div>
          <Button variant="danger" size="sm" onClick={handleClear}>
            {t('usageDashboard.pricing.danger.clear')}
          </Button>
        </section>
      </div>
    </Collapsible>
  );
}
