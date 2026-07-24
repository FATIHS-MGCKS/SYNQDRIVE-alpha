import type { DashboardInsight, InsightType } from '../DashboardInsightsContext';
import {
  isVisibleAnalyticsInsight,
  matchesStationInsightFilter,
  resolveInsightAnalyticsCategory,
} from '@synq/evaluations-insights/insights-analytics';

export type InsightDisplayCategory =
  | 'BUSINESS_RISK'
  | 'REVENUE_LEAKAGE'
  | 'FINANCIAL'
  | 'MISUSE_ABUSE'
  | 'OPERATIONAL_RECOMMENDATION';

/** Hide raw technical health alerts from the operator cockpit. */
export function isVisibleOnInsightsPage(insight: DashboardInsight): boolean {
  return isVisibleAnalyticsInsight(insight);
}

export function resolveInsightCategory(insight: DashboardInsight): InsightDisplayCategory {
  const cat = resolveInsightAnalyticsCategory(insight);
  if (cat === 'BUSINESS_RISK' || cat === 'REVENUE_LEAKAGE') return cat;
  return 'OPERATIONAL_RECOMMENDATION';
}

export function insightRecommendation(insight: DashboardInsight): string {
  const m = insight.metrics as Record<string, unknown> | null | undefined;
  if (typeof m?.recommendation === 'string' && m.recommendation.trim()) {
    return m.recommendation.trim();
  }
  if (insight.actionLabel?.trim()) return insight.actionLabel.trim();
  switch (insight.type as InsightType) {
    case 'PICKUP_OVERDUE':
      return 'Kunde kontaktieren und Übergabe nachhalten.';
    case 'RETURN_NEEDS_INSPECTION':
      return 'Rückgabe genauer prüfen und Protokoll abschließen.';
    case 'TIGHT_HANDOVER':
      return 'Übergabezeit planen und Puffer sichern.';
    case 'LOW_UTILIZATION':
      return 'Verfügbarkeit, Preis oder Station prüfen.';
    case 'SERVICE_BEFORE_BOOKING':
      return 'Fahrzeug vor Pickup freigeben oder Buchung anpassen.';
    default:
      return 'Vorgang prüfen und nächsten Schritt festlegen.';
  }
}

export function financialImpactEur(insight: DashboardInsight): number | null {
  const m = insight.metrics as Record<string, unknown> | null | undefined;
  if (!m) return null;
  if (typeof m.financialImpactEur === 'number') return m.financialImpactEur;
  if (typeof m.financialImpactCents === 'number') return Math.round(m.financialImpactCents / 100);
  if (typeof m.financialExposureMinor === 'number') return Math.round(m.financialExposureMinor / 100);
  return null;
}

export function matchesStationIdFilter(
  insight: DashboardInsight,
  stationId: string | null,
  vehicleStationById: Map<string, string | null | undefined>,
): boolean {
  if (!stationId) return true;
  const stationVehicleIds = new Set<string>();
  for (const [vehicleId, sid] of vehicleStationById) {
    if (sid === stationId) stationVehicleIds.add(vehicleId);
  }
  return matchesStationInsightFilter(insight, stationId, stationVehicleIds);
}

export function partitionInsights(insights: DashboardInsight[]) {
  const visible = insights.filter(isVisibleOnInsightsPage);
  const businessRisks: DashboardInsight[] = [];
  const revenueLeakage: DashboardInsight[] = [];
  const recommended: DashboardInsight[] = [];

  for (const i of visible) {
    const cat = resolveInsightCategory(i);
    if (cat === 'BUSINESS_RISK') businessRisks.push(i);
    else if (cat === 'REVENUE_LEAKAGE') revenueLeakage.push(i);
    if (i.severity === 'CRITICAL' || i.severity === 'WARNING') {
      recommended.push(i);
    }
  }

  recommended.sort((a, b) => b.priority - a.priority);

  return { businessRisks, revenueLeakage, recommended };
}
