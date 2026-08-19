import type { VehicleHealth } from '@modules/rental-health/rental-health.types';
import { requireEventTypeDefinition } from '../registry/notification-event-registry';
import type { VehicleReadinessNotificationAdapterSource } from './notification-adapter.types';

export const VEHICLE_READINESS_AGGREGATE_EVENT_TYPE = 'VEHICLE_NOT_READY' as const;

export const LEGACY_AGGREGATE_EVENT_TYPES = [
  'BLOCKED_VEHICLE',
  'MAINTENANCE_REQUIRED',
] as const;

export type VehicleReadinessAggregateCondition = 'NOT_READY' | 'READY' | 'UNEVALUABLE';

export function projectVehicleReadinessAggregateCondition(
  health: Pick<VehicleHealth, 'rental_readiness'>,
): VehicleReadinessAggregateCondition {
  if (health.rental_readiness === 'not_ready') return 'NOT_READY';
  if (health.rental_readiness === 'ready') return 'READY';
  return 'UNEVALUABLE';
}

/**
 * Maps canonical RentalHealth aggregate readiness to V2 adapter sources.
 * Emits only NOT_READY (open/reopen) and READY (resolve) — UNEVALUABLE emits nothing.
 */
export function projectVehicleReadinessAggregate(
  vehicleId: string,
  label: string,
  health: VehicleHealth,
): VehicleReadinessNotificationAdapterSource[] {
  const condition = projectVehicleReadinessAggregateCondition(health);
  if (condition === 'UNEVALUABLE') return [];

  if (condition === 'NOT_READY') {
    return [
      {
        eventType: VEHICLE_READINESS_AGGREGATE_EVENT_TYPE,
        vehicleId,
        label,
        condition: 'NOT_READY',
        cleared: false,
        blockingReasonCount: health.blocking_reasons?.length ?? 0,
        rentalReadiness: health.rental_readiness ?? 'not_ready',
        projectionVersion: health.projection_version,
      },
    ];
  }

  return [
    {
      eventType: VEHICLE_READINESS_AGGREGATE_EVENT_TYPE,
      vehicleId,
      label,
      condition: 'READY',
      cleared: true,
      blockingReasonCount: 0,
      rentalReadiness: 'ready',
      projectionVersion: health.projection_version,
    },
  ];
}

export type VehicleReadinessIngestOutcome = {
  vehicleId: string;
  fingerprint: string;
  condition: 'NOT_READY' | 'READY';
  success: boolean;
};

export function vehicleReadinessSourceFingerprint(
  organizationId: string,
  source: Pick<VehicleReadinessNotificationAdapterSource, 'vehicleId'>,
): string {
  const def = requireEventTypeDefinition(VEHICLE_READINESS_AGGREGATE_EVENT_TYPE);
  return [
    organizationId,
    def.eventType,
    def.defaultEntityType,
    source.vehicleId,
    def.conditionCode,
    `v${def.fingerprintVersion}`,
  ].join('|');
}
