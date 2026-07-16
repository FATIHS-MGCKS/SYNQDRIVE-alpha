import type { VehicleDtcEvent } from '@prisma/client';
import { normalizeDtcSeverityBand } from '@modules/vehicle-intelligence/dtc/dtc-severity.util';
import type { HealthState, VehicleHealth } from '@modules/rental-health/rental-health.types';
import { requireEventTypeDefinition } from '../registry/notification-event-registry';
import type { VehicleHealthAdapterSource } from './notification-adapter.types';

export const VEHICLE_HEALTH_NOTIFICATION_EVENT_TYPES = [
  'ACTIVE_DTC',
  'BATTERY_CRITICAL',
  'TIRE_CRITICAL',
  'BRAKE_CRITICAL',
] as const;

export type VehicleHealthNotificationEventType =
  (typeof VEHICLE_HEALTH_NOTIFICATION_EVENT_TYPES)[number];

const MODULE_EVENT_MAP = {
  battery: 'BATTERY_CRITICAL',
  brakes: 'BRAKE_CRITICAL',
} as const satisfies Record<string, VehicleHealthNotificationEventType>;

function shouldEmitHealthState(state: HealthState): boolean {
  return state === 'warning' || state === 'critical';
}

function healthStateToSeverity(state: HealthState): 'warning' | 'critical' {
  return state === 'critical' ? 'critical' : 'warning';
}

/**
 * Maps Rental Health V1 aggregate + active DTC rows to V2 notification adapter sources.
 * DTCs are emitted per code; battery/brakes are one notification per vehicle per type.
 * Tire alerts are emitted per open {@link TireHealthAlert} row (see business-insights sync).
 */
export function projectVehicleHealthWarnings(
  vehicleId: string,
  label: string,
  health: VehicleHealth,
  activeDtcs: Pick<VehicleDtcEvent, 'dtcCode' | 'description' | 'severity'>[],
): VehicleHealthAdapterSource[] {
  const sources: VehicleHealthAdapterSource[] = [];

  for (const [moduleKey, eventType] of Object.entries(MODULE_EVENT_MAP)) {
    const mod = health.modules[moduleKey as keyof typeof MODULE_EVENT_MAP];
    if (!mod || !shouldEmitHealthState(mod.state)) continue;
    sources.push({
      eventType,
      vehicleId,
      label,
      reason: mod.reason,
      severity: healthStateToSeverity(mod.state),
    });
  }

  for (const dtc of activeDtcs) {
    const band = normalizeDtcSeverityBand(dtc.severity);
    sources.push({
      eventType: 'ACTIVE_DTC',
      vehicleId,
      label,
      code: dtc.dtcCode,
      reason: dtc.description ?? undefined,
      severity: band === 'critical' ? 'critical' : 'warning',
    });
  }

  return sources;
}

/** Canonical fingerprint for sweep/dedupe — mirrors registry conditionCode + variant rules. */
export function vehicleHealthSourceFingerprint(
  organizationId: string,
  source: Pick<VehicleHealthAdapterSource, 'eventType' | 'vehicleId' | 'code'>,
): string {
  const def = requireEventTypeDefinition(source.eventType);
  const conditionCode = source.code?.trim()
    ? `${def.conditionCode}:${source.code.trim()}`
    : def.conditionCode;
  return [
    organizationId,
    def.eventType,
    def.defaultEntityType,
    source.vehicleId,
    conditionCode,
    `v${def.fingerprintVersion}`,
  ].join('|');
}
