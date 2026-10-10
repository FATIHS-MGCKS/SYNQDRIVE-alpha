import { parseGovernanceTrustStoreV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-ratification-verify-offline.v1';
import { parseGovernanceOwnerPolicyV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-ratification-verify-offline.v1';
import {
  PHASE_A_GOVERNANCE_CALLER_SUPPLIED_TRUST_CANNOT_ESTABLISH_AUTHORITY,
  PHASE_A_GOVERNANCE_INDEPENDENT_TRUST_ANCHOR_NOT_PROVISIONED,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.crypto-verification.types.v1';
import type {
  M3_3HvH4A3GovernanceOwnerPolicyV1,
  M3_3HvH4A3GovernanceTrustStoreV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.types.v1';
import { sha256HexFingerprintV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.crypto-trust.v1';
import { parseUtcInstantStrictV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.utc-instant.v1';

export const M3_3_HV_H4_A3_INDEPENDENT_TRUST_ANCHOR_PROVISION_CONTRACT_V1 =
  'M3_3_HV_H4_A3_INDEPENDENT_TRUST_ANCHOR_PROVISION_V1' as const;

/**
 * Future production channel: out-of-band trust-anchor service with integrity-protected bundle.
 * A2 does not activate production resolver — specification + fail-closed validation only.
 */
export type M3_3HvH4A3IndependentTrustAnchorProvisioningChannelV1 =
  | 'INDEPENDENT_TRUST_ANCHOR_SERVICE'
  | 'TEST_ISOLATED_FIXTURE';

export type M3_3HvH4A3IndependentTrustAnchorProvisionV1 = {
  contractVersion: typeof M3_3_HV_H4_A3_INDEPENDENT_TRUST_ANCHOR_PROVISION_CONTRACT_V1;
  provisioningChannel: M3_3HvH4A3IndependentTrustAnchorProvisioningChannelV1;
  anchorBundleId: string;
  anchorFingerprintSha256: string;
  ownerPolicy: M3_3HvH4A3GovernanceOwnerPolicyV1;
  trustStore: M3_3HvH4A3GovernanceTrustStoreV1;
  issuedAtUtc: string;
  rotationEpoch: number;
};

export type M3_3HvH4A3IndependentTrustAnchorProvisionValidateResultV1 =
  | { ok: true; provision: M3_3HvH4A3IndependentTrustAnchorProvisionV1; structurallyValid: true }
  | { ok: false; reasonCode: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function fingerprintIndependentTrustAnchorProvisionV1(
  provision: Pick<M3_3HvH4A3IndependentTrustAnchorProvisionV1, 'ownerPolicy' | 'trustStore' | 'rotationEpoch'>,
): string {
  const payload = JSON.stringify({
    ownerPolicy: provision.ownerPolicy,
    trustStore: provision.trustStore,
    rotationEpoch: provision.rotationEpoch,
  });
  return sha256HexFingerprintV1(Buffer.from(payload, 'utf8'));
}

export function parseIndependentTrustAnchorProvisionV1(
  parsed: unknown,
): M3_3HvH4A3IndependentTrustAnchorProvisionValidateResultV1 {
  try {
    if (!isRecord(parsed) || parsed.contractVersion !== M3_3_HV_H4_A3_INDEPENDENT_TRUST_ANCHOR_PROVISION_CONTRACT_V1) {
      return { ok: false, reasonCode: 'PHASE_A_INDEPENDENT_TRUST_ANCHOR_PROVISION_INVALID' };
    }
    const channel = parsed.provisioningChannel;
    if (channel !== 'INDEPENDENT_TRUST_ANCHOR_SERVICE' && channel !== 'TEST_ISOLATED_FIXTURE') {
      return { ok: false, reasonCode: PHASE_A_GOVERNANCE_CALLER_SUPPLIED_TRUST_CANNOT_ESTABLISH_AUTHORITY };
    }
    if (typeof parsed.anchorBundleId !== 'string' || !parsed.anchorBundleId.trim()) {
      return { ok: false, reasonCode: 'PHASE_A_INDEPENDENT_TRUST_ANCHOR_PROVISION_INVALID' };
    }
    if (typeof parsed.anchorFingerprintSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(parsed.anchorFingerprintSha256)) {
      return { ok: false, reasonCode: 'PHASE_A_INDEPENDENT_TRUST_ANCHOR_PROVISION_INVALID' };
    }
    if (typeof parsed.rotationEpoch !== 'number' || !Number.isInteger(parsed.rotationEpoch) || parsed.rotationEpoch < 0) {
      return { ok: false, reasonCode: 'PHASE_A_INDEPENDENT_TRUST_ANCHOR_PROVISION_INVALID' };
    }
    if (typeof parsed.issuedAtUtc !== 'string' || !parseUtcInstantStrictV1(parsed.issuedAtUtc)) {
      return { ok: false, reasonCode: 'PHASE_A_INDEPENDENT_TRUST_ANCHOR_PROVISION_INVALID' };
    }
    const policy = parseGovernanceOwnerPolicyV1(parsed.ownerPolicy);
    if (!policy.ok) {
      return { ok: false, reasonCode: policy.reasonCode };
    }
    const store = parseGovernanceTrustStoreV1(parsed.trustStore);
    if (!store.ok) {
      return { ok: false, reasonCode: store.reasonCode };
    }
    const provision: M3_3HvH4A3IndependentTrustAnchorProvisionV1 = {
      contractVersion: M3_3_HV_H4_A3_INDEPENDENT_TRUST_ANCHOR_PROVISION_CONTRACT_V1,
      provisioningChannel: channel,
      anchorBundleId: parsed.anchorBundleId.trim(),
      anchorFingerprintSha256: parsed.anchorFingerprintSha256.toLowerCase(),
      ownerPolicy: policy.policy,
      trustStore: store.store,
      issuedAtUtc: parsed.issuedAtUtc,
      rotationEpoch: parsed.rotationEpoch,
    };
    const computed = fingerprintIndependentTrustAnchorProvisionV1(provision);
    if (computed !== provision.anchorFingerprintSha256) {
      return { ok: false, reasonCode: 'PHASE_A_INDEPENDENT_TRUST_ANCHOR_FINGERPRINT_MISMATCH' };
    }
    return { ok: true, provision, structurallyValid: true };
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_INDEPENDENT_TRUST_ANCHOR_PROVISION_INVALID' };
  }
}

/** Caller-controlled env/JSON/repo commits cannot self-authorize (A2 boundary). */
export function rejectCallerSuppliedTrustAnchorMaterialV1(input: {
  provisioningChannel: string | undefined;
  evidenceBundleFingerprintSha256?: string;
  anchorFingerprintSha256?: string;
}): { ok: true } | { ok: false; reasonCode: string } {
  const channel = (input.provisioningChannel ?? '').trim().toUpperCase();
  if (
    channel === 'CALLER_SUPPLIED_ENV' ||
    channel === 'CALLER_SUPPLIED_JSON' ||
    channel === 'REPOSITORY_COMMIT' ||
    channel === 'ENV' ||
    channel === ''
  ) {
    return { ok: false, reasonCode: PHASE_A_GOVERNANCE_CALLER_SUPPLIED_TRUST_CANNOT_ESTABLISH_AUTHORITY };
  }
  if (
    input.evidenceBundleFingerprintSha256 &&
    input.anchorFingerprintSha256 &&
    input.evidenceBundleFingerprintSha256 === input.anchorFingerprintSha256
  ) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SELF_ASSERTED_TRUST_BUNDLE_REJECTED' };
  }
  return { ok: true };
}

export function describeIndependentTrustAnchorProvisioningBoundaryV1(): {
  productionResolverActivated: false;
  provisioningChannelsAllowedInA2: M3_3HvH4A3IndependentTrustAnchorProvisioningChannelV1[];
  defaultReasonWhenMissing: typeof PHASE_A_GOVERNANCE_INDEPENDENT_TRUST_ANCHOR_NOT_PROVISIONED;
} {
  return {
    productionResolverActivated: false,
    provisioningChannelsAllowedInA2: ['TEST_ISOLATED_FIXTURE'],
    defaultReasonWhenMissing: PHASE_A_GOVERNANCE_INDEPENDENT_TRUST_ANCHOR_NOT_PROVISIONED,
  };
}
