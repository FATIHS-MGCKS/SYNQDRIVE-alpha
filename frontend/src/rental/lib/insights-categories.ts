import type { DashboardInsight, InsightType } from '../DashboardInsightsContext';

export type InsightDisplayCategory =
  | 'BUSINESS_RISK'
  | 'REVENUE_LEAKAGE'
  | 'FINANCIAL'
  | 'MISUSE_ABUSE'
  | 'OPERATIONAL_RECOMMENDATION';

const RAW_HEALTH_TYPES = new Set<InsightType>([
  'BATTERY_CRITICAL',
  'TIRE_CRITICAL',
  'BRAKE_CRITICAL',
]);

const BUSINESS_RISK_TYPES = new Set<InsightType>([
  'TIGHT_HANDOVER',
  'RETURN_NEEDS_INSPECTION',
  'STATION_SHORTAGE',
  'SERVICE_BEFORE_BOOKING',
  'SERVICE_WINDOW',
  'PICKUP_OVERDUE',
  'SERVICE_OVERDUE',
  'TUV_OVERDUE',
  'BOKRAFT_OVERDUE',
]);

const REVENUE_LEAKAGE_TYPES = new Set<InsightType>(['LOW_UTILIZATION']);

/** Hide raw technical health alerts from the operator cockpit. */
export function isVisibleOnInsightsPage(insight: DashboardInsight): boolean {
  if (!RAW_HEALTH_TYPES.has(insight.type)) return true;
  const m = insight.metrics as Record<string, unknown> | null | undefined;
  const tc = insight.timeContext;
  return !!(m?.bookingId || tc?.bookingId);
}

export function resolveInsightCategory(insight: DashboardInsight): InsightDisplayCategory {
  const m = insight.metrics as Record<string, unknown> | null | undefined;
  const cat = m?.category;
  if (cat === 'BUSINESS_RISK' || cat === 'REVENUE_LEAKAGE') return cat;
  if (REVENUE_LEAKAGE_TYPES.has(insight.type)) return 'REVENUE_LEAKAGE';
  if (BUSINESS_RISK_TYPES.has(insight.type)) return 'BUSINESS_RISK';
  return 'OPERATIONAL_RECOMMENDATION';
}

export function insightRecommendation(insight: DashboardInsight): string {
  const m = insight.metrics as Record<string, unknown> | null | undefined;
  if (typeof m?.recommendation === 'string' && m.recommendation.trim()) {
    return m.recommendation.trim();
  }
  if (insight.actionLabel?.trim()) return insight.actionLabel.trim();
  switch (insight.type) {
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

// E3.5: `financialImpactEur()` was removed. It inferred a monetary unit from a
// value's magnitude (`cents > 1000 ? /100 : as-is`) and mixed `financialImpactCents`
// with `lostRevenueEur` — unsafe unit guessing with no explicit currency. Insight
// financial-impact amounts are not a canonical Finance metric and are no longer
// presented as money. Canonical Finance Money is served exclusively by the E3
// backend and rendered via the shared status-aware formatter.

export function matchesStationIdFilter(
  insight: DashboardInsight,
  stationId: string | null,
  vehicleStationById: Map<string, string | null | undefined>,
): boolean {
  if (!stationId) return true;
  const ids = insight.entityIds ?? [];
  if (ids.length === 0) return true;
  const m = insight.metrics as Record<string, unknown> | null | undefined;
  const vehicleId =
    (typeof m?.affectedVehicleId === 'string' ? m.affectedVehicleId : null) ??
    ids.find((id) => vehicleStationById.has(id));
  if (!vehicleId) return true;
  const vs = vehicleStationById.get(vehicleId);
  return vs === stationId;
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
