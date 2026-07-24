import type { DashboardInsight } from '../../DashboardInsightsContext';
import { financialImpactEur, insightRecommendation } from '../../lib/insights-categories';
import { EmptyState } from '../../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import { evaluationsIntlLocale } from '../../lib/evaluations-format';

function SeverityBadge({ severity }: { severity: string }) {
  const cls =
    severity === 'CRITICAL'
      ? 'sq-tone-critical'
      : severity === 'WARNING'
        ? 'sq-tone-warning'
        : severity === 'OPPORTUNITY'
          ? 'sq-tone-brand'
          : 'sq-tone-neutral';
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${cls}`}>
      {severity}
    </span>
  );
}

export function EvaluationsInsightCard({
  insight,
  isDarkMode,
}: {
  insight: DashboardInsight;
  isDarkMode: boolean;
}) {
  const { locale } = useLanguage();
  const intlLocale = evaluationsIntlLocale(locale);
  const impact = financialImpactEur(insight);
  return (
    <article
      className={`rounded-xl border p-3 text-[11px] ${isDarkMode ? 'border-border' : 'border-gray-200'}`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-semibold text-foreground">{insight.title}</span>
        <SeverityBadge severity={insight.severity} />
      </div>
      <p className="text-muted-foreground leading-relaxed">{insight.message}</p>
      {impact != null && impact > 0 ? (
        <p className="mt-1 text-[10px] font-medium text-[color:var(--status-watch)]">
          ≈ {impact.toLocaleString(intlLocale)} €
        </p>
      ) : null}
      <p className="mt-1.5 text-[10px] font-medium text-[color:var(--brand)]">
        → {insightRecommendation(insight)}
      </p>
    </article>
  );
}

interface EvaluationsInsightListCardProps {
  title: string;
  loading: boolean;
  emptyTitle: string;
  emptyDescription: string;
  insights: DashboardInsight[];
  isDarkMode: boolean;
}

export function EvaluationsInsightListCard({
  title,
  loading,
  emptyTitle,
  emptyDescription,
  insights,
  isDarkMode,
}: EvaluationsInsightListCardProps) {
  const { t } = useLanguage();

  return (
    <section className="surface-premium/55 rounded-xl border border-border/40 p-3">
      <h3 className="text-[12px] font-semibold mb-3 text-foreground">{title}</h3>
      {loading ? (
        <p className="text-xs text-muted-foreground">{t('evaluations.ia.loading')}</p>
      ) : insights.length === 0 ? (
        <EmptyState compact title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {insights.map((i) => (
            <EvaluationsInsightCard key={i.id} insight={i} isDarkMode={isDarkMode} />
          ))}
        </div>
      )}
    </section>
  );
}
