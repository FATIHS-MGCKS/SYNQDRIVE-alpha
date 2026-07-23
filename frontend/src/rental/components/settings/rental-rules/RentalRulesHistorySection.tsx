import { useCallback, useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { api } from '../../../../lib/api';
import { EmptyState, ErrorState, SectionHeader, SkeletonRows } from '../../../../components/patterns';
import { cn } from '../../../../components/ui/utils';
import { useLanguage } from '../../../i18n/LanguageContext';
import { META_TEXT_CLASS, ROW_BODY_CLASS, ROW_TITLE_CLASS } from '../../dashboard/dashboardShell';
import { formatRuleValue, labelRuleField } from './rental-rules.utils';
import type { RentalRuleRevisionListItemDto } from './rental-rules.types';

interface RentalRulesHistorySectionProps {
  orgId: string | null;
}

export function RentalRulesHistorySection({ orgId }: RentalRulesHistorySectionProps) {
  const { t, locale } = useLanguage();
  const [rows, setRows] = useState<RentalRuleRevisionListItemDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailDiff, setDetailDiff] = useState<Array<{ field: string; active: unknown; draft: unknown }>>([]);

  const load = useCallback(async () => {
    if (!orgId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await api.rentalRules.listRevisions(orgId, { limit: 100 });
      setRows(response.items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('rentalRules.ui.history.loadError'));
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleDetail = async (revisionId: string) => {
    if (expandedId === revisionId) {
      setExpandedId(null);
      setDetailDiff([]);
      return;
    }
    if (!orgId) return;
    setExpandedId(revisionId);
    setDetailLoading(true);
    try {
      const detail = await api.rentalRules.getRevision(orgId, revisionId);
      setDetailDiff(
        detail.diff.ruleDiffs
          .filter((row) => row.changed)
          .map((row) => ({ field: row.field, active: row.active, draft: row.draft })),
      );
    } catch {
      setDetailDiff([]);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <section className="space-y-3">
      <SectionHeader
        title={t('rentalRules.ui.sections.history')}
        description={t('rentalRules.workflow.history.description')}
      />

      <div className="surface-premium rounded-2xl border border-border/70 p-3 sm:p-4">
        {loading ? <SkeletonRows rows={4} /> : null}
        {!loading && error ? (
          <ErrorState compact title={t('rentalRules.ui.history.errorTitle')} description={error} onRetry={() => void load()} />
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <EmptyState
            compact
            icon={<History className="h-5 w-5" />}
            title={t('rentalRules.ui.history.emptyTitle')}
            description={t('rentalRules.ui.history.emptyDescription')}
          />
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-border/50 bg-background/40 px-3 py-2.5"
              >
                <button
                  type="button"
                  className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 rounded-md"
                  onClick={() => void toggleDetail(row.id)}
                  aria-expanded={expandedId === row.id}
                >
                  <p className={ROW_TITLE_CLASS}>
                    {t('rentalRules.workflow.history.entry', {
                      scope: row.scopeType,
                      version: row.version,
                      status: row.status,
                    })}
                  </p>
                  <p className={cn(ROW_BODY_CLASS, 'mt-1')}>
                    {row.publishedByName || row.createdByName || t('rentalRules.ui.history.systemActor')}
                    {row.changeReason ? ` · ${row.changeReason}` : ''}
                  </p>
                  <p className={META_TEXT_CLASS}>
                    {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
                      new Date(row.publishedAt ?? row.createdAt),
                    )}
                    {' · '}
                    {t('rentalRules.workflow.history.hash', { hash: row.rulesHash.slice(0, 12) })}
                  </p>
                </button>
                {expandedId === row.id ? (
                  <div className="mt-2 border-t border-border/50 pt-2">
                    {detailLoading ? (
                      <p className="text-[12px] text-muted-foreground">{t('rentalRules.workflow.history.loadingDiff')}</p>
                    ) : detailDiff.length === 0 ? (
                      <p className="text-[12px] text-muted-foreground">{t('rentalRules.workflow.history.noDiff')}</p>
                    ) : (
                      <ul className="space-y-1 text-[12px] text-muted-foreground">
                        {detailDiff.map((diff) => (
                          <li key={diff.field}>
                            <span className="font-medium text-foreground">{labelRuleField(diff.field)}</span>:{' '}
                            {formatRuleValue(diff.field, diff.active)} → {formatRuleValue(diff.field, diff.draft)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
