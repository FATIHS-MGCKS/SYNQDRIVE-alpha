/**
 * E6B Fleet Performance / Utilization — canonical E4 utilization only. No frontend
 * utilization recomputation from bookings. Preserves scheduled-occupancy semantics
 * (never labelled "actual usage"), the PARTIAL limitation, and the unknown
 * blocked/downtime history. Telemetry is not shown as downtime.
 */
import { useLanguage } from '../../i18n/LanguageContext';
import type { EvaluationsAsyncResult } from '../../lib/evaluations/evaluations-request';
import type { EvaluationsUtilizationSection } from '../../lib/evaluations/evaluations-canonical.types';
import { EvaluationsSectionShell } from './EvaluationsSectionShell';
import { EvaluationsKpiCard } from './EvaluationsKpiCard';
import { canShowMetricValue, readNumericMetricForDisplay } from './evaluations-presentation';

export function FleetUtilizationSection({
  utilization,
}: {
  utilization: EvaluationsAsyncResult<EvaluationsUtilizationSection>;
}) {
  const { t } = useLanguage();
  return (
    <div id="evaluations-section-utilization" className="scroll-mt-24">
    <EvaluationsSectionShell
      titleKey="evaluations.section.utilization"
      async={utilization}
      testId="evaluations-utilization"
    >
      {(u) => {
        const util = readNumericMetricForDisplay(u.utilizationPercent);
        return (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              <EvaluationsKpiCard
                testId="evaluations-utilization-pct"
                label={t('evaluations.kpi.utilization')}
                status={u.status}
                value={
                  util && util.value !== null
                    ? `${util.value.toFixed(1)} %`
                    : t('evaluations.value.unavailable')
                }
              />
              <EvaluationsKpiCard
                testId="evaluations-utilization-eligible"
                label={t('evaluations.kpi.eligibleVehicles')}
                value={u.eligibleVehicles ?? t('evaluations.value.unavailable')}
              />
            </div>
            {/* Scheduled-occupancy semantics stated explicitly (never "actual usage"). */}
            {u.occupancyBasis === 'SCHEDULED' ? (
              <p className="text-[11px] text-[var(--muted-foreground)]">
                {t('evaluations.utilization.scheduled')}
              </p>
            ) : null}
            {/* Blocked/downtime history unavailable when blockedMs is null. */}
            {u.blockedMs === null ? (
              <p className="text-[11px] text-[var(--muted-foreground)]">
                {t('evaluations.utilization.blockedUnknown')}
              </p>
            ) : null}
            {!canShowMetricValue(u.status) && u.reason ? (
              <p className="text-[11px] text-[var(--muted-foreground)]">{u.reason}</p>
            ) : null}
          </div>
        );
      }}
    </EvaluationsSectionShell>
    </div>
  );
}
