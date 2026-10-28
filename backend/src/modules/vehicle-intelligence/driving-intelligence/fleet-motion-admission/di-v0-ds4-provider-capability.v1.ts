/**
 * Minimal DS4 provider technical capability contract (evidence supply path — not trip quality).
 *
 * Canonical telemetry identity: `vehicle-intelligence/telemetry-source-family.ts` on `DimoVehicle.rawJson`.
 * S4 persists `source_family` via `resolveDiV0SourceFamily` (same resolver). Tesla Model 3 software
 * integration in production uses `syntheticDevice` without `aftermarketDevice` → `API_SYNTHETIC`.
 * R1 hardware uses `aftermarketDevice.serial` prefix `R1-` → `RUPTELA_R1`.
 */

import type { DiV0S4SourceFamily } from '../s4a-foundation/di-v0-s4a-contract';
import type { TelemetrySourceFamily } from '../../telemetry-source-family';

export const DS4_PROVIDER_CAPABILITY_CONTRACT_VERSION_V1 = 'DS4_PROVIDER_CAPABILITY_CONTRACT_V1' as const;

export type Ds4ProviderCapabilityStateV1 = 'SUPPORTED' | 'UNKNOWN' | 'UNSUPPORTED';

export type Ds4ProviderCapabilityReasonV1 =
  | 'S4_SOURCE_FAMILY_SUPPORTED'
  | 'TELEMETRY_SOURCE_FAMILY_SUPPORTED'
  | 'TELEMETRY_SOURCE_FAMILY_UNKNOWN'
  | 'TELEMETRY_SOURCE_FAMILY_UNSUPPORTED'
  | 'S4_SOURCE_FAMILY_UNKNOWN'
  | 'S4_SOURCE_FAMILY_UNSUPPORTED';

export type Ds4ProviderCapabilityResolutionV1 = {
  contractVersion: typeof DS4_PROVIDER_CAPABILITY_CONTRACT_VERSION_V1;
  state: Ds4ProviderCapabilityStateV1;
  reason: Ds4ProviderCapabilityReasonV1;
};

const S4_SUPPORTED: ReadonlySet<DiV0S4SourceFamily> = new Set(['RUPTELA_R1', 'API_SYNTHETIC']);

const TELEMETRY_SUPPORTED: ReadonlySet<TelemetrySourceFamily> = new Set(['RUPTELA_R1', 'API_SYNTHETIC']);

export function resolveDs4ProviderCapabilityFromS4SourceFamilyV1(
  sourceFamily: DiV0S4SourceFamily,
): Ds4ProviderCapabilityResolutionV1 {
  if (S4_SUPPORTED.has(sourceFamily)) {
    return {
      contractVersion: DS4_PROVIDER_CAPABILITY_CONTRACT_VERSION_V1,
      state: 'SUPPORTED',
      reason: 'S4_SOURCE_FAMILY_SUPPORTED',
    };
  }
  if (sourceFamily === 'UNKNOWN') {
    return {
      contractVersion: DS4_PROVIDER_CAPABILITY_CONTRACT_VERSION_V1,
      state: 'UNKNOWN',
      reason: 'S4_SOURCE_FAMILY_UNKNOWN',
    };
  }
  return {
    contractVersion: DS4_PROVIDER_CAPABILITY_CONTRACT_VERSION_V1,
    state: 'UNSUPPORTED',
    reason: 'S4_SOURCE_FAMILY_UNSUPPORTED',
  };
}

export function resolveDs4ProviderCapabilityFromTelemetrySourceFamilyV1(
  sourceFamily: TelemetrySourceFamily,
): Ds4ProviderCapabilityResolutionV1 {
  if (TELEMETRY_SUPPORTED.has(sourceFamily)) {
    return {
      contractVersion: DS4_PROVIDER_CAPABILITY_CONTRACT_VERSION_V1,
      state: 'SUPPORTED',
      reason: 'TELEMETRY_SOURCE_FAMILY_SUPPORTED',
    };
  }
  if (sourceFamily === 'UNKNOWN') {
    return {
      contractVersion: DS4_PROVIDER_CAPABILITY_CONTRACT_VERSION_V1,
      state: 'UNKNOWN',
      reason: 'TELEMETRY_SOURCE_FAMILY_UNKNOWN',
    };
  }
  return {
    contractVersion: DS4_PROVIDER_CAPABILITY_CONTRACT_VERSION_V1,
    state: 'UNSUPPORTED',
    reason: 'TELEMETRY_SOURCE_FAMILY_UNSUPPORTED',
  };
}

/** Unknown capability must not yield a rated DS4 assessment outcome. */
export function isDs4ProviderCapabilityRateableV1(state: Ds4ProviderCapabilityStateV1): boolean {
  return state === 'SUPPORTED';
}
