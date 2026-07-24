/**
 * Pure insight analytics helpers — shared between backend summary/list and frontend display.
 */
import type {
  InsightAnalyticsCategory,
  InsightAnalyticsFilters,
  InsightAnalyticsRow,
  InsightAnalyticsSeverity,
  InsightAnalyticsSortField,
  InsightAnalyticsSortOrder,
  InsightAnalyticsSummaryCounts,
} from './insights-analytics.contract';
import { computeInsightEntityCountSummary } from './insight-entity-references';

const RAW_HEALTH_TYPES = new Set<string>(['BATTERY_CRITICAL', 'TIRE_CRITICAL', 'BRAKE_CRITICAL']);

const BUSINESS_RISK_TYPES = new Set<string>([
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

const REVENUE_LEAKAGE_TYPES = new Set<string>(['LOW_UTILIZATION']);

export function isVisibleAnalyticsInsight(insight: InsightAnalyticsRow): boolean {
  if (!RAW_HEALTH_TYPES.has(insight.type)) return true;
  const m = insight.metrics;
  const tc = insight.timeContext;
  return !!(m?.bookingId || tc?.bookingId);
}

export function resolveInsightAnalyticsCategory(insight: InsightAnalyticsRow): InsightAnalyticsCategory {
  const m = insight.metrics;
  const cat = m?.category;
  if (cat === 'BUSINESS_RISK' || cat === 'REVENUE_LEAKAGE') return cat;
  if (REVENUE_LEAKAGE_TYPES.has(insight.type)) return 'REVENUE_LEAKAGE';
  if (BUSINESS_RISK_TYPES.has(insight.type)) return 'BUSINESS_RISK';
  return 'OPERATIONAL_RECOMMENDATION';
}

export function matchesStationInsightFilter(
  insight: InsightAnalyticsRow,
  stationId: string | null | undefined,
  stationVehicleIds: ReadonlySet<string> | null | undefined,
): boolean {
  if (!stationId) return true;
  if (!stationVehicleIds || stationVehicleIds.size === 0) return false;

  const refs = insight.entityReferences ?? [];
  if (refs.length > 0) {
    const stationMatch = refs.some(
      (r) =>
        r.stationId === stationId ||
        (r.entityType === 'STATION' && r.entityId === stationId) ||
        (r.entityType === 'VEHICLE' && stationVehicleIds.has(r.entityId)),
    );
    if (stationMatch) return true;
  }

  const ids = insight.entityIds ?? [];
  if (ids.length === 0) return true;
  const m = insight.metrics;
  const vehicleId =
    (typeof m?.affectedVehicleId === 'string' ? m.affectedVehicleId : null) ??
    ids.find((id) => stationVehicleIds.has(id));
  if (!vehicleId) return true;
  return stationVehicleIds.has(vehicleId);
}

export function matchesInsightAnalyticsFilters(
  insight: InsightAnalyticsRow,
  filters: InsightAnalyticsFilters,
): boolean {
  if (!isVisibleAnalyticsInsight(insight)) return false;
  if (!matchesStationInsightFilter(insight, filters.stationId, filters.stationVehicleIds)) {
    return false;
  }
  if (filters.severity && insight.severity !== filters.severity) return false;
  if (filters.category && resolveInsightAnalyticsCategory(insight) !== filters.category) return false;
  return true;
}

export function compareInsightsForSort(
  a: InsightAnalyticsRow,
  b: InsightAnalyticsRow,
  sortBy: InsightAnalyticsSortField = 'priority',
  sortOrder: InsightAnalyticsSortOrder = 'desc',
): number {
  const dir = sortOrder === 'asc' ? 1 : -1;
  if (sortBy === 'createdAt') {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (aTime !== bTime) return (aTime - bTime) * dir;
  } else {
    if (a.priority !== b.priority) return (a.priority - b.priority) * dir;
  }
  return a.id.localeCompare(b.id) * dir;
}

export function sortInsights(
  insights: InsightAnalyticsRow[],
  sortBy: InsightAnalyticsSortField = 'priority',
  sortOrder: InsightAnalyticsSortOrder = 'desc',
): InsightAnalyticsRow[] {
  return [...insights].sort((a, b) => compareInsightsForSort(a, b, sortBy, sortOrder));
}

export function computeInsightAnalyticsSummaryCounts(
  insights: InsightAnalyticsRow[],
  filters: InsightAnalyticsFilters = {},
  organizationId = 'unknown',
): InsightAnalyticsSummaryCounts {
  const visible = insights.filter((i) => matchesInsightAnalyticsFilters(i, filters));

  let businessRisks = 0;
  let revenueLeakage = 0;
  let criticalInsights = 0;
  let recommended = 0;
  const bySeverity = { critical: 0, warning: 0, opportunity: 0, info: 0 };

  for (const insight of visible) {
    const cat = resolveInsightAnalyticsCategory(insight);
    if (cat === 'BUSINESS_RISK') businessRisks += 1;
    if (cat === 'REVENUE_LEAKAGE') revenueLeakage += 1;
    if (insight.severity === 'CRITICAL') criticalInsights += 1;
    if (insight.severity === 'CRITICAL' || insight.severity === 'WARNING') {
      recommended += 1;
    }
    switch (insight.severity) {
      case 'CRITICAL':
        bySeverity.critical += 1;
        break;
      case 'WARNING':
        bySeverity.warning += 1;
        break;
      case 'OPPORTUNITY':
        bySeverity.opportunity += 1;
        break;
      default:
        bySeverity.info += 1;
        break;
    }
  }

  const entities = computeInsightEntityCountSummary(
    visible,
    organizationId,
    () => true,
  );

  return {
    totalVisible: visible.length,
    businessRisks,
    revenueLeakage,
    criticalInsights,
    criticalBookings: entities.criticalBookings,
    criticalBusinessRisks: entities.criticalBookings,
    recommended,
    bySeverity,
    entities,
  };
}

export function estimateInsightFinancialExposureMinor(
  insights: InsightAnalyticsRow[],
  filters: InsightAnalyticsFilters = {},
  defaultCurrency = 'EUR',
): { amountMinor: number; currency: string } {
  let totalMinor = 0;
  for (const insight of insights) {
    if (!matchesInsightAnalyticsFilters(insight, filters)) continue;
    const cat = resolveInsightAnalyticsCategory(insight);
    if (cat !== 'BUSINESS_RISK' && cat !== 'REVENUE_LEAKAGE') continue;
    const m = insight.metrics;
    if (!m) continue;
    const minor =
      typeof m.financialExposureMinor === 'number'
        ? m.financialExposureMinor
        : typeof m.financialImpactCents === 'number'
          ? m.financialImpactCents
          : typeof m.financialImpactEur === 'number'
            ? Math.round(m.financialImpactEur * 100)
            : 0;
    totalMinor += minor;
  }
  return { amountMinor: totalMinor, currency: defaultCurrency };
}
