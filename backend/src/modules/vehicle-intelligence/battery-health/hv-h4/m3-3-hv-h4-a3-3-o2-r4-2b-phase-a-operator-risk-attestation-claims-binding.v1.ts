import { parseUtcIsoTimestampV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-readiness-validation.v1';
import type { M3_3HvH4A3GovernanceOperatorRiskAttestationV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.types.v1';
import type { M3_3HvH4A3GovernanceOwnerPolicyV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.types.v1';
import type { M3_3HvH4A3OperatorRiskAcceptanceV2 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-governance-mode.types.v1';

export type M3_3HvH4A3OperatorRiskAttestationClaimsBindingResultV1 =
  | { ok: true }
  | { ok: false; reasonCode: string };

/**
 * Binds signed operator-risk attestation to submitted claim JSON and runtime approver context.
 * Does not grant per-change risk acceptance or independent authority.
 */
export function bindOperatorRiskSignedAttestationToClaimsV1(input: {
  attestation: M3_3HvH4A3GovernanceOperatorRiskAttestationV1;
  riskAcceptanceClaims: M3_3HvH4A3OperatorRiskAcceptanceV2;
  authorizedHumanApprover: string;
  ownerPolicy: M3_3HvH4A3GovernanceOwnerPolicyV1;
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
}): M3_3HvH4A3OperatorRiskAttestationClaimsBindingResultV1 {
  const claims = input.riskAcceptanceClaims;
  const att = input.attestation;

  const approver = input.authorizedHumanApprover.trim().toLowerCase();
  const operatorLogin = att.operatorLogin.trim().toLowerCase();
  const claimsOperator = claims.operatorIdentity.trim().toLowerCase();
  const claimsOwner = claims.authorizedOwnerIdentity.trim().toLowerCase();

  if (!approver || operatorLogin !== approver) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ATTESTATION_APPROVER_MISMATCH' };
  }
  if (claimsOperator !== approver || claimsOwner !== approver) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_CLAIMS_OWNER_MISMATCH' };
  }

  const authorized = input.ownerPolicy.authorizedOwnerLogins.map((l) => l.trim().toLowerCase());
  if (!authorized.includes(operatorLogin)) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_OPERATOR_RISK_OWNER_UNAUTHORIZED' };
  }

  if (att.changeTicket.trim() !== input.changeTicket.trim() || att.changeTicket.trim() !== claims.changeTicket.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_CHANGE_TICKET_MISMATCH' };
  }
  if (
    att.approvalId.trim() !== input.approvalBinding.approvalId.trim() ||
    att.approvalId.trim() !== claims.approvalBinding.approvalId.trim()
  ) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_BINDING_MISMATCH' };
  }
  if (
    att.executeNonce.trim() !== input.approvalBinding.executeNonce.trim() ||
    att.executeNonce.trim() !== claims.approvalBinding.executeNonce.trim()
  ) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_BINDING_MISMATCH' };
  }
  if (att.authorizedReleaseSha !== input.authorizedReleaseSha) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_RELEASE_SHA_MISMATCH' };
  }
  if (att.postgresTargetFingerprint !== input.postgresTargetFingerprint) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_POSTGRES_TARGET_MISMATCH' };
  }

  const mw = att.maintenanceWindow;
  const expectedMw = input.maintenanceWindow;
  const claimsMw = claims.maintenanceWindow;
  if (
    mw.startUtc.trim() !== expectedMw.startUtc.trim() ||
    mw.endUtc.trim() !== expectedMw.endUtc.trim() ||
    mw.startUtc.trim() !== claimsMw.startUtc.trim() ||
    mw.endUtc.trim() !== claimsMw.endUtc.trim()
  ) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_MAINTENANCE_MISMATCH' };
  }

  if (att.pathBSecurityReviewExceptionScope.trim() !== claims.pathBSecurityReviewExceptionScope.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_SECURITY_REVIEW_SCOPE_MISMATCH' };
  }
  if (att.residualRiskAcknowledgement !== claims.residualRiskAcknowledgement) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_RESIDUAL_RISK_MISMATCH' };
  }

  const bindingFrom = parseUtcIsoTimestampV1(input.approvalBinding.validFrom);
  const bindingUntil = parseUtcIsoTimestampV1(input.approvalBinding.validUntil);
  const acceptedAt = parseUtcIsoTimestampV1(claims.acceptedAtUtc);
  if (!bindingFrom.ok || !bindingUntil.ok || !acceptedAt.ok) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_TIMESTAMP_INVALID' };
  }
  const nowMs = input.now.getTime();
  if (nowMs < bindingFrom.epochMs || nowMs > bindingUntil.epochMs) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_OUTSIDE_APPROVAL_WINDOW' };
  }
  if (acceptedAt.epochMs < bindingFrom.epochMs || acceptedAt.epochMs > bindingUntil.epochMs) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_TIMESTAMP_OUTSIDE_BINDING' };
  }

  const claimsBindingFrom = parseUtcIsoTimestampV1(claims.approvalBinding.validFrom);
  const claimsBindingUntil = parseUtcIsoTimestampV1(claims.approvalBinding.validUntil);
  if (
    !claimsBindingFrom.ok ||
    !claimsBindingUntil.ok ||
    claimsBindingFrom.epochMs !== bindingFrom.epochMs ||
    claimsBindingUntil.epochMs !== bindingUntil.epochMs
  ) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_BINDING_MISMATCH' };
  }

  return { ok: true };
}
