import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import type { DashboardInsight } from '../../../DashboardInsightsContext';
import { useRentalOrg } from '../../../RentalContext';
import { api, type MisuseCaseRecord } from '../../../../lib/api';
import { insightRecommendation } from '../../../lib/insights-categories';
import { EvaluationsSection } from '../EvaluationsSection';
import { EVALUATIONS_SECTION_IDS } from '../evaluations-page.constants';
import { useLanguage } from '../../../i18n/LanguageContext';
import { EmptyState } from '../../../../components/patterns';
import { EvaluationsInsightListCard } from '../EvaluationsInsightListCard';

interface EvaluationsActionsSectionProps {
  businessRisks: DashboardInsight[];
  revenueLeakage: DashboardInsight[];
  insightsLoading: boolean;
  isDarkMode: boolean;
}

function MisuseAbusePanel({ orgId, isDarkMode }: { orgId: string; isDarkMode: boolean }) {
  const { t } = useLanguage();
  const [rows, setRows] = useState<MisuseCaseRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.misuseCases
      .list(orgId, { page: 1, limit: 8 })
      .then((res) => {
        if (!cancelled) setRows(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return (
    <div className="rounded-xl border border-border/40 p-3">
      <h3 className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-foreground">
        <ShieldAlert className="h-3.5 w-3.5 text-[color:var(--status-watch)]" />
        {t('evaluations.ia.sections.actions.misuse')}
      </h3>
      {loading ? (
        <p className="text-xs text-muted-foreground">{t('evaluations.ia.loading')}</p>
      ) : rows.length === 0 ? (
        <EmptyState
          compact
          title={t('evaluations.ia.sections.actions.noMisuse')}
          description={t('evaluations.ia.sections.actions.noMisuseHint')}
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={String(row.id)}
              className={`rounded-xl border p-3 text-[11px] ${isDarkMode ? 'border-border' : 'border-gray-200'}`}
            >
              <span className="font-semibold text-foreground">{row.title ?? row.type ?? '—'}</span>
              {row.description ? (
                <p className="mt-0.5 text-muted-foreground leading-relaxed">{row.description}</p>
              ) : null}
              {row.recommendedAction ? (
                <p className="mt-1.5 text-[10px] font-medium text-[color:var(--brand)]">
                  → {row.recommendedAction}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EvaluationsActionsSection({
  businessRisks,
  revenueLeakage,
  insightsLoading,
  isDarkMode,
}: EvaluationsActionsSectionProps) {
  const { t } = useLanguage();
  const { orgId } = useRentalOrg();

  const recommended = useMemo(() => {
    const combined = [...businessRisks, ...revenueLeakage];
    return combined
      .filter((i) => i.severity === 'CRITICAL' || i.severity === 'WARNING')
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 6);
  }, [businessRisks, revenueLeakage]);

  const surfaceState = insightsLoading ? 'loading' : recommended.length === 0 ? 'empty' : 'ready';

  return (
    <EvaluationsSection
      id={EVALUATIONS_SECTION_IDS.actions}
      title={t('evaluations.ia.sections.actions.title')}
      subtitle={t('evaluations.ia.sections.actions.subtitle')}
      surfaceState={surfaceState}
      emptyTitle={t('evaluations.ia.sections.actions.emptyTitle')}
      emptyDescription={t('evaluations.ia.sections.actions.emptyDescription')}
      defaultOpen={false}
    >
      {recommended.length > 0 ? (
        <ul className="mb-4 space-y-2">
          {recommended.map((i) => (
            <li key={i.id} className="flex items-start gap-2 text-[11px]">
              <span className="font-bold text-[color:var(--brand)]">•</span>
              <span>
                <span className="font-semibold text-foreground">{i.title}</span>
                <span className="text-muted-foreground"> — {insightRecommendation(i)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {orgId ? <MisuseAbusePanel orgId={orgId} isDarkMode={isDarkMode} /> : null}
        <EvaluationsInsightListCard
          title={t('evaluations.ia.sections.actions.priorityInsights')}
          loading={insightsLoading}
          emptyTitle={t('evaluations.ia.sections.actions.noPriority')}
          emptyDescription={t('evaluations.ia.sections.actions.noPriorityHint')}
          insights={recommended}
          isDarkMode={isDarkMode}
        />
      </div>
    </EvaluationsSection>
  );
}
