import { InsightSeverity, InsightType } from '@prisma/client';
import {
  buildComplianceInsightCandidates,
  type ComplianceOperationalVehicle,
} from '@modules/vehicle-intelligence/service-compliance/service-compliance-operational.signals';
import type { ServiceComplianceEvaluation } from '@modules/vehicle-intelligence/service-compliance/service-compliance.types';
import { requireEventTypeDefinition } from '../registry/notification-event-registry';
import type { ServiceComplianceAdapterSource } from './notification-adapter.types';

export const SERVICE_COMPLIANCE_NOTIFICATION_EVENT_TYPES = [
  'TUV_OVERDUE',
  'BOKRAFT_OVERDUE',
  'SERVICE_OVERDUE',
] as const;

export type ServiceComplianceNotificationEventType =
  (typeof SERVICE_COMPLIANCE_NOTIFICATION_EVENT_TYPES)[number];

const COMPLIANCE_INSIGHT_TYPES: InsightType[] = [
  InsightType.TUV_OVERDUE,
  InsightType.BOKRAFT_OVERDUE,
  InsightType.SERVICE_OVERDUE,
];

function insightTypeToEventType(type: InsightType): ServiceComplianceNotificationEventType | null {
  if (type === InsightType.TUV_OVERDUE) return 'TUV_OVERDUE';
  if (type === InsightType.BOKRAFT_OVERDUE) return 'BOKRAFT_OVERDUE';
  if (type === InsightType.SERVICE_OVERDUE) return 'SERVICE_OVERDUE';
  return null;
}

function insightSeverityToAdapterSeverity(
  severity: InsightSeverity,
): 'warning' | 'critical' | null {
  if (severity === InsightSeverity.CRITICAL) return 'critical';
  if (severity === InsightSeverity.WARNING) return 'warning';
  return null;
}

function blocksRentalFromInsight(
  type: InsightType,
  severity: InsightSeverity,
  metrics?: Record<string, unknown>,
): boolean {
  if (severity !== InsightSeverity.CRITICAL) return false;
  if (type === InsightType.TUV_OVERDUE || type === InsightType.BOKRAFT_OVERDUE) return true;
  if (type === InsightType.SERVICE_OVERDUE) {
    return metrics?.suggestionOnly !== true;
  }
  return false;
}

/**
 * Maps canonical {@link ServiceComplianceEvaluation} to V2 notification adapter sources.
 * Reuses {@link buildComplianceInsightCandidates} — no parallel compliance policy.
 */
export function projectServiceComplianceWarnings(
  vehicle: ComplianceOperationalVehicle,
  evaluation: ServiceComplianceEvaluation,
  now = new Date(),
): ServiceComplianceAdapterSource[] {
  const candidates = buildComplianceInsightCandidates(vehicle, evaluation, {
    now,
    enabledTypes: COMPLIANCE_INSIGHT_TYPES,
  });

  const sources: ServiceComplianceAdapterSource[] = [];

  for (const insight of candidates) {
    const eventType = insightTypeToEventType(insight.type);
    if (!eventType) continue;

    const severity = insightSeverityToAdapterSeverity(insight.severity);
    if (!severity) continue;

    sources.push({
      eventType,
      vehicleId: vehicle.id,
      label: vehicle.licensePlate?.trim() || `${vehicle.make} ${vehicle.model}`.trim() || vehicle.id,
      reason: insight.message,
      severity,
      blocksRental: blocksRentalFromInsight(insight.type, insight.severity, insight.metrics),
    });
  }

  return sources;
}

/** Canonical fingerprint for sweep/dedupe — mirrors registry conditionCode rules. */
export function serviceComplianceSourceFingerprint(
  organizationId: string,
  source: Pick<ServiceComplianceAdapterSource, 'eventType' | 'vehicleId'>,
): string {
  const def = requireEventTypeDefinition(source.eventType);
  return [
    organizationId,
    def.eventType,
    def.defaultEntityType,
    source.vehicleId,
    def.conditionCode,
    `v${def.fingerprintVersion}`,
  ].join('|');
}
