/**
 * E6B canonical Auswertungen page composer — the single user-facing Evaluations
 * route (`financial-insights`). It consumes the E6A canonical data layer only:
 * ONE shared E4 `/insights/summary` request drives Executive / Strengths & Weaknesses
 * / Utilization / Costs; the always-on E3 finance bundle drives Finance & Receivables
 * (fixed MTD). No legacy dashboard-insights / misuse-cases / raw-entity recomputation.
 * E6C adds the detailed Data Quality panel (one E5 request loaded with the page) and
 * the lazy Driver Influence surface (a separate driver-analysis request issued only
 * after an explicit user reveal).
 */
import { useMemo, useState } from 'react';
import { PageHeader } from '../../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import { readPersistedDashboardStationId } from '../../lib/fleet-station-filter';
import {
  useEvaluationsInsightsSummary,
  useEvaluationsQuality,
} from '../../hooks/useEvaluationsCanonicalAnalytics';
import { useEvaluationsFinanceBundle } from '../../hooks/useEvaluationsFinanceBundle';
import type { EvaluationsPeriodType, EvaluationsAnalyticsRequest } from '../../lib/evaluations/evaluations-request';
import { deriveSectionAsync } from './evaluations-section-derive';
import { EvaluationsHeaderControls } from './EvaluationsHeaderControls';
import { ExecutiveSummarySection } from './ExecutiveSummarySection';
import { StrengthWeaknessSection } from './StrengthWeaknessSection';
import { FinanceReceivablesSection } from './FinanceReceivablesSection';
import { FleetUtilizationSection } from './FleetUtilizationSection';
import { CostDowntimeSection } from './CostDowntimeSection';
import { DataQualityPanel } from './DataQualityPanel';
import { DriverInfluenceSection } from './DriverInfluenceSection';

export function EvaluationsPage() {
  const { t } = useLanguage();
  const { orgId } = useRentalOrg();
  const [periodType, setPeriodType] = useState<EvaluationsPeriodType>('MTD');

  // Station scope from the existing persisted dashboard filter (server-authoritative;
  // no client-side reconstruction). Analytics period governs E4/E5 only.
  const stationId = readPersistedDashboardStationId();
  const stationIds = useMemo(() => (stationId ? [stationId] : undefined), [stationId]);
  const req: EvaluationsAnalyticsRequest = useMemo(
    () => ({ periodType, stationIds }),
    [periodType, stationIds],
  );

  const organizationId = orgId || null;
  const summary = useEvaluationsInsightsSummary(organizationId, req);
  // Finance ignores the analytics period (fixed MTD); station scope still applies.
  const finance = useEvaluationsFinanceBundle(organizationId, { stationIds });
  // E6C: one E5 quality request, loaded with the page (same org/period/station scope).
  // Driver Influence is intentionally NOT requested here — it is lazy (see below).
  const quality = useEvaluationsQuality(organizationId, req);

  const executive = summary;
  const strengths = useMemo(() => deriveSectionAsync(summary, (s) => s.sections.strengths), [summary]);
  const weaknesses = useMemo(() => deriveSectionAsync(summary, (s) => s.sections.weaknesses), [summary]);
  const utilization = useMemo(() => deriveSectionAsync(summary, (s) => s.sections.utilization), [summary]);
  const costModel = useMemo(() => deriveSectionAsync(summary, (s) => s.sections.costModel), [summary]);

  return (
    <div className="flex flex-col gap-4" data-testid="evaluations-page">
      <PageHeader title={t('evaluations.title')} description={t('evaluations.subtitle')} />
      <EvaluationsHeaderControls
        periodType={periodType}
        onPeriodChange={setPeriodType}
        stationScopeLabel={stationId ?? t('evaluations.station.all')}
      />
      <ExecutiveSummarySection summary={executive} />
      <StrengthWeaknessSection strengths={strengths} weaknesses={weaknesses} />
      <FinanceReceivablesSection finance={finance} />
      <FleetUtilizationSection utilization={utilization} />
      <CostDowntimeSection costModel={costModel} />
      <DriverInfluenceSection organizationId={organizationId} req={req} />
      <DataQualityPanel quality={quality} />
    </div>
  );
}
