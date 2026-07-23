import { useCallback, useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { api } from '../../../../lib/api';
import { EmptyState, ErrorState, SectionHeader, SkeletonRows } from '../../../../components/patterns';
import { cn } from '../../../../components/ui/utils';
import { useLanguage } from '../../../i18n/LanguageContext';
import { META_TEXT_CLASS, ROW_BODY_CLASS, ROW_TITLE_CLASS } from '../../dashboard/dashboardShell';

interface HistoryRow {
  id: string;
  description: string;
  userName: string;
  createdAt: string;
}

interface RentalRulesHistorySectionProps {
  orgId: string | null;
}

function isRentalRulesHistoryRow(description: string): boolean {
  const normalized = description.toLowerCase();
  return (
    normalized.includes('rental category')
    || normalized.includes('rental requirement')
    || normalized.includes('miet')
    || normalized.includes('rental rules')
  );
}

export function RentalRulesHistorySection({ orgId }: RentalRulesHistorySectionProps) {
  const { t, locale } = useLanguage();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await api.activityLog.listByOrg(orgId, { limit: 100 });
      const filtered = (response.data ?? [])
        .filter((row) => isRentalRulesHistoryRow(row.description))
        .map((row) => ({
          id: row.id,
          description: row.description,
          userName: row.userName,
          createdAt: row.createdAt,
        }));
      setRows(filtered);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('rentalRules.ui.history.loadError'));
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-3">
      <SectionHeader
        title={t('rentalRules.ui.sections.history')}
        description={t('rentalRules.ui.history.description')}
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
                <p className={ROW_TITLE_CLASS}>{row.description}</p>
                <p className={cn(ROW_BODY_CLASS, 'mt-1')}>
                  {row.userName || t('rentalRules.ui.history.systemActor')}
                </p>
                <p className={META_TEXT_CLASS}>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(row.createdAt))}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
