import type { ComplianceOperationalVehicle } from '@modules/vehicle-intelligence/service-compliance/service-compliance-operational.signals';
import {
  evaluateServiceComplianceRentalBlocking,
} from '@modules/vehicle-intelligence/service-compliance/service-compliance-rental-blocking.policy';
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

export type ServiceComplianceIngestOutcome = {
  fingerprint: string;
  vehicleId: string;
  eventType: ServiceComplianceNotificationEventType;
  cleared: boolean;
  success: boolean;
};

/** Legacy DashboardInsight backfill conditionCode before P2.1 registry alignment. */
export const LEGACY_SERVICE_OVERDUE_CONDITION_CODE = 'overdue';

function vehicleLabel(vehicle: ComplianceOperationalVehicle): string {
  return vehicle.licensePlate?.trim() || `${vehicle.make} ${vehicle.model}`.trim() || vehicle.id;
}

/**
 * Maps canonical {@link ServiceComplianceEvaluation} to V2 overdue notification sources.
 * Emits ONLY true overdue states — not warning/due-soon windows (those remain BI/task scope).
 */
export function projectServiceComplianceOverdueNotifications(
  vehicle: ComplianceOperationalVehicle,
  evaluation: ServiceComplianceEvaluation,
): ServiceComplianceAdapterSource[] {
  const label = vehicleLabel(vehicle);
  const blocking = evaluateServiceComplianceRentalBlocking(evaluation);
  const sources: ServiceComplianceAdapterSource[] = [];

  if (blocking.tuvOverdue) {
    sources.push({
      eventType: 'TUV_OVERDUE',
      vehicleId: vehicle.id,
      label,
      reason: evaluation.tuvBokraft.tuvRemainingDays != null
        ? `TÜV überfällig seit ${Math.abs(evaluation.tuvBokraft.tuvRemainingDays)} Tagen`
        : 'TÜV überfällig',
      severity: 'critical',
      blocksRental: true,
    });
  }

  if (blocking.bokraftOverdue) {
    sources.push({
      eventType: 'BOKRAFT_OVERDUE',
      vehicleId: vehicle.id,
      label,
      reason: evaluation.tuvBokraft.bokraftRemainingDays != null
        ? `BOKraft überfällig seit ${Math.abs(evaluation.tuvBokraft.bokraftRemainingDays)} Tagen`
        : 'BOKraft überfällig',
      severity: 'critical',
      blocksRental: true,
    });
  }

  if (blocking.serviceOverdue) {
    sources.push({
      eventType: 'SERVICE_OVERDUE',
      vehicleId: vehicle.id,
      label,
      reason: evaluation.nextService.message,
      severity: 'critical',
      blocksRental: blocking.serviceOverdueBlocksRental,
    });
  }

  return sources;
}

/** @deprecated Use {@link projectServiceComplianceOverdueNotifications}. */
export const projectServiceComplianceWarnings = projectServiceComplianceOverdueNotifications;

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

/** Pre-P2.1 DashboardInsight backfill fingerprint (`conditionCode: overdue`). */
export function legacyServiceOverdueFingerprint(
  organizationId: string,
  vehicleId: string,
): string {
  return [
    organizationId,
    'SERVICE_OVERDUE',
    'VEHICLE',
    vehicleId,
    LEGACY_SERVICE_OVERDUE_CONDITION_CODE,
    'v1',
  ].join('|');
}
