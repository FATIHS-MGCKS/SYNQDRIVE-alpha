import type { VehicleRegistryLifecycle } from '@prisma/client';

/** Canonical registry vehicles eligible for operational telemetry / provider link activation. */
export function isVehicleRegistryOperationalActive(
  registryLifecycle: VehicleRegistryLifecycle | null | undefined,
): boolean {
  return registryLifecycle === 'ACTIVE';
}
