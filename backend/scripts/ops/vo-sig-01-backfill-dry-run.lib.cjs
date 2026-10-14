/** CommonJS helpers for VO-SIG-01 backfill dry-run (unit-testable, no DB). */

const SOLD_VEHICLE_DIMO_EXTERNAL_IDS = new Set(['187336', '190497']);

function classifyLinkProviderRepair(link) {
  if (!link.isActive) return 'NO_OP';
  if (link.sourceType === 'HIGH_MOBILITY' && link.provider === 'UNKNOWN') {
    return 'SAFE_AUTOMATIC';
  }
  if (link.sourceType === 'DIMO' && link.provider === 'UNKNOWN') {
    return 'SAFE_AUTOMATIC';
  }
  return 'MANUAL_REVIEW';
}

function classifySoldVehicleRepair(vehicle) {
  if (
    vehicle.registryLifecycle === 'ACTIVE' &&
    vehicle.dimoExternalId &&
    SOLD_VEHICLE_DIMO_EXTERNAL_IDS.has(String(vehicle.dimoExternalId))
  ) {
    return 'MANUAL_REVIEW_OFFBOARD';
  }
  return 'NO_OP';
}

module.exports = {
  classifyLinkProviderRepair,
  classifySoldVehicleRepair,
  SOLD_VEHICLE_DIMO_EXTERNAL_IDS,
};
