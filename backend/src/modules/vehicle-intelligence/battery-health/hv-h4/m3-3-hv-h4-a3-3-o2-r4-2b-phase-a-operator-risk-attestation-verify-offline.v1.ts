import { normalizePhaseAAuthorizedReleaseShaV1, parseUtcIsoTimestampV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-readiness-validation.v1';
import { hashGovernanceOperatorRiskAttestationSigningPayloadV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.canonical.v1';
import { verifyGovernanceEd25519SignatureV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.crypto.v1';
import {
  M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_CONTRACT_V1,
  type M3_3HvH4A3GovernanceOperatorRiskAttestationV1,
  type M3_3HvH4A3GovernanceOwnerPolicyV1,
  type M3_3HvH4A3GovernanceTrustStoreV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.types.v1';
import { parseUtcInstantStrictV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.utc-instant.v1';

export type M3_3HvH4A3OperatorRiskAttestationOfflineVerifyResultV1 =
  | { ok: true; authorityVerified: true }
  | { ok: false; reasonCode: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseGovernanceOperatorRiskAttestationV1(
  parsed: unknown,
): { ok: true; attestation: M3_3HvH4A3GovernanceOperatorRiskAttestationV1 } | { ok: false; reasonCode: string } {
  if (!isRecord(parsed) || parsed.contractVersion !== M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_CONTRACT_V1) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_OPERATOR_RISK_ATTESTATION_INVALID' };
  }
  if (parsed.attestationPurpose !== 'OPERATOR_RISK_ACCEPTANCE_V2' || parsed.residualRiskAcknowledgement !== true) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_OPERATOR_RISK_ATTESTATION_INVALID' };
  }
  const release = normalizePhaseAAuthorizedReleaseShaV1(
    typeof parsed.authorizedReleaseSha === 'string' ? parsed.authorizedReleaseSha : undefined,
  );
  if (!release.ok) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_OPERATOR_RISK_RELEASE_SHA_INVALID' };
  }
  const attestation = parsed as M3_3HvH4A3GovernanceOperatorRiskAttestationV1;
  attestation.authorizedReleaseSha = release.normalized;
  if (attestation.operatorLogin.trim().toUpperCase() === 'AUTHORITY_A') {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_OPERATOR_RISK_ROLE_LABEL_FORBIDDEN' };
  }
  return { ok: true, attestation };
}

export function verifyGovernanceOperatorRiskAttestationOfflineV1(
  input: {
    trustStore: M3_3HvH4A3GovernanceTrustStoreV1;
    ownerPolicy: M3_3HvH4A3GovernanceOwnerPolicyV1;
    attestation: M3_3HvH4A3GovernanceOperatorRiskAttestationV1;
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
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_OPERATOR_RISK_ACCEPTANCE_REPLAY' };
  }

  const digest = hashGovernanceOperatorRiskAttestationSigningPayloadV1(attestation);
  const sig = verifyGovernanceEd25519SignatureV1(
    input.trustStore,
    'OPERATOR_RISK_ACCEPTANCE',
    attestation.signature,
    digest,
    now,
  );
  if (!sig.ok) return sig;

  const ownerLogin = attestation.operatorLogin.trim().toLowerCase();
  const authorized = input.ownerPolicy.authorizedOwnerLogins.map((l) => l.trim().toLowerCase());
  if (!authorized.includes(ownerLogin)) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_OPERATOR_RISK_OWNER_UNAUTHORIZED' };
  }

  if (attestation.changeTicket.trim() !== input.changeTicket.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_CHANGE_TICKET_MISMATCH' };
  }
  if (attestation.approvalId.trim() !== input.approvalBinding.approvalId.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_BINDING_MISMATCH' };
  }
  if (attestation.executeNonce.trim() !== input.approvalBinding.executeNonce.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_BINDING_MISMATCH' };
  }
  if (attestation.authorizedReleaseSha !== input.authorizedReleaseSha) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_RELEASE_SHA_MISMATCH' };
  }
  if (attestation.postgresTargetFingerprint !== input.postgresTargetFingerprint) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_POSTGRES_TARGET_MISMATCH' };
  }

  const mw = attestation.maintenanceWindow;
  if (mw.startUtc.trim() !== input.maintenanceWindow.startUtc.trim() || mw.endUtc.trim() !== input.maintenanceWindow.endUtc.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_MAINTENANCE_MISMATCH' };
  }

  const bindingFrom = parseUtcIsoTimestampV1(input.approvalBinding.validFrom);
  const bindingUntil = parseUtcIsoTimestampV1(input.approvalBinding.validUntil);
  if (!bindingFrom.ok || !bindingUntil.ok || now.getTime() < bindingFrom.epochMs || now.getTime() > bindingUntil.epochMs) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_OUTSIDE_APPROVAL_WINDOW' };
  }

  input.seenAcceptanceIds?.add(attestation.acceptanceId);
  return { ok: true, authorityVerified: true };
}
