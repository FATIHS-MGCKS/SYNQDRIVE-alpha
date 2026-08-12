/**
 * E6B Costs & Downtime — canonical E4 only. Authoritative Money is rendered ONLY for
 * categories E4 serves as such (OPERATING_EXPENSES per current contract), per
 * currency (never summed across currencies, never a synthetic grand total).
 * Maintenance/Damage/Fixed costs follow the E4 status/reason (rendered STATUS-ONLY,
 * never reconstructed as amounts). No Pareto/waterfall/aging over unsupported
 * categories, no estimatedExposure, no predictive/forecast. Downtime is shown from
 * canonical utilization facts (durations/counts), never from telemetry.
 */
import { useLanguage } from '../../i18n/LanguageContext';
import type { EvaluationsAsyncResult } from '../../lib/evaluations/evaluations-request';
import type {
  EvaluationsCostModelSection,
  E4CostCategoryResult,
} from '../../lib/evaluations/evaluations-canonical.types';
import { formatEvaluationsMoney } from '../../lib/evaluations/evaluations-money';
import { EvaluationsSectionShell } from './EvaluationsSectionShell';
import { MetricStatusBadge } from './MetricStatusBadge';
import { canShowMetricValue, costCategoryLabelKey } from './evaluations-presentation';

function CostCategoryRow({ category }: { category: E4CostCategoryResult }) {
  const { t, locale } = useLanguage();
  const showMoney = canShowMetricValue(category.status) && category.totalsByCurrency.length > 0;
  return (
    <li
      className="rounded-lg border border-[var(--border)] p-2 flex items-start justify-between gap-2"
      data-testid={`evaluations-cost-${category.category}`}
    >
      <div className="min-w-0">
        <p className="text-xs font-medium">{t(costCategoryLabelKey(category.category))}</p>
        {showMoney ? (
          // Per-currency totals, each rendered explicitly — never summed together.
          <div className="flex flex-col gap-0.5">
            {category.totalsByCurrency.map((m) => (
              <span key={m.currency} className="text-sm font-semibold tabular-nums">
                {formatEvaluationsMoney(m, locale) ?? t('evaluations.value.unavailable')}
              </span>
            ))}
          </div>
        ) : (
          // Unsupported / non-value categories: status + reason ONLY, never an amount.
          <p className="text-[11px] text-[var(--muted-foreground)]">
            {t('evaluations.cost.unsupported')}
            {category.reason ? ` · ${category.reason}` : ''}
          </p>
        )}
      </div>
      <MetricStatusBadge status={category.status} />
    </li>
  );
}

export function CostDowntimeSection({
  costModel,
}: {
  costModel: EvaluationsAsyncResult<EvaluationsCostModelSection>;
}) {
  const { t } = useLanguage();
  return (
    <EvaluationsSectionShell
      titleKey="evaluations.section.cost"
      async={costModel}
      testId="evaluations-cost"
    >
      {(cost) => (
        <div className="flex flex-col gap-2">
          {cost.mixedCurrency ? (
            <p className="text-[11px] sq-tone-warning rounded-md px-2 py-1 inline-flex">
              {t('evaluations.cost.mixedCurrency')}
            </p>
          ) : null}
          <ul className="flex flex-col gap-1">
            {cost.categories.map((c) => (
              <CostCategoryRow key={c.category} category={c} />
            ))}
          </ul>
        </div>
      )}
    </EvaluationsSectionShell>
  );
}
