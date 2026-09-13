import { hashProviderDeviceId } from '../device-connection-episode.service';
import type { PhysicalStateBindingScope } from './device-connection-physical-state.types';

/**
 * Canonical provider string for physical-state authority (case-insensitive input).
 */
export function normalizeConnectivityProvider(provider: string): string {
  return (provider.trim() || 'DIMO').toUpperCase();
}

/**
 * Canonical non-null binding key for physical-state authority rows.
 *
 * INVARIANT (VDC-DEC-012): one logical provider device maps to exactly one
 * bindingKey derived from provider + providerDeviceIdHash (token-scoped for DIMO).
 *
 * deviceBindingId is enrichment metadata only — it MUST NOT create a second
 * authority row when it becomes available later on webhook vs snapshot paths.
 *
 * Device replacement / token change produces a new providerDeviceIdHash and
 * therefore a distinct authority row (semantically required).
 */
export function buildDeviceConnectionBindingKey(input: {
  provider: string;
  providerDeviceIdHash: string;
}): string {
  const provider = normalizeConnectivityProvider(input.provider);
  return `${provider}:device:${input.providerDeviceIdHash}`;
}

export function buildBindingScopeFromToken(input: {
  provider: string;
  tokenId: number;
  deviceBindingId?: string | null;
}): PhysicalStateBindingScope {
  const provider = normalizeConnectivityProvider(input.provider);
  const providerDeviceIdHash = hashProviderDeviceId(provider, input.tokenId);
  const deviceBindingId = input.deviceBindingId ?? null;
  const bindingKey = buildDeviceConnectionBindingKey({
    provider,
    providerDeviceIdHash,
  });
  return {
    provider,
    deviceBindingId,
    providerDeviceIdHash,
    bindingKey,
  };
}

/**
 * Advisory-lock key scoped to one logical physical binding authority row.
 */
export function buildPhysicalStateBindingLockKey(input: {
  organizationId: string;
  vehicleId: string;
  provider: string;
  bindingKey: string;
}): string {
  return [
    input.organizationId,
    input.vehicleId,
    normalizeConnectivityProvider(input.provider),
    input.bindingKey,
  ].join('|');
}

/**
 * Canonical physical-state action outbox idempotency key (VDC-DEC-013 §12).
 */
export function buildPhysicalStateActionOutboxIdempotencyKey(input: {
  organizationId: string;
  vehicleId: string;
  bindingKey: string;
  stateVersion: number;
  episodeAction: string;
  alertAction: string;
}): string {
  return [
    'physical',
    input.organizationId,
    input.vehicleId,
    input.bindingKey,
    String(input.stateVersion),
    input.episodeAction,
    input.alertAction,
  ].join(':');
}

export function buildPhysicalStateIdempotencyKey(input: {
  organizationId: string;
  vehicleId: string;
  provider: string;
  bindingKey: string;
  evidenceSource: string;
  evidenceReferenceId: string;
  evidenceObservedAt: Date;
  candidateState: string;
}): string {
  return [
    input.organizationId,
    input.vehicleId,
    normalizeConnectivityProvider(input.provider),
    input.bindingKey,
    input.evidenceSource,
    input.evidenceReferenceId,
    input.evidenceObservedAt.toISOString(),
    input.candidateState,
  ].join('|');
}
