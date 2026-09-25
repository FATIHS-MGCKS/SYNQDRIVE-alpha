import { createHash } from 'crypto';
import { ERD_RECHARGE_SHADOW_COMPARATOR_VERSION } from './erd-recharge-shadow-parity.constants';
import type { ErdRechargeShadowObservationDraft } from './erd-recharge-shadow-parity.types';

function stableJson(value: unknown): string {
  if (value == null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(obj[key])}`).join(',')}}`;
}

/**
 * Deterministic fingerprint for idempotent shadow evidence upsert.
 * Excludes evaluatedAt, correlation ids, and replica-specific values.
 */
export function buildShadowComparisonFingerprint(input: {
  organizationId: string;
  vehicleId: string;
  draft: Pick<
    ErdRechargeShadowObservationDraft,
    | 'canonicalChargeSessionId'
    | 'legacyVehicleEnergyEventId'
    | 'pairingEvidence'
    | 'parityClass'
    | 'finality'
    | 'canonicalProjectionSnapshot'
    | 'legacyProjectionSnapshot'
    | 'fieldDiff'
  >;
}): string {
  const payload = {
    comparatorVersion: ERD_RECHARGE_SHADOW_COMPARATOR_VERSION,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    canonicalChargeSessionId: input.draft.canonicalChargeSessionId,
    legacyVehicleEnergyEventId: input.draft.legacyVehicleEnergyEventId,
    pairingEvidence: input.draft.pairingEvidence,
    parityClass: input.draft.parityClass,
    finality: input.draft.finality,
    canonicalProjectionSnapshot: input.draft.canonicalProjectionSnapshot,
    legacyProjectionSnapshot: input.draft.legacyProjectionSnapshot,
    fieldDiff: input.draft.fieldDiff,
  };
  return createHash('sha256').update(stableJson(payload)).digest('hex');
}
