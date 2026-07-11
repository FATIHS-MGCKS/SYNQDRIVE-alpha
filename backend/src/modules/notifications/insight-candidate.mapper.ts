/**
 * Bridge: DashboardInsight producer → Notification candidate contract.
 * DashboardInsight is NOT renamed; this mapper is used at materialization boundaries.
 */
import { InsightEntityScope, InsightSeverity, InsightType } from '@prisma/client';
import type { InsightCandidate } from '../business-insights/insight.types';
import {
  NotificationActionType,
  NotificationDomain,
  NotificationEntityType,
  NotificationEventKind,
  NotificationSeverity,
  NotificationSourceType,
} from './notification.enums';
import type { NotificationCandidate, NotificationResolutionPolicy } from './notification.types';
import { DEFAULT_STATE_RESOLUTION_POLICY } from './notification-reopen.policy';
import { fingerprintPartsFromInsightDedupeKey } from './notification-fingerprint.factory';

const INSIGHT_DOMAIN: Partial<Record<InsightType, NotificationDomain>> = {
  [InsightType.TIGHT_HANDOVER]: NotificationDomain.HANDOVERS,
  [InsightType.RETURN_NEEDS_INSPECTION]: NotificationDomain.HANDOVERS,
  [InsightType.STATION_SHORTAGE]: NotificationDomain.OPERATIONS,
  [InsightType.LOW_UTILIZATION]: NotificationDomain.OPERATIONS,
  [InsightType.SERVICE_WINDOW]: NotificationDomain.VEHICLE_HEALTH,
  [InsightType.SERVICE_BEFORE_BOOKING]: NotificationDomain.HANDOVERS,
  [InsightType.BATTERY_CRITICAL]: NotificationDomain.VEHICLE_HEALTH,
  [InsightType.TIRE_CRITICAL]: NotificationDomain.VEHICLE_HEALTH,
  [InsightType.BRAKE_CRITICAL]: NotificationDomain.VEHICLE_HEALTH,
  [InsightType.SERVICE_OVERDUE]: NotificationDomain.VEHICLE_HEALTH,
  [InsightType.PICKUP_OVERDUE]: NotificationDomain.HANDOVERS,
  [InsightType.TUV_OVERDUE]: NotificationDomain.VEHICLE_HEALTH,
  [InsightType.BOKRAFT_OVERDUE]: NotificationDomain.VEHICLE_HEALTH,
  [InsightType.HM_SERVICE_NO_TRACKING]: NotificationDomain.VEHICLE_HEALTH,
  [InsightType.DRIVING_ASSESSMENT_DEVICE_QUALITY]: NotificationDomain.DRIVING_ANALYSIS,
};

const INSIGHT_CONDITION: Partial<Record<InsightType, string>> = {
  [InsightType.TIGHT_HANDOVER]: 'tight_handover',
  [InsightType.RETURN_NEEDS_INSPECTION]: 'return_inspection',
  [InsightType.STATION_SHORTAGE]: 'shortage',
  [InsightType.LOW_UTILIZATION]: 'low_utilization',
  [InsightType.SERVICE_WINDOW]: 'service_window',
  [InsightType.SERVICE_BEFORE_BOOKING]: 'service_before_booking',
  [InsightType.BATTERY_CRITICAL]: 'battery_critical',
  [InsightType.TIRE_CRITICAL]: 'tires_critical',
  [InsightType.BRAKE_CRITICAL]: 'brakes_critical',
  [InsightType.SERVICE_OVERDUE]: 'overdue',
  [InsightType.PICKUP_OVERDUE]: 'pickup_overdue',
  [InsightType.TUV_OVERDUE]: 'tuv_overdue',
  [InsightType.BOKRAFT_OVERDUE]: 'bokraft_overdue',
  [InsightType.HM_SERVICE_NO_TRACKING]: 'hm_no_tracking',
  [InsightType.DRIVING_ASSESSMENT_DEVICE_QUALITY]: 'driving_assessment_device_quality',
};

