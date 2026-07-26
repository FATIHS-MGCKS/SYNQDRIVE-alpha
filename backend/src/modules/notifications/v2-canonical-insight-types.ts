import { InsightType } from '@modules/business-insights/insight.types';

/**
 * Dashboard insight types materialized by V2 producers when NOTIFICATIONS_V2 is on.
 * Excluded from dashboard_insights publish to avoid duplicate inbox paths.
 */
export const V2_CANONICAL_INSIGHT_TYPES = new Set<InsightType>([
  InsightType.BATTERY_CRITICAL,
  InsightType.TIRE_CRITICAL,
  InsightType.BRAKE_CRITICAL,
  InsightType.SERVICE_OVERDUE,
  InsightType.TUV_OVERDUE,
  InsightType.BOKRAFT_OVERDUE,
  InsightType.DRIVING_ASSESSMENT_DEVICE_QUALITY,
]);
