/**
 * Bridge: DashboardInsight producer → Notification candidate contract.
 * DashboardInsight is NOT renamed; this mapper is used at materialization boundaries.
 */
import { InsightEntityScope, InsightSeverity, InsightType } from '@prisma/client';
import type { InsightCandidate } from '../business-insights/insight.types';
import {
  NotificationActionType,
  NotificationEntityType,
  NotificationSeverity,
  NotificationSourceType,
} from './notification.enums';
import type { NotificationCandidate, NotificationResolutionPolicy } from './notification.types';
import { DEFAULT_STATE_RESOLUTION_POLICY } from './notification-reopen.policy';
import { fingerprintPartsFromInsightDedupeKey } from './notification-fingerprint.factory';
import {
  buildCandidateFromRegistry,
  getEventTypeDefinition,
} from './registry/notification-event-registry';

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
  if (typeof metrics.complianceType === 'string') params.complianceType = metrics.complianceType;
  if (typeof metrics.bookingRef === 'string') params.bookingRef = metrics.bookingRef;

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
  if (!entityId || !getEventTypeDefinition(insight.type)) {
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

  const candidate = buildCandidateFromRegistry({
    organizationId: options.organizationId,
    eventType: insight.type,
    entityId,
    entityType,
    sourceRef: options.sourceRef,
    occurredAt: options.occurredAt,
    severity,
    templateParams: buildInsightTemplateParams(insight, label, entityType, entityId),
    sourceType: NotificationSourceType.DASHBOARD_INSIGHT,
    actionTargetContext: {
      vehicleId: entityType === NotificationEntityType.VEHICLE ? entityId : undefined,
      bookingId:
        entityType === NotificationEntityType.BOOKING
          ? entityId
          : metricsBookingId,
      stationId: entityType === NotificationEntityType.STATION ? entityId : undefined,
    },
    metadata: {
      insightPriority: insight.priority,
      dedupeKey: insight.dedupeKey,
      groupKey: insight.groupKey,
    },
  });

  const actionType = mapActionType(insight.actionType);
  candidate.actionType = actionType;
  candidate.actionTarget = {
    ...candidate.actionTarget,
    type: actionType,
    vehicleId:
      entityType === NotificationEntityType.VEHICLE
        ? entityId
        : candidate.actionTarget.vehicleId,
    bookingId:
      entityType === NotificationEntityType.BOOKING
        ? entityId
        : metricsBookingId ?? candidate.actionTarget.bookingId,
    stationId:
      entityType === NotificationEntityType.STATION
        ? entityId
        : candidate.actionTarget.stationId,
  };
  candidate.resolutionPolicy = options.resolutionPolicy ?? DEFAULT_STATE_RESOLUTION_POLICY;
  candidate.expiresAt = insight.expiresAt;

  return candidate;
}
