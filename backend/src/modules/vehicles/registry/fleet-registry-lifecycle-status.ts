import type { VehicleRegistryLifecycle } from '@prisma/client';
import type {
  FleetDataQualityState,
  FleetOperationalStatusToken,
  FleetVehicleOperationalStateDto,
} from '../operational/fleet-operational-state.util';

export type RegistryLifecycleFleetBlock =
  | { kind: 'OFFBOARDED'; displayStatus: 'Offboarded' }
  | { kind: 'ARCHIVED'; displayStatus: 'Archived' };

export function resolveRegistryLifecycleFleetBlock(
  registryLifecycle: VehicleRegistryLifecycle | null | undefined,
): RegistryLifecycleFleetBlock | null {
  if (registryLifecycle === 'OFFBOARDED') {
    return { kind: 'OFFBOARDED', displayStatus: 'Offboarded' };
  }
  if (registryLifecycle === 'ARCHIVED') {
    return { kind: 'ARCHIVED', displayStatus: 'Archived' };
  }
  return null;
}

export function buildRegistryLifecycleFleetOperationalState(input: {
  block: RegistryLifecycleFleetBlock;
  derivedAt?: Date;
}): FleetVehicleOperationalStateDto {
  const derivedAt = (input.derivedAt ?? new Date()).toISOString();
  const reasonCode =
    input.block.kind === 'OFFBOARDED'
      ? 'registry_lifecycle_offboarded'
      : 'registry_lifecycle_archived';

  return {
    status: 'UNKNOWN',
    reason: reasonCode,
    source: 'vehicles.service:registry-lifecycle-guard',
    derivedAt,
    dataQualityState: 'UNAVAILABLE',
    dataQualityReasons: [reasonCode],
    isReliable: false,
  };
}

/** Registry lifecycle blocks operational rental availability regardless of Vehicle.status. */
export function isRegistryLifecycleOperationallyBlocked(
  registryLifecycle: VehicleRegistryLifecycle | null | undefined,
): boolean {
  return registryLifecycle === 'OFFBOARDED' || registryLifecycle === 'ARCHIVED';
}

export function registryLifecycleOperationalToken(
  _registryLifecycle: VehicleRegistryLifecycle,
): FleetOperationalStatusToken {
  return 'UNKNOWN';
}

export function registryLifecycleDataQualityState(): FleetDataQualityState {
  return 'UNAVAILABLE';
}
