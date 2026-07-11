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
  [InsightType.DRIVING_ASSESSMENT_DEVICE_QUALITY]: NotificationDomain.DRIVING_ANALYSIS,
  [InsightType.BATTERY_CRITICAL]: NotificationDomain.VEHICLE_HEALTH,
  [InsightType.TIRE_CRITICAL]: NotificationDomain.VEHICLE_HEALTH,
  [InsightType.BRAKE_CRITICAL]: NotificationDomain.VEHICLE_HEALTH,
  [InsightType.SERVICE_OVERDUE]: NotificationDomain.VEHICLE_HEALTH,
  [InsightType.PICKUP_OVERDUE]: NotificationDomain.HANDOVERS,
  [InsightType.STATION_SHORTAGE]: NotificationDomain.OPERATIONS,
};

const INSIGHT_CONDITION: Partial<Record<InsightType, string>> = {
  [InsightType.DRIVING_ASSESSMENT_DEVICE_QUALITY]: 'driving_assessment_device_quality',
  [InsightType.BATTERY_CRITICAL]: 'battery_critical',
  [InsightType.TIRE_CRITICAL]: 'tires_critical',
  [InsightType.BRAKE_CRITICAL]: 'brakes_critical',
  [InsightType.SERVICE_OVERDUE]: 'overdue',
  [InsightType.PICKUP_OVERDUE]: 'pickup_overdue',
  [InsightType.STATION_SHORTAGE]: 'shortage',
};

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
  return 'notification.fallback';
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
  const label =
    typeof insight.metrics?.entityLabel === 'string'
      ? insight.metrics.entityLabel
      : entityId;

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
    bodyKey: 'notification.body.insightDefault',
    templateParams: { label, plate: label },
    actionType: mapActionType(insight.actionType),
    actionTarget: {
      type: mapActionType(insight.actionType),
      vehicleId: entityType === NotificationEntityType.VEHICLE ? entityId : undefined,
      bookingId: entityType === NotificationEntityType.BOOKING ? entityId : undefined,
      stationId: entityType === NotificationEntityType.STATION ? entityId : undefined,
    },
    resolutionPolicy: options.resolutionPolicy ?? DEFAULT_STATE_RESOLUTION_POLICY,
    metadata: {
      insightPriority: insight.priority,
      dedupeKey: insight.dedupeKey,
      groupKey: insight.groupKey,
    },
  };
}
