import type { VehicleRegistryLifecycle } from '@prisma/client';
import { ProviderLinkState } from './connectivity/domain/connectivity-domain.types';

export type IntegrationConnectivity =
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'none';

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
 * Maps `dimo_vehicles.connection_status` only — no lifecycle, consent, or platform health.
 * Use for technical DIMO mirror diagnostics in Master Admin detail.
 */
export function mapProviderMirrorConnectionStatus(
  dimoVehicleId: string | null,
  mirrorConnectionStatus: string | null | undefined,
): IntegrationConnectivity {
  if (!dimoVehicleId) return 'none';
  const status = (mirrorConnectionStatus ?? '').toUpperCase();
  if (status === 'CONNECTED') return 'connected';
  if (status === 'DISCONNECTED') return 'disconnected';
  return 'error';
}

/**
 * Last observed DIMO mirror with optional platform DIMO health overlay (legacy callers).
 * Prefer {@link mapProviderMirrorConnectionStatus} for mirror-only diagnostics.
 */
export function deriveMirrorIntegrationConnectivity(
  dimoVehicleId: string | null,
  mirrorConnectionStatus: string | null | undefined,
  platformDimoDegraded: boolean,
): IntegrationConnectivity {
  if (!dimoVehicleId) return 'none';
  if (platformDimoDegraded) return 'error';
  return mapProviderMirrorConnectionStatus(dimoVehicleId, mirrorConnectionStatus);
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
 * Operational read-model access context.
 * List endpoints pass lifecycle only. Detail may add REVOKED from fleet connectivity runtime.
 */
export function buildOperationalDimoAccessContext(
  registryLifecycle: VehicleRegistryLifecycle | null | undefined,
  providerLinkState?: string | null,
): SynqDriveDimoAccessContext {
  const access: SynqDriveDimoAccessContext = {
    registryLifecycle: registryLifecycle ?? 'ACTIVE',
  };
  if (
    providerLinkState === ProviderLinkState.REVOKED &&
    !isRegistryLifecycleOperationallyBlocked(access.registryLifecycle)
  ) {
    access.synqDriveDimoAccessRevoked = true;
  }
  return access;
}

/**
 * Effective SynqDrive integration connectivity for operational UI and attention.
 * Lifecycle-blocked vehicles win over platform DIMO degradation (no false auth error).
 */
export function deriveIntegrationConnectivity(
  dimoVehicleId: string | null,
  mirrorConnectionStatus: string | null | undefined,
  platformDimoDegraded: boolean,
  access?: SynqDriveDimoAccessContext,
): IntegrationConnectivity {
  if (!dimoVehicleId) return 'none';

  if (isSynqDriveDimoDataAccessBlocked(access)) {
    if (isRegistryLifecycleOperationallyBlocked(access?.registryLifecycle)) {
      return 'disconnected';
    }
    if (access?.synqDriveDimoAccessRevoked === true) {
      return 'error';
    }
    return 'disconnected';
  }

  if (platformDimoDegraded) return 'error';

  return mapProviderMirrorConnectionStatus(dimoVehicleId, mirrorConnectionStatus);
}
