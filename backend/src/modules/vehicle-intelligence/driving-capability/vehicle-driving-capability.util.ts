/**
 * Capability key + status normalization for VehicleDrivingCapability writes/reads.
 */

import { DrivingCapabilityStatus } from '@prisma/client';

export function resolveCapabilityKey(
  signalName?: string | null,
  detectorName?: string | null,
): string {
  const signal = signalName?.trim();
  const detector = detectorName?.trim();
  if (signal && detector) {
    throw new Error('Provide either signalName or detectorName, not both');
  }
  const key = signal || detector;
  if (!key) {
    throw new Error('signalName or detectorName is required');
  }
  return key;
}

export function hasProviderError(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const record = metadata as Record<string, unknown>;
  if (record.providerError === true) return true;
  if (typeof record.providerErrorCode === 'string' && record.providerErrorCode.length > 0) {
    return true;
  }
  if (typeof record.providerErrorMessage === 'string' && record.providerErrorMessage.length > 0) {
    return true;
  }
  return false;
}

/**
 * Provider transport/query failures are never classified as UNSUPPORTED.
 * Callers may still pass UNSUPPORTED for genuine capability absence.
 */
export function normalizeCapabilityStatusForWrite(
  requested: DrivingCapabilityStatus,
  metadata?: Record<string, unknown> | null,
): DrivingCapabilityStatus {
  if (!hasProviderError(metadata)) {
    return requested;
  }
  if (requested === DrivingCapabilityStatus.UNSUPPORTED) {
    return DrivingCapabilityStatus.DEGRADED;
  }
  return requested;
}

export function unknownCapability(
  organizationId: string,
  vehicleId: string,
  providerSource: string,
  capabilityKey: string,
  signalName?: string | null,
  detectorName?: string | null,
) {
  return {
    organizationId,
    vehicleId,
    providerSource,
    capabilityKey,
    signalName: signalName ?? null,
    detectorName: detectorName ?? null,
    capabilityStatus: DrivingCapabilityStatus.UNKNOWN,
    nativeEventAvailable: null,
    hardwareProfile: null,
    effectiveCadenceMs: null,
    p95CadenceMs: null,
    coverage: null,
    checkedAt: null,
    resolutionSource: 'none' as const,
    row: null,
  };
}
