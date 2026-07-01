import type { DashboardInsight, InsightType } from '../DashboardInsightsContext';

export type InsightDisplayCategory =
  | 'BUSINESS_RISK'
  | 'REVENUE_LEAKAGE'
  | 'FINANCIAL'
  | 'MISUSE_ABUSE'
  | 'OPERATIONAL_RECOMMENDATION';

const KNOWN_CATEGORIES = new Set<InsightDisplayCategory>([
  'BUSINESS_RISK',
  'REVENUE_LEAKAGE',
  'FINANCIAL',
  'MISUSE_ABUSE',
  'OPERATIONAL_RECOMMENDATION',
]);

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
  if (typeof cat === 'string' && KNOWN_CATEGORIES.has(cat as InsightDisplayCategory)) {
    return cat as InsightDisplayCategory;
  }
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

export function financialImpactEur(insight: DashboardInsight): number | null {
  const m = insight.metrics as Record<string, unknown> | null | undefined;
  if (!m) return null;

  // Booking-scoped revenue risk from health gate — always stored in cents.
  if (typeof m.financialImpactCents === 'number' && Number.isFinite(m.financialImpactCents)) {
    return Math.round(m.financialImpactCents / 100);
  }

  // Utilization / leakage detectors publish lost revenue already in euros.
  if (typeof m.lostRevenueEur === 'number' && Number.isFinite(m.lostRevenueEur)) {
    return Math.round(m.lostRevenueEur);
  }

  return null;
}

function stationIdFromInsightContext(insight: DashboardInsight): string | null {
  const m = insight.metrics as Record<string, unknown> | null | undefined;
  const tc = insight.timeContext;
  const candidates = [
    m?.stationId,
    tc?.pickupStationId,
    tc?.returnStationId,
    tc?.stationId,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c;
  }
  return null;
}

function resolveVehicleId(
  insight: DashboardInsight,
  vehiclesAtStation: Set<string>,
): string | null {
  const ids = insight.entityIds ?? [];
  return ids.find((id) => vehiclesAtStation.has(id)) ?? null;
}

/**
 * Station filter for dashboard insights.
 * `vehiclesAtStation` must contain vehicle IDs assigned to the active station
 * (stationId/homeStationId/currentStationId), built from the fleet context.
 */
export function matchesStationIdFilter(
  insight: DashboardInsight,
  stationId: string | null,
  vehiclesAtStation: Set<string>,
): boolean {
  if (!stationId) return true;

  if (insight.entityScope === 'FLEET') return true;

  if (insight.entityScope === 'STATION') {
    const ids = insight.entityIds ?? [];
    if (ids.length === 0) return false;
    return ids.includes(stationId);
  }

  const m = insight.metrics as Record<string, unknown> | null | undefined;
  if (typeof m?.affectedVehicleId === 'string' && m.affectedVehicleId) {
    return vehiclesAtStation.has(m.affectedVehicleId);
  }

  const vehicleId = resolveVehicleId(insight, vehiclesAtStation);
  if (vehicleId) return true;

  const contextualStationId = stationIdFromInsightContext(insight);
  if (contextualStationId) {
    return contextualStationId === stationId;
  }

  const ids = insight.entityIds ?? [];
  if (ids.length === 0) return false;

  return false;
}

export function partitionInsights(insights: DashboardInsight[]) {
  const visible = insights.filter(isVisibleOnInsightsPage);
  const businessRisks: DashboardInsight[] = [];
  const revenueLeakage: DashboardInsight[] = [];
  const recommended: DashboardInsight[] = [];

  for (const i of visible) {
    const cat = resolveInsightCategory(i);
    if (cat === 'BUSINESS_RISK') businessRisks.push(i);
    else if (cat === 'REVENUE_LEAKAGE' || cat === 'FINANCIAL') revenueLeakage.push(i);

    if (cat === 'OPERATIONAL_RECOMMENDATION') {
      recommended.push(i);
    } else if (cat !== 'MISUSE_ABUSE' && (i.severity === 'CRITICAL' || i.severity === 'WARNING')) {
      recommended.push(i);
    }
  }

  recommended.sort((a, b) => b.priority - a.priority);

  return { businessRisks, revenueLeakage, recommended };
}
