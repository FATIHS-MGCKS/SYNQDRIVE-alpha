/**
 * E6B Executive Summary — a compact canonical KPI overview derived from the shared
 * E4 summary (no extra request). Every KPI maps to a canonical E1–E5 concept and
 * preserves status (no false zero). The issued-revenue KPI is E3/MTD authority
 * (from the summary's E3-delegated finance slice) and is labelled MTD.
 */
import { useLanguage } from '../../i18n/LanguageContext';
import type { EvaluationsAsyncResult } from '../../lib/evaluations/evaluations-request';
import type { EvaluationsAnalyticsInsightsSummary } from '../../lib/evaluations/evaluations-canonical.types';
import { formatEvaluationsMoney } from '../../lib/evaluations/evaluations-money';
import { EvaluationsSectionShell } from './EvaluationsSectionShell';
import { EvaluationsKpiCard } from './EvaluationsKpiCard';
import { canShowMetricValue, readNumericMetricForDisplay } from './evaluations-presentation';
import type { EvaluationsMoney } from '../../lib/evaluations/evaluations-canonical.types';

export function ExecutiveSummarySection({
  summary,
}: {
  summary: EvaluationsAsyncResult<EvaluationsAnalyticsInsightsSummary>;
}) {
  const { t, locale } = useLanguage();
  return (
    <div id="evaluations-section-executive" className="scroll-mt-24">
    <EvaluationsSectionShell
      titleKey="evaluations.section.executive"
      async={summary}
      testId="evaluations-executive"
    >
      {(data) => {
        const util = readNumericMetricForDisplay(data.sections.utilization.utilizationPercent);
        const strengths = data.sections.strengths;
        const weaknesses = data.sections.weaknesses;
        const financeIssued = data.sections.finance.metrics['fin.mtd_issued_revenue'];
        const issuedStatus = financeIssued?.status;
        const issuedMoney =
          financeIssued && issuedStatus && canShowMetricValue(issuedStatus)
            ? formatEvaluationsMoney(financeIssued.value as EvaluationsMoney, locale)
            : null;
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <EvaluationsKpiCard
              testId="evaluations-exec-issued-revenue"
              label={t('evaluations.kpi.issuedRevenue')}
              status={issuedStatus}
              value={issuedMoney ?? t('evaluations.value.unavailable')}
              note={t('evaluations.finance.mtd')}
            />
            <EvaluationsKpiCard
              testId="evaluations-exec-utilization"
              label={t('evaluations.kpi.utilization')}
              status={data.sections.utilization.status}
              value={
                util && util.value !== null
                  ? `${util.value.toFixed(1)} %`
                  : t('evaluations.value.unavailable')
              }
            />
            <EvaluationsKpiCard
              testId="evaluations-exec-strengths"
              label={t('evaluations.kpi.strengths')}
              status={strengths.status}
              value={canShowMetricValue(strengths.status) ? strengths.strengths.length : t('evaluations.value.unavailable')}
            />
            <EvaluationsKpiCard
              testId="evaluations-exec-weaknesses"
              label={t('evaluations.kpi.weaknesses')}
              status={weaknesses.status}
              value={canShowMetricValue(weaknesses.status) ? weaknesses.weaknesses.length : t('evaluations.value.unavailable')}
            />
          </div>
        );
      }}
    </EvaluationsSectionShell>
    </div>
  );
}
