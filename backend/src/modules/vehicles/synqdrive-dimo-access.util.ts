import type { VehicleRegistryLifecycle } from '@prisma/client';
import type { IntegrationConnectivity } from './vehicle-attention.util';

export function isRegistryLifecycleOperationallyBlocked(
  registryLifecycle: VehicleRegistryLifecycle | string | null | undefined,
): boolean {
  return registryLifecycle === 'OFFBOARDED' || registryLifecycle === 'ARCHIVED';
}

export interface SynqDriveDimoAccessContext {
  registryLifecycle?: VehicleRegistryLifecycle | null;
  /** When true, consent or binding blocks SynqDrive DIMO data access (ACTIVE registry only). */
  synqDriveDimoAccessRevoked?: boolean;
}

/**
 * Last observed DIMO mirror `connection_status` mapped for UI/diagnostics labels.
 * Does not reflect registry lifecycle or SynqDrive grant chain.
 */
export function deriveMirrorIntegrationConnectivity(
  dimoVehicleId: string | null,
  mirrorConnectionStatus: string | null | undefined,
  platformDimoDegraded: boolean,
): IntegrationConnectivity {
  if (!dimoVehicleId) return 'none';
  if (platformDimoDegraded) return 'error';
  const status = (mirrorConnectionStatus ?? '').toUpperCase();
  if (status === 'CONNECTED') return 'connected';
  if (status === 'DISCONNECTED') return 'disconnected';
  return 'error';
}

export function isSynqDriveDimoDataAccessBlocked(
  access: SynqDriveDimoAccessContext | null | undefined,
): boolean {
  if (!access) return false;
  if (isRegistryLifecycleOperationallyBlocked(access.registryLifecycle)) {
    return true;
  }
  return access.synqDriveDimoAccessRevoked === true;
}

/**
 * Effective SynqDrive integration connectivity for operational UI and attention.
 * Preserves mirror truth via {@link deriveMirrorIntegrationConnectivity} when access is active.
 */
export function deriveIntegrationConnectivity(
  dimoVehicleId: string | null,
  mirrorConnectionStatus: string | null | undefined,
  platformDimoDegraded: boolean,
  access?: SynqDriveDimoAccessContext,
): IntegrationConnectivity {
  if (!dimoVehicleId) return 'none';
  if (platformDimoDegraded) return 'error';
  if (isSynqDriveDimoDataAccessBlocked(access)) {
    if (access?.synqDriveDimoAccessRevoked === true) {
      return 'error';
    }
    return 'disconnected';
  }
  return deriveMirrorIntegrationConnectivity(
    dimoVehicleId,
    mirrorConnectionStatus,
    platformDimoDegraded,
  );
}
