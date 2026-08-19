import type { VehicleHealth } from '@modules/rental-health/rental-health.types';
import { requireEventTypeDefinition } from '../registry/notification-event-registry';
import type { VehicleReadinessEvaluabilityNotificationAdapterSource } from './notification-adapter.types';

export const VEHICLE_READINESS_EVALUABILITY_EVENT_TYPE =
  'VEHICLE_READINESS_UNEVALUABLE' as const;

export type VehicleReadinessEvaluabilityCondition =
  | 'UNEVALUABLE'
  | 'EVALUABLE'
  | 'NO_ASSERTION';

export function projectVehicleReadinessEvaluabilityCondition(
  health: Pick<VehicleHealth, 'rental_readiness'>,
): VehicleReadinessEvaluabilityCondition {
  const readiness = health.rental_readiness;
  if (readiness === 'unevaluable') return 'UNEVALUABLE';
  if (readiness === 'ready' || readiness === 'not_ready') return 'EVALUABLE';
  return 'NO_ASSERTION';
}

/**
 * Maps canonical RentalHealth evaluability to V2 adapter sources.
 * UNEVALUABLE opens; EVALUABLE (ready or not_ready) resolves when active fingerprint exists.
 * NO_ASSERTION (missing rental_readiness) emits nothing — no fail-open ready fallback.
 */
export function projectVehicleReadinessEvaluability(
  vehicleId: string,
  label: string,
  health: VehicleHealth,
): VehicleReadinessEvaluabilityNotificationAdapterSource[] {
  const condition = projectVehicleReadinessEvaluabilityCondition(health);

  if (condition === 'NO_ASSERTION') {
    return [];
  }

  if (condition === 'UNEVALUABLE') {
    return [
      {
        eventType: VEHICLE_READINESS_EVALUABILITY_EVENT_TYPE,
        vehicleId,
        label,
        condition: 'UNEVALUABLE',
        cleared: false,
        rentalReadiness: 'unevaluable',
        availability: health.availability,
        projectionVersion: health.projection_version,
      },
    ];
  }

  return [
    {
      eventType: VEHICLE_READINESS_EVALUABILITY_EVENT_TYPE,
      vehicleId,
      label,
      condition: 'EVALUABLE',
      cleared: true,
      rentalReadiness: health.rental_readiness as 'ready' | 'not_ready',
      availability: health.availability,
      projectionVersion: health.projection_version,
    },
  ];
}

export function vehicleReadinessEvaluabilitySourceFingerprint(
  organizationId: string,
  source: Pick<VehicleReadinessEvaluabilityNotificationAdapterSource, 'vehicleId'>,
): string {
  const def = requireEventTypeDefinition(VEHICLE_READINESS_EVALUABILITY_EVENT_TYPE);
  return [
    organizationId,
    def.eventType,
    def.defaultEntityType,
    source.vehicleId,
    def.conditionCode,
    `v${def.fingerprintVersion}`,
  ].join('|');
}
