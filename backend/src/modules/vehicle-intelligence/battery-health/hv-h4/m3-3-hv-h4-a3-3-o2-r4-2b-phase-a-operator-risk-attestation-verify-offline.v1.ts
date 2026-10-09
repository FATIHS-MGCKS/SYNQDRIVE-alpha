import { normalizePhaseAAuthorizedReleaseShaV1, parseUtcIsoTimestampV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-readiness-validation.v1';
import { hashGovernanceOperatorRiskAttestationSigningPayloadV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.canonical.v1';
import {
  PHASE_A_GOVERNANCE_INDEPENDENT_TRUST_ANCHOR_NOT_PROVISIONED,
  type M3_3HvH4A3GovernanceCryptographicVerificationStatusV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.crypto-verification.types.v1';
import { verifyGovernanceEd25519SignatureV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.crypto.v1';
import {
  M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_CONTRACT_V1,
  type M3_3HvH4A3GovernanceOperatorRiskAttestationV1,
  type M3_3HvH4A3GovernanceOwnerPolicyV1,
  type M3_3HvH4A3GovernanceTrustStoreV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.types.v1';
import { describeGovernanceEphemeralNonceDedupScopeV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-replay-boundary.v1';
import { bindOperatorRiskSignedAttestationToClaimsV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-operator-risk-attestation-claims-binding.v1';
import type { M3_3HvH4A3OperatorRiskAcceptanceV2 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-governance-mode.types.v1';
import { parseUtcInstantStrictV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.utc-instant.v1';

export type M3_3HvH4A3OperatorRiskAttestationOfflineVerifyResultV1 =
  | {
      ok: true;
      cryptographicVerificationStatus: 'SIGNATURE_VALID_WITH_SUPPLIED_KEY';
      independentAuthorityVerified: false;
      reasonCode: typeof PHASE_A_GOVERNANCE_INDEPENDENT_TRUST_ANCHOR_NOT_PROVISIONED;
      ephemeralNonceDedupScope: ReturnType<typeof describeGovernanceEphemeralNonceDedupScopeV1>;
    }
  | { ok: false; reasonCode: string; cryptographicVerificationStatus?: M3_3HvH4A3GovernanceCryptographicVerificationStatusV1 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseGovernanceOperatorRiskAttestationV1(
  parsed: unknown,
): { ok: true; attestation: M3_3HvH4A3GovernanceOperatorRiskAttestationV1 } | { ok: false; reasonCode: string } {
  try {
    if (!isRecord(parsed) || parsed.contractVersion !== M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_CONTRACT_V1) {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_OPERATOR_RISK_ATTESTATION_INVALID' };
    }
    if (parsed.attestationPurpose !== 'OPERATOR_RISK_ACCEPTANCE_V2' || parsed.residualRiskAcknowledgement !== true) {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_OPERATOR_RISK_ATTESTATION_INVALID' };
    }
    const sig = parsed.signature;
    if (!isRecord(sig) || sig.algorithm !== 'Ed25519' || typeof sig.keyId !== 'string' || typeof sig.detachedBase64 !== 'string') {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_OPERATOR_RISK_ATTESTATION_INVALID' };
    }
    const release = normalizePhaseAAuthorizedReleaseShaV1(
      typeof parsed.authorizedReleaseSha === 'string' ? parsed.authorizedReleaseSha : undefined,
    );
    if (!release.ok) {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_OPERATOR_RISK_RELEASE_SHA_INVALID' };
    }
    if (typeof parsed.operatorLogin !== 'string' || !parsed.operatorLogin.trim()) {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_OPERATOR_RISK_ATTESTATION_INVALID' };
    }
    const attestation = parsed as M3_3HvH4A3GovernanceOperatorRiskAttestationV1;
    attestation.authorizedReleaseSha = release.normalized;
    if (attestation.operatorLogin.trim().toUpperCase() === 'AUTHORITY_A') {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_OPERATOR_RISK_ROLE_LABEL_FORBIDDEN' };
    }
    return { ok: true, attestation };
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_OPERATOR_RISK_ATTESTATION_INVALID' };
  }
}

export function verifyGovernanceOperatorRiskAttestationOfflineV1(
  input: {
    trustStore: M3_3HvH4A3GovernanceTrustStoreV1;
    ownerPolicy: M3_3HvH4A3GovernanceOwnerPolicyV1;
    attestation: M3_3HvH4A3GovernanceOperatorRiskAttestationV1;
    riskAcceptanceClaims: M3_3HvH4A3OperatorRiskAcceptanceV2;
    authorizedHumanApprover: string;
    changeTicket: string;
    approvalBinding: {
      approvalId: string;
      executeNonce: string;
      validFrom: string;
      validUntil: string;
    };
    maintenanceWindow: { startUtc: string; endUtc: string };
    authorizedReleaseSha: string;
    postgresTargetFingerprint: string;
    now: Date;
    seenAcceptanceIds?: Set<string>;
  },
): M3_3HvH4A3OperatorRiskAttestationOfflineVerifyResultV1 {
  const { attestation, now } = input;
  const issued = parseUtcInstantStrictV1(attestation.issuedAtUtc);
  const expires = parseUtcInstantStrictV1(attestation.expiresAtUtc);
  if (!issued || !expires || expires <= issued) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_OPERATOR_RISK_ATTESTATION_WINDOW_INVALID' };
  }
  if (now < issued || now > expires) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_OPERATOR_RISK_ATTESTATION_EXPIRED' };
  }
  if (issued > now) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_OPERATOR_RISK_ATTESTATION_FUTURE' };
  }
  if (input.seenAcceptanceIds?.has(attestation.acceptanceId)) {
    return {
      ok: false,
      reasonCode: 'PHASE_A_GOVERNANCE_OPERATOR_RISK_ACCEPTANCE_REPLAY_WITHIN_EPHEMERAL_SCOPE',
      cryptographicVerificationStatus: 'SIGNATURE_NOT_EVALUATED',
    };
  }

  const digest = hashGovernanceOperatorRiskAttestationSigningPayloadV1(attestation);
  const sig = verifyGovernanceEd25519SignatureV1(
    input.trustStore,
    'OPERATOR_RISK_ACCEPTANCE',
    attestation.signature,
    digest,
    now,
  );
  if (!sig.ok) {
    return { ok: false, reasonCode: sig.reasonCode, cryptographicVerificationStatus: 'SIGNATURE_INVALID' };
  }

  const ownerLogin = attestation.operatorLogin.trim().toLowerCase();
  const authorized = input.ownerPolicy.authorizedOwnerLogins.map((l) => l.trim().toLowerCase());
  if (!authorized.includes(ownerLogin)) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_OPERATOR_RISK_OWNER_UNAUTHORIZED', cryptographicVerificationStatus: 'SIGNATURE_VALID_WITH_SUPPLIED_KEY' };
  }

  const claimsBinding = bindOperatorRiskSignedAttestationToClaimsV1({
    attestation,
    riskAcceptanceClaims: input.riskAcceptanceClaims,
    authorizedHumanApprover: input.authorizedHumanApprover,
    ownerPolicy: input.ownerPolicy,
    changeTicket: input.changeTicket,
    approvalBinding: input.approvalBinding,
    maintenanceWindow: input.maintenanceWindow,
    authorizedReleaseSha: input.authorizedReleaseSha,
    postgresTargetFingerprint: input.postgresTargetFingerprint,
    now,
  });
  if (!claimsBinding.ok) {
    return { ok: false, reasonCode: claimsBinding.reasonCode, cryptographicVerificationStatus: 'SIGNATURE_VALID_WITH_SUPPLIED_KEY' };
  }

  input.seenAcceptanceIds?.add(attestation.acceptanceId);
  return {
    ok: true,
    cryptographicVerificationStatus: 'SIGNATURE_VALID_WITH_SUPPLIED_KEY',
    independentAuthorityVerified: false,
    reasonCode: PHASE_A_GOVERNANCE_INDEPENDENT_TRUST_ANCHOR_NOT_PROVISIONED,
    ephemeralNonceDedupScope: describeGovernanceEphemeralNonceDedupScopeV1(),
  };
}
