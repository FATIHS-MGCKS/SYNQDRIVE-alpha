import { damageNotificationSeverity, isDamageRentalBlockingImpact } from '@modules/rental-health/damage-rental-health.policy';
import {
  projectVehicleDamageBlockingNotifications,
  vehicleDamageBlockingSourceFingerprint,
  VEHICLE_DAMAGE_BLOCKING_EVENT_TYPE,
} from './vehicle-damage-notification.projector';

describe('vehicle-damage-notification.projector', () => {
  const vehicleId = 'veh-1';
  const label = 'WOB L 7503';

  it('projects one source per blocking damage', () => {
    const sources = projectVehicleDamageBlockingNotifications(vehicleId, label, [
      { id: 'dmg-1', description: 'Front bumper', rentalImpact: 'BLOCK_RENTAL' },
      { id: 'dmg-2', description: 'Windshield', rentalImpact: 'SAFETY_CRITICAL' },
    ]);
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({
      eventType: VEHICLE_DAMAGE_BLOCKING_EVENT_TYPE,
      damageId: 'dmg-1',
      severity: 'warning',
    });
    expect(sources[1]).toMatchObject({
      damageId: 'dmg-2',
      severity: 'critical',
    });
    expect(damageNotificationSeverity('SAFETY_CRITICAL')).toBe('critical');
    expect(isDamageRentalBlockingImpact('POSSIBLE_IMPACT')).toBe(false);
  });

  it('builds per-damage golden fingerprint', () => {
    expect(
      vehicleDamageBlockingSourceFingerprint('org-1', { vehicleId, damageId: 'dmg-1' }),
    ).toBe('org-1|VEHICLE_DAMAGE_BLOCKING|VEHICLE|veh-1|vehicle_damage_blocking:dmg-1|v1');
  });
});
