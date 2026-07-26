/**
 * Bridge: DashboardInsight producer → Notification candidate contract.
 * DashboardInsight is NOT renamed; this mapper is used at materialization boundaries.
 */
import { InsightEntityScope, InsightSeverity, InsightType } from '@prisma/client';
import type { InsightCandidate } from '../business-insights/insight.types';
import {
  NotificationEntityType,
  NotificationSeverity,
  NotificationSourceType,
} from './notification.enums';
import type { NotificationCandidate, NotificationResolutionPolicy } from './notification.types';
import { DEFAULT_STATE_RESOLUTION_POLICY } from './notification-reopen.policy';
import { buildCandidateFromRegistry } from './registry/notification-event-registry';
import { isRegisteredEventType } from './registry/notification-event-registry.validator';
import type { RegistryCandidateBuildInput } from './registry/notification-event-registry.types';

/** All Prisma InsightType values supported by DashboardInsight backfill. */
export const MIGRATABLE_INSIGHT_TYPES: readonly InsightType[] = Object.values(InsightType);

const BOOKING_INSIGHT_TYPES = new Set<InsightType>([
  InsightType.PICKUP_OVERDUE,
  InsightType.TIGHT_HANDOVER,
  InsightType.RETURN_NEEDS_INSPECTION,
]);

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

function resolveInsightEntityId(insight: InsightCandidate): string | null {
  if (BOOKING_INSIGHT_TYPES.has(insight.type)) {
    const bookingId =
      typeof insight.metrics?.bookingId === 'string' ? insight.metrics.bookingId.trim() : '';
    if (bookingId) return bookingId;
  }
  return insight.entityIds[0] ?? null;
}

function resolveInsightEntityType(insight: InsightCandidate): NotificationEntityType {
  if (BOOKING_INSIGHT_TYPES.has(insight.type)) {
    const bookingId =
      typeof insight.metrics?.bookingId === 'string' ? insight.metrics.bookingId.trim() : '';
    if (bookingId) return NotificationEntityType.BOOKING;
  }
  return mapEntityScope(insight.entityScope);
}

function buildRegistryTemplateParams(
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
  const bookingRef =
    typeof metrics.bookingRef === 'string' && metrics.bookingRef.trim()
      ? metrics.bookingRef.trim()
      : typeof metrics.bookingId === 'string' && metrics.bookingId.trim()
        ? metrics.bookingId.trim()
        : entityId;

  if (entityType === NotificationEntityType.BOOKING) {
    params.bookingRef = bookingRef;
  }

  if (typeof metrics.stationName === 'string') params.stationName = metrics.stationName;
  if (entityType === NotificationEntityType.STATION) params.stationId = entityId;
  if (typeof metrics.available === 'number') params.available = metrics.available;
  if (typeof metrics.totalVehicles === 'number') params.totalVehicles = metrics.totalVehicles;
  if (typeof metrics.idleDays === 'number') params.idleDays = metrics.idleDays;
  if (typeof metrics.lostRevenueEur === 'number') params.lostRevenueEur = metrics.lostRevenueEur;
  if (typeof metrics.complianceType === 'string') params.complianceType = metrics.complianceType;

  if (insight.type === InsightType.STATION_SHORTAGE) {
    params.stationName = (params.stationName as string | undefined) ?? label;
    params.available = (params.available as number | undefined) ?? 0;
    params.totalVehicles = (params.totalVehicles as number | undefined) ?? 0;
  }

  return params;
}

function buildActionTargetContext(
  insight: InsightCandidate,
  entityType: NotificationEntityType,
  entityId: string,
): RegistryCandidateBuildInput['actionTargetContext'] {
  const metricsBookingId =
    typeof insight.metrics?.bookingId === 'string' ? insight.metrics.bookingId : undefined;
  const vehicleId =
    entityType === NotificationEntityType.VEHICLE
      ? entityId
      : insight.entityIds.find((id) => id !== entityId);

  return {
    vehicleId,
    bookingId:
      entityType === NotificationEntityType.BOOKING
        ? entityId
        : metricsBookingId,
    stationId: entityType === NotificationEntityType.STATION ? entityId : undefined,
    module:
      insight.type === InsightType.DRIVING_ASSESSMENT_DEVICE_QUALITY
        ? 'health'
        : undefined,
  };
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
  if (!isRegisteredEventType(insight.type)) {
    return null;
  }

  const entityId = resolveInsightEntityId(insight);
  if (!entityId) {
    return null;
  }

  const recovering =
    insight.type === InsightType.DRIVING_ASSESSMENT_DEVICE_QUALITY
    && insight.metrics?.vehicleStatus === 'RECOVERING';

  const severity = recovering ? NotificationSeverity.SUCCESS : mapInsightSeverity(insight.severity);
  const entityType = resolveInsightEntityType(insight);
  const label = resolveInsightLabel(insight, entityId);

  const candidate = buildCandidateFromRegistry({
    organizationId: options.organizationId,
    eventType: insight.type,
    entityId,
    entityType,
    sourceRef: options.sourceRef,
    occurredAt: options.occurredAt,
    severity,
    sourceType: NotificationSourceType.DASHBOARD_INSIGHT,
    templateParams: buildRegistryTemplateParams(insight, label, entityType, entityId),
    actionTargetContext: buildActionTargetContext(insight, entityType, entityId),
  });

  const withRecoveryTitle =
    recovering
      ? {
          ...candidate,
          titleKey: 'notification.title.drivingAssessmentRecovering',
        }
      : candidate;

  return {
    ...withRecoveryTitle,
    expiresAt: insight.expiresAt,
    resolutionPolicy: options.resolutionPolicy ?? DEFAULT_STATE_RESOLUTION_POLICY,
    metadata: {
      insightPriority: insight.priority,
      dedupeKey: insight.dedupeKey,
      groupKey: insight.groupKey,
    },
  };
}
