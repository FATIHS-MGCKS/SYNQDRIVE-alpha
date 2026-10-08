import type { VehicleRegistryLifecycle } from './vehicle-offboard.types';
import type { VehicleOperationalRowDto } from './types';

export function normalizeRegistryLifecycle(
  value: VehicleOperationalRowDto['registryLifecycle'],
): VehicleRegistryLifecycle | 'UNKNOWN' {
  if (value === 'ACTIVE' || value === 'OFFBOARDED' || value === 'ARCHIVED') return value;
  if (value === null || value === undefined) return 'UNKNOWN';
  return 'UNKNOWN';
}

export function canOffboardRegisteredVehicle(row: {
  vehicleId: string | null;
  organizationId: string | null;
  registryLifecycle?: VehicleOperationalRowDto['registryLifecycle'];
}): boolean {
  if (!row.vehicleId || !row.organizationId) return false;
  return normalizeRegistryLifecycle(row.registryLifecycle) === 'ACTIVE';
}
