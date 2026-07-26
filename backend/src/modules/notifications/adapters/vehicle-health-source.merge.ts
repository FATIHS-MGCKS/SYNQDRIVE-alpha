import type { VehicleHealthAdapterSource } from './notification-adapter.types';

/**
 * Prefer structured alert rows over rental-health module aggregate for tires/brakes
 * to avoid duplicate notifications per vehicle.
 */
export function mergeVehicleHealthNotificationSources(
  rentalSources: VehicleHealthAdapterSource[],
  tireAlertSources: VehicleHealthAdapterSource[],
  brakeAlertSources: VehicleHealthAdapterSource[],
): VehicleHealthAdapterSource[] {
  const hasTireAlerts = tireAlertSources.length > 0;
  const hasBrakeAlerts = brakeAlertSources.length > 0;

  const filtered = rentalSources.filter((source) => {
    if (hasTireAlerts && source.eventType === 'TIRE_CRITICAL') return false;
    if (hasBrakeAlerts && source.eventType === 'BRAKE_CRITICAL') return false;
    return true;
  });

  return [...filtered, ...tireAlertSources, ...brakeAlertSources];
}
