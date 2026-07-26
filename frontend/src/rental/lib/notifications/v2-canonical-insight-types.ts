import type { InsightType } from '../../DashboardInsightsContext';

/**
 * Dashboard insight types materialized by Notification Engine V2 producers.
 * Must stay aligned with backend `v2-canonical-insight-types.ts`.
 */
export const V2_CANONICAL_INSIGHT_TYPES = new Set<InsightType>([
  'BATTERY_CRITICAL',
  'TIRE_CRITICAL',
  'BRAKE_CRITICAL',
  'SERVICE_OVERDUE',
  'TUV_OVERDUE',
  'BOKRAFT_OVERDUE',
  'DRIVING_ASSESSMENT_DEVICE_QUALITY',
  'PICKUP_OVERDUE',
  'TIGHT_HANDOVER',
  'RETURN_NEEDS_INSPECTION',
  'STATION_SHORTAGE',
  'LOW_UTILIZATION',
]);

export function isV2CanonicalInsightType(type: string): boolean {
  return V2_CANONICAL_INSIGHT_TYPES.has(type as InsightType);
}
