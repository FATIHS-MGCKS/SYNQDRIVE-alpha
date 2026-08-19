import type { DamageRentalImpact } from '@prisma/client';
import {
  damageNotificationSeverity,
  isDamageRentalBlockingImpact,
  type RentalBlockingDamageRow,
} from '@modules/rental-health/damage-rental-health.policy';
import { requireEventTypeDefinition } from '../registry/notification-event-registry';
import type { VehicleDamageNotificationAdapterSource } from './notification-adapter.types';

export const VEHICLE_DAMAGE_BLOCKING_EVENT_TYPE = 'VEHICLE_DAMAGE_BLOCKING' as const;

export function projectVehicleDamageBlockingNotifications(
  vehicleId: string,
  label: string,
  damages: RentalBlockingDamageRow[],
): VehicleDamageNotificationAdapterSource[] {
  return damages
    .filter((row) => isDamageRentalBlockingImpact(row.rentalImpact))
    .map((row) => ({
      eventType: VEHICLE_DAMAGE_BLOCKING_EVENT_TYPE,
      vehicleId,
      label,
      damageId: row.id,
      rentalImpact: row.rentalImpact as DamageRentalImpact,
      reason: row.description ?? undefined,
      severity: damageNotificationSeverity(row.rentalImpact),
      cleared: false,
    }));
}

export function vehicleDamageBlockingSourceFingerprint(
  organizationId: string,
  source: Pick<VehicleDamageNotificationAdapterSource, 'vehicleId' | 'damageId'>,
): string {
  const def = requireEventTypeDefinition(VEHICLE_DAMAGE_BLOCKING_EVENT_TYPE);
  return [
    organizationId,
    def.eventType,
    def.defaultEntityType,
    source.vehicleId,
    `${def.conditionCode}:${source.damageId}`,
    `v${def.fingerprintVersion}`,
  ].join('|');
}