/** All Prisma InsightType values supported by DashboardInsight backfill. */
export const MIGRATABLE_INSIGHT_TYPES: readonly InsightType[] = Object.values(InsightType);

function mapInsightSeverity(severity: InsightSeverity): NotificationSeverity {
  switch (severity) {
    case InsightSeverity.CRITICAL:
      return NotificationSeverity.CRITICAL;
    case InsightSeverity.WARNING:
      return NotificationSeverity.WARNING;
    case InsightSeverity.INFO:
      return NotificationSeverity.INFO;
    case InsightSeverity.OPPORTUNITY:
      return NotificationSeverity.INFO;
    default:
      return NotificationSeverity.INFO;
  }
}

function mapEntityScope(scope: InsightEntityScope): NotificationEntityType {
  switch (scope) {
    case InsightEntityScope.VEHICLE:
      return NotificationEntityType.VEHICLE;
    case InsightEntityScope.STATION:
      return NotificationEntityType.STATION;
    case InsightEntityScope.FLEET:
      return NotificationEntityType.FLEET;
    default:
      return NotificationEntityType.ORGANIZATION;
  }
}

function mapActionType(actionType?: string): NotificationActionType {
  switch (actionType) {
    case 'OPEN_VEHICLE':
    case 'navigate_vehicle':
      return NotificationActionType.OPEN_VEHICLE;
    case 'navigate_station':
      return NotificationActionType.OPEN_STATION;
    case 'navigate_booking':
    case 'navigate_bookings':
      return NotificationActionType.OPEN_BOOKING;
    default:
      return NotificationActionType.OPEN_VEHICLE;
  }
}

function titleKeyForInsight(type: InsightType, recovering: boolean): string {
  if (type === InsightType.DRIVING_ASSESSMENT_DEVICE_QUALITY) {
    return recovering
      ? 'notification.title.drivingAssessmentRecovering'
      : 'notification.title.drivingAssessmentDegraded';
  }
  if (type === InsightType.SERVICE_OVERDUE) return 'notification.title.serviceOverdue';
  if (type === InsightType.PICKUP_OVERDUE) return 'notification.title.pickupOverdue';
  if (type === InsightType.STATION_SHORTAGE) return 'notification.title.stationShortage';
  if (type === InsightType.BATTERY_CRITICAL) return 'notification.title.batteryCritical';
  if (type === InsightType.TIRE_CRITICAL) return 'notification.title.tireCritical';
  if (type === InsightType.BRAKE_CRITICAL) return 'notification.title.brakeCritical';
  if (type === InsightType.LOW_UTILIZATION) return 'notification.title.lowUtilization';
  if (type === InsightType.HM_SERVICE_NO_TRACKING) return 'notification.title.hmServiceNoTracking';
  if (type === InsightType.RETURN_NEEDS_INSPECTION) return 'notification.title.returnInspection';
  if (type === InsightType.TUV_OVERDUE || type === InsightType.BOKRAFT_OVERDUE) {
    return 'notification.title.complianceExpired';
  }
  return 'notification.fallback';
}

