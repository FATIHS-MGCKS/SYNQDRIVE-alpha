import { hashProviderDeviceId } from '../device-connection-episode.service';

/**
 * Canonical non-null binding key for physical-state authority rows.
 *
 * Prefer stable data-source link id when present; otherwise fall back to
 * provider device hash (token-scoped for DIMO).
 */
export function buildDeviceConnectionBindingKey(input: {
  provider: string;
  deviceBindingId: string | null | undefined;
  providerDeviceIdHash: string;
}): string {
  const provider = input.provider.trim() || 'DIMO';
  if (input.deviceBindingId) {
    return `${provider}:binding:${input.deviceBindingId}`;
  }
  return `${provider}:device:${input.providerDeviceIdHash}`;
}

export function buildBindingScopeFromToken(input: {
  provider: string;
  tokenId: number;
  deviceBindingId?: string | null;
}): import('./device-connection-physical-state.types').PhysicalStateBindingScope {
  const provider = input.provider.trim() || 'DIMO';
  const providerDeviceIdHash = hashProviderDeviceId(provider, input.tokenId);
  const deviceBindingId = input.deviceBindingId ?? null;
  const bindingKey = buildDeviceConnectionBindingKey({
    provider,
    deviceBindingId,
    providerDeviceIdHash,
  });
  return {
    provider,
    deviceBindingId,
    providerDeviceIdHash,
    bindingKey,
  };
}

export function buildPhysicalStateIdempotencyKey(input: {
  organizationId: string;
  vehicleId: string;
  provider: string;
  bindingKey: string;
  evidenceSource: string;
  evidenceReferenceId: string;
  evidenceObservedAt: Date;
}): string {
  return [
    input.organizationId,
    input.vehicleId,
    input.provider,
    input.bindingKey,
    input.evidenceSource,
    input.evidenceReferenceId,
    input.evidenceObservedAt.toISOString(),
  ].join('|');
}
