import { POLICY_RESOLVER_SOURCE_SYSTEM } from '../policy-resolver/policy-resolver.constants';

/** Known provider platform keys — DIMO and High Mobility are separate ledgers. */
export const PROVIDER_GRANT_PLATFORM = {
  DIMO: 'DIMO',
  HIGH_MOBILITY: 'HIGH_MOBILITY',
} as const;

export type ProviderGrantPlatform =
  (typeof PROVIDER_GRANT_PLATFORM)[keyof typeof PROVIDER_GRANT_PLATFORM];

export const PROVIDER_GRANT_CONSOLIDATION_REASON = {
  CONSISTENT_ACTIVE: 'PROVIDER_GRANT_CONSISTENT_ACTIVE',
  PROVIDER_GRANT_MISSING: 'PROVIDER_GRANT_MISSING',
  PROVIDER_GRANT_REVOKED: 'PROVIDER_GRANT_REVOKED',
  PROVIDER_GRANT_EXPIRED: 'PROVIDER_GRANT_EXPIRED',
  PROVIDER_GRANT_PENDING: 'PROVIDER_GRANT_PENDING',
  PROVIDER_GRANT_POLICY_CONTRADICTION: 'PROVIDER_GRANT_POLICY_CONTRADICTION',
  POLICY_REVOKED_PROVIDER_ACTIVE: 'POLICY_REVOKED_PROVIDER_ACTIVE',
  PROVIDER_REVOKED_POLICY_ACTIVE: 'PROVIDER_REVOKED_POLICY_ACTIVE',
  VEHICLE_SCOPE_MISMATCH: 'VEHICLE_SCOPE_MISMATCH',
  FOREIGN_VEHICLE: 'FOREIGN_VEHICLE',
  TOKEN_NOT_LEGAL_BASIS: 'TOKEN_NOT_LEGAL_BASIS',
} as const;

export type ProviderGrantConsolidationReason =
  (typeof PROVIDER_GRANT_CONSOLIDATION_REASON)[keyof typeof PROVIDER_GRANT_CONSOLIDATION_REASON];

/** Map resolver sourceSystem to provider platform key — never use worker service identity. */
export function resolveProviderKeyFromSourceSystem(
  sourceSystem: string,
  processorId?: string | null,
): ProviderGrantPlatform | null {
  const normalized = sourceSystem.trim().toUpperCase();
  if (normalized === POLICY_RESOLVER_SOURCE_SYSTEM.DIMO) {
    return PROVIDER_GRANT_PLATFORM.DIMO;
  }
  if (normalized === POLICY_RESOLVER_SOURCE_SYSTEM.HIGH_MOBILITY) {
    return PROVIDER_GRANT_PLATFORM.HIGH_MOBILITY;
  }
  const pid = processorId?.trim().toUpperCase();
  if (pid === PROVIDER_GRANT_PLATFORM.DIMO || pid === PROVIDER_GRANT_PLATFORM.HIGH_MOBILITY) {
    return pid as ProviderGrantPlatform;
  }
  return null;
}

export function buildWebhookIdempotencyKey(
  provider: string,
  vehicleId: string,
  eventReference: string,
): string {
  return `${provider.trim().toUpperCase()}:${vehicleId}:${eventReference.trim()}`;
}
