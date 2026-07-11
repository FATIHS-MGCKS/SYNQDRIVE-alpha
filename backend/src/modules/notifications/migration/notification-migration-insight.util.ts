import { DashboardInsight, InsightEntityScope } from '@prisma/client';
import type { InsightCandidate } from '@modules/business-insights/insight.types';
import { notificationCandidateFromInsight } from '../insight-candidate.mapper';
import { fingerprintFromCandidate } from '../notification-candidate.validator';
import { buildNotificationFingerprint } from '../notification-fingerprint.factory';
import { NotificationEntityType } from '../notification.enums';

const MIGRATABLE_INSIGHT_TYPES = new Set([
  'DRIVING_ASSESSMENT_DEVICE_QUALITY',
  'BATTERY_CRITICAL',
  'TIRE_CRITICAL',
  'BRAKE_CRITICAL',
  'SERVICE_OVERDUE',
  'PICKUP_OVERDUE',
  'STATION_SHORTAGE',
]);

export function dashboardInsightToCandidate(row: DashboardInsight): InsightCandidate {
  const entityIds = Array.isArray(row.entityIds)
    ? (row.entityIds as string[])
    : row.entityIds
      ? [String(row.entityIds)]
      : [];

  return {
    type: row.type,
    severity: row.severity,
    priority: row.priority,
    title: row.title,
    message: row.message,
    actionLabel: row.actionLabel ?? undefined,
    actionType: row.actionType ?? undefined,
    entityScope: row.entityScope,
    entityIds,
    timeContext: (row.timeContext as Record<string, string>) ?? undefined,
    metrics: (row.metrics as Record<string, unknown>) ?? undefined,
    reasons: Array.isArray(row.reasons) ? (row.reasons as string[]) : [],
    confidence: row.confidence,
    dedupeKey: row.dedupeKey,
    groupKey: row.groupKey ?? undefined,
    expiresAt: row.expiresAt ?? undefined,
  };
}

export function isMigratableInsightType(type: string): boolean {
  return MIGRATABLE_INSIGHT_TYPES.has(type);
}

export function mapInsightEntityScope(scope: InsightEntityScope): NotificationEntityType {
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

export function resolveInsightFingerprint(
  organizationId: string,
  row: DashboardInsight,
): { fingerprint: string; candidate: ReturnType<typeof notificationCandidateFromInsight> } | null {
  if (!isMigratableInsightType(row.type)) {
    return null;
  }

  const insightCandidate = dashboardInsightToCandidate(row);
  if (insightCandidate.entityIds.length === 0) {
    return null;
  }

  const candidate = notificationCandidateFromInsight(insightCandidate, {
    organizationId,
    sourceRef: row.id,
    occurredAt: row.updatedAt,
  });
  if (!candidate) return null;

  const { canonical } = fingerprintFromCandidate(candidate);
  return { fingerprint: canonical, candidate };
}

export function fingerprintFromDedupeKeyOnly(
  organizationId: string,
  dedupeKey: string,
  entityScope: InsightEntityScope,
): string | null {
  try {
    const parts = buildNotificationFingerprint({
      organizationId,
      eventType: dedupeKey.slice(0, dedupeKey.indexOf(':')).toUpperCase(),
      entityType: mapInsightEntityScope(entityScope),
      entityId: dedupeKey.slice(dedupeKey.indexOf(':') + 1),
      conditionCode: dedupeKey.slice(0, dedupeKey.indexOf(':')),
      scopeVersion: 1,
    });
    return parts.canonical;
  } catch {
    return null;
  }
}