function bodyKeyForInsight(type: InsightType): string {
  if (type === InsightType.LOW_UTILIZATION) return 'notification.body.lowUtilization';
  if (type === InsightType.HM_SERVICE_NO_TRACKING) return 'notification.body.hmServiceNoTracking';
  if (type === InsightType.STATION_SHORTAGE) return 'notification.body.stationShortage';
  return 'notification.body.insightDefault';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveInsightLabel(insight: InsightCandidate, entityId: string): string {
  if (typeof insight.metrics?.entityLabel === 'string' && insight.metrics.entityLabel.trim()) {
    return insight.metrics.entityLabel.trim();
  }
  if (typeof insight.metrics?.vehicleLicense === 'string' && insight.metrics.vehicleLicense.trim()) {
    return insight.metrics.vehicleLicense.trim();
  }
  if (typeof insight.metrics?.stationName === 'string' && insight.metrics.stationName.trim()) {
    return insight.metrics.stationName.trim();
  }

  const message = insight.message?.trim();
  if (message) {
    if (message.includes(':')) {
      const head = message.split(':')[0]?.trim();
      if (head && !UUID_RE.test(head)) return head;
    }
    const idleMatch = message.match(/^(.+?)\s+idle\b/i);
    if (idleMatch?.[1]?.trim()) return idleMatch[1].trim();
  }

  if (insight.title?.trim() && !UUID_RE.test(insight.title.trim())) {
    return insight.title.trim();
  }

  return entityId;
}

function buildInsightTemplateParams(
  insight: InsightCandidate,
  label: string,
  entityType: NotificationEntityType,
  entityId: string,
): Record<string, string | number | boolean | null> {
  const params: Record<string, string | number | boolean | null> = {
    label,
    plate: label,
  };

  const metrics = insight.metrics ?? {};
  if (typeof metrics.stationName === 'string') params.stationName = metrics.stationName;
  if (entityType === NotificationEntityType.STATION) params.stationId = entityId;
  if (typeof metrics.available === 'number') params.available = metrics.available;
  if (typeof metrics.totalVehicles === 'number') params.totalVehicles = metrics.totalVehicles;
  if (typeof metrics.idleDays === 'number') params.idleDays = metrics.idleDays;
  if (typeof metrics.lostRevenueEur === 'number') params.lostRevenueEur = metrics.lostRevenueEur;

  return params;
}

export interface InsightToNotificationCandidateOptions {
  organizationId: string;
  sourceRef: string;
  occurredAt: Date;
  resolutionPolicy?: NotificationResolutionPolicy;
}

export function notificationCandidateFromInsight(
  insight: InsightCandidate,
  options: InsightToNotificationCandidateOptions,
): NotificationCandidate | null {
  const entityId = insight.entityIds[0];
  const conditionCode = INSIGHT_CONDITION[insight.type];
  const domain = INSIGHT_DOMAIN[insight.type];
  if (!entityId || !conditionCode || !domain) {
    return null;
  }

  const recovering =
    insight.type === InsightType.DRIVING_ASSESSMENT_DEVICE_QUALITY
    && insight.metrics?.vehicleStatus === 'RECOVERING';

  const severity = recovering ? NotificationSeverity.SUCCESS : mapInsightSeverity(insight.severity);
  const entityType = mapEntityScope(insight.entityScope);
  const label = resolveInsightLabel(insight, entityId);

  const metricsBookingId =
    typeof insight.metrics?.bookingId === 'string' ? insight.metrics.bookingId : undefined;

  fingerprintPartsFromInsightDedupeKey(options.organizationId, insight.dedupeKey, entityType);

  return {
    organizationId: options.organizationId,
    eventType: insight.type,
    eventKind: NotificationEventKind.STATE,
    domain,
    severity,
    entityType,
    entityId,
    conditionCode,
    scopeVersion: 1,
    sourceType: NotificationSourceType.DASHBOARD_INSIGHT,
    sourceRef: options.sourceRef,
    occurredAt: options.occurredAt,
    titleKey: titleKeyForInsight(insight.type, recovering),
    bodyKey: bodyKeyForInsight(insight.type),
    templateParams: buildInsightTemplateParams(insight, label, entityType, entityId),
    actionType: mapActionType(insight.actionType),
    actionTarget: {
      type: mapActionType(insight.actionType),
      vehicleId: entityType === NotificationEntityType.VEHICLE ? entityId : undefined,
      bookingId:
        entityType === NotificationEntityType.BOOKING
          ? entityId
          : metricsBookingId,
      stationId: entityType === NotificationEntityType.STATION ? entityId : undefined,
    },
    expiresAt: insight.expiresAt,
    resolutionPolicy: options.resolutionPolicy ?? DEFAULT_STATE_RESOLUTION_POLICY,
    metadata: {
      insightPriority: insight.priority,
      dedupeKey: insight.dedupeKey,
      groupKey: insight.groupKey,
    },
  };
}
