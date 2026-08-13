/**
 * E6B Finance & Receivables — canonical E3 truth (MTD authority), transported by the
 * always-on E3 finance bundle. Values are read status-aware via the canonical
 * finance-insights-adapter (no client recomputation, explicit currency, no false
 * zero). The section always shows its MTD scope, independent of the global analytics
 * period selector.
 */
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { EvaluationsAsyncResult } from '../../lib/evaluations/evaluations-request';
import type { FinancialInsightsBundleDto } from '../../lib/finance-insights.types';
import {
  readMoneyMetric,
  readPercentMetric,
  formatFinanceMoney,
  formatFinancePercent,
  financeUnavailableLabel,
  isMoneyAvailable,
} from '../../lib/finance-insights-adapter';
import { EvaluationsSectionShell } from './EvaluationsSectionShell';
import { EvaluationsKpiCard } from './EvaluationsKpiCard';
import type { EvaluationsMetricStatus } from '../../lib/evaluations/evaluations-canonical.types';

const MONEY_KPIS: ReadonlyArray<{ id: string; labelKey: TranslationKey }> = [
  { id: 'fin.mtd_issued_revenue', labelKey: 'evaluations.kpi.issuedRevenue' },
  { id: 'fin.mtd_paid_revenue', labelKey: 'evaluations.kpi.paidRevenue' },
  { id: 'fin.mtd_expenses', labelKey: 'evaluations.kpi.expenses' },
  { id: 'fin.mtd_net_result', labelKey: 'evaluations.kpi.netResult' },
  { id: 'fin.open_receivables', labelKey: 'evaluations.kpi.openReceivables' },
  { id: 'fin.overdue_receivables', labelKey: 'evaluations.kpi.overdueReceivables' },
];

export function FinanceReceivablesSection({
  finance,
}: {
  finance: EvaluationsAsyncResult<FinancialInsightsBundleDto>;
}) {
  const { t, locale } = useLanguage();
  return (
    <EvaluationsSectionShell
      titleKey="evaluations.section.finance"
      async={finance}
      testId="evaluations-finance"
      headerExtra={
        <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium sq-tone-neutral">
          {t('evaluations.finance.mtd')}
        </span>
      }
    >
      {(bundle) => (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          {MONEY_KPIS.map(({ id, labelKey }) => {
            const view = readMoneyMetric(bundle, id);
            const available = isMoneyAvailable(view);
            return (
              <EvaluationsKpiCard
                key={id}
                testId={`evaluations-finance-kpi-${id}`}
                label={t(labelKey)}
                status={view.status as EvaluationsMetricStatus}
                value={available ? formatFinanceMoney(view, locale) : financeUnavailableLabel(view.status)}
              />
            );
          })}
          {(() => {
            const margin = readPercentMetric(bundle, 'fin.profit_margin_mtd');
            const marginAvailable = margin.status === 'AVAILABLE' || margin.status === 'PARTIAL' || margin.status === 'STALE';
            return (
              <EvaluationsKpiCard
                testId="evaluations-finance-kpi-margin"
                label={t('evaluations.kpi.profitMargin')}
                status={margin.status as EvaluationsMetricStatus}
                value={marginAvailable && margin.value !== null ? formatFinancePercent(margin) : financeUnavailableLabel(margin.status)}
              />
            );
          })()}
        </div>
      )}
    </EvaluationsSectionShell>
  );
}
