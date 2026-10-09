import { readFileSync } from 'node:fs';
import { parseUtcInstantStrictV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.utc-instant.v1';
import {
  resolvePhaseAGovernanceExternalAuthorityVerifierV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-external-authority.v1';
import {
  loadGovernanceRatificationProvenanceV1,
  validateGovernanceRatificationProvenanceClaimsAgainstAdoptionV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-ratification-provenance.v1';
import {
  M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_CONTRACT_V1,
  M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_CONTRACT_V2,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_CONTRACT_V2,
  M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_CONTRACT_V1,
  type M3_3HvH4A3OperatorRiskAcceptanceV1,
  type M3_3HvH4A3OperatorRiskAcceptanceV2,
  type M3_3HvH4A3PhaseAProductionGovernanceModeV1,
  type M3_3HvH4A3SingleOperatorGovernanceAdoptionRecordV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-governance-mode.types.v1';
import { parseUtcIsoTimestampV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-readiness-validation.v1';

export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_ENV =
  'M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE' as const;

export const M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_JSON_ENV =
  'M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_JSON' as const;

export const M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_PATH_ENV =
  'M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_PATH' as const;

export const M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_JSON_ENV =
  'M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_JSON' as const;

export const M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_PATH_ENV =
  'M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_PATH' as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function loadJsonFromEnvV1(
  env: NodeJS.ProcessEnv,
  jsonKey: string,
  pathKey: string,
): { ok: true; raw: string } | { ok: false; reasonCode: string } {
  const jsonInline = env[jsonKey]?.trim();
  const path = env[pathKey]?.trim();
  if (jsonInline) return { ok: true, raw: jsonInline };
  if (path) {
    try {
      return { ok: true, raw: readFileSync(path, 'utf8') };
    } catch {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_RECORD_UNREADABLE' };
    }
  }
  return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_RECORD_REQUIRED' };
}

export function resolvePhaseAProductionGovernanceModeV1(
  env: NodeJS.ProcessEnv,
): { ok: true; mode: M3_3HvH4A3PhaseAProductionGovernanceModeV1 } | { ok: false; reasonCode: string } {
  const raw = env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_ENV]?.trim();
  if (!raw || raw === 'MULTI_PARTY_V1') {
    return { ok: true, mode: 'MULTI_PARTY_V1' };
  }
  if (raw === 'SINGLE_OPERATOR_V1') {
    return { ok: true, mode: 'SINGLE_OPERATOR_V1' };
  }
  return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_MODE_UNSUPPORTED' };
}

export function loadSingleOperatorGovernanceAdoptionRecordV1(
  env: NodeJS.ProcessEnv,
): { ok: true; record: M3_3HvH4A3SingleOperatorGovernanceAdoptionRecordV1 } | { ok: false; reasonCode: string } {
  const loaded = loadJsonFromEnvV1(
    env,
    M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_JSON_ENV,
    M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_PATH_ENV,
  );
  if (!loaded.ok) return loaded;

  let parsed: unknown;
  try {
    parsed = JSON.parse(loaded.raw);
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_ADOPTION_INVALID_JSON' };
  }
  if (!isRecord(parsed)) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_ADOPTION_INVALID_SHAPE' };
  }
  if (parsed.contractVersion !== M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_CONTRACT_V1) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_ADOPTION_CONTRACT_MISMATCH' };
  }
  if (parsed.governanceMode !== 'SINGLE_OPERATOR_V1' || parsed.policyPath !== 'B') {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_ADOPTION_POLICY_MISMATCH' };
  }
  if (parsed.governanceModeContractId !== M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_CONTRACT_V2) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_ADOPTION_MODE_CONTRACT_MISMATCH' };
  }
  const ratificationStatus = parsed.ratificationStatus;
  if (ratificationStatus !== 'PENDING_OWNER_CONTROLLED_REPOSITORY_MERGE' && ratificationStatus !== 'RATIFIED') {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_ADOPTION_RATIFICATION_INVALID' };
  }

  const ack = parsed.acknowledgements;
  if (!isRecord(ack)) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_ADOPTION_INVALID_SHAPE' };
  }
  const requiredAck = [
    'noSecondHumanSecurityReviewerAtPolicyLevel',
    'residualRiskSingleOperatorGovernance',
    'multiPartyModePreservedForOtherOperations',
    'externalSeparationOfDutiesCannotBeSelfWaived',
    'doesNotAuthorizeProductionExecution',
    'doesNotGrantPerChangeRiskAcceptance',
  ] as const;
  for (const key of requiredAck) {
    if (ack[key] !== true) {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_ADOPTION_ACK_INCOMPLETE' };
    }
  }

  return { ok: true, record: parsed as M3_3HvH4A3SingleOperatorGovernanceAdoptionRecordV1 };
}

export function loadOperatorRiskAcceptanceV1(
  env: NodeJS.ProcessEnv,
): { ok: true; record: M3_3HvH4A3OperatorRiskAcceptanceV1 } | { ok: false; reasonCode: string } {
  const loaded = loadJsonFromEnvV1(
    env,
    M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_JSON_ENV,
    M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_PATH_ENV,
  );
  if (!loaded.ok) return loaded;

  let parsed: unknown;
  try {
    parsed = JSON.parse(loaded.raw);
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_INVALID_JSON' };
  }
  if (!isRecord(parsed)) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_INVALID_SHAPE' };
  }
  if (parsed.contractVersion !== M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_CONTRACT_V1) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_CONTRACT_MISMATCH' };
  }
  if (parsed.governanceMode !== 'SINGLE_OPERATOR_V1') {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_MODE_MISMATCH' };
  }
  if (typeof parsed.operatorIdentity !== 'string' || parsed.operatorIdentity.length < 3) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_INVALID_SHAPE' };
  }
  if (typeof parsed.changeTicket !== 'string' || parsed.changeTicket.length < 1) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_INVALID_SHAPE' };
  }
  if (typeof parsed.attestation !== 'string' || parsed.attestation.length < 8) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_INVALID_SHAPE' };
  }
  if (typeof parsed.acceptedAtUtc !== 'string' || !parseUtcInstantStrictV1(parsed.acceptedAtUtc)) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_TIMESTAMP_INVALID' };
  }

  return { ok: true, record: parsed as M3_3HvH4A3OperatorRiskAcceptanceV1 };
}

export function loadOperatorRiskAcceptanceV2(
  env: NodeJS.ProcessEnv,
): { ok: true; record: M3_3HvH4A3OperatorRiskAcceptanceV2 } | { ok: false; reasonCode: string } {
  const loaded = loadJsonFromEnvV1(
    env,
    M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_JSON_ENV,
    M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_PATH_ENV,
  );
  if (!loaded.ok) return loaded;

  let parsed: unknown;
  try {
    parsed = JSON.parse(loaded.raw);
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_INVALID_JSON' };
  }
  if (!isRecord(parsed)) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_INVALID_SHAPE' };
  }
  if (parsed.contractVersion !== M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_CONTRACT_V2) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_CONTRACT_MISMATCH' };
  }
  if (parsed.governanceMode !== 'SINGLE_OPERATOR_V1') {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_MODE_MISMATCH' };
  }
  if (typeof parsed.operatorIdentity !== 'string' || parsed.operatorIdentity.trim().length < 3) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_INVALID_SHAPE' };
  }
  if (typeof parsed.authorizedOwnerIdentity !== 'string' || parsed.authorizedOwnerIdentity.trim().length < 3) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_OWNER_INVALID' };
  }
  if (typeof parsed.changeTicket !== 'string' || !parsed.changeTicket.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_INVALID_SHAPE' };
  }
  if (typeof parsed.pathBSecurityReviewExceptionScope !== 'string' || !parsed.pathBSecurityReviewExceptionScope.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_SCOPE_INVALID' };
  }
  if (parsed.residualRiskAcknowledgement !== true) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_RESIDUAL_RISK_REQUIRED' };
  }
  const authStatus = parsed.provenanceAuthenticationStatus;
  if (authStatus === 'TRUSTED_EXTERNAL_VERIFIED') {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SELF_ASSERTED_TRUST_STATUS_FORBIDDEN' };
  }
  if (authStatus !== 'UNVERIFIED') {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_AUTH_STATUS_INVALID' };
  }
  if (typeof parsed.attestation !== 'string' || parsed.attestation.length < 8) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_INVALID_SHAPE' };
  }
  if (typeof parsed.acceptedAtUtc !== 'string' || !parseUtcInstantStrictV1(parsed.acceptedAtUtc)) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_TIMESTAMP_INVALID' };
  }

  const binding = parsed.approvalBinding;
  if (
    !isRecord(binding) ||
    typeof binding.approvalId !== 'string' ||
    !binding.approvalId.trim() ||
    typeof binding.executeNonce !== 'string' ||
    !binding.executeNonce.trim() ||
    typeof binding.validFrom !== 'string' ||
    !binding.validFrom.trim() ||
    typeof binding.validUntil !== 'string' ||
    !binding.validUntil.trim()
  ) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_BINDING_INVALID' };
  }
  const bindingFrom = parseUtcIsoTimestampV1(binding.validFrom);
  const bindingUntil = parseUtcIsoTimestampV1(binding.validUntil);
  if (!bindingFrom.ok || !bindingUntil.ok || bindingUntil.epochMs <= bindingFrom.epochMs) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_BINDING_WINDOW_INVALID' };
  }

  const mw = parsed.maintenanceWindow;
  if (
    !isRecord(mw) ||
    typeof mw.startUtc !== 'string' ||
    !mw.startUtc.trim() ||
    typeof mw.endUtc !== 'string' ||
    !mw.endUtc.trim()
  ) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_MAINTENANCE_INVALID' };
  }
  const mwStart = parseUtcIsoTimestampV1(mw.startUtc);
  const mwEnd = parseUtcIsoTimestampV1(mw.endUtc);
  if (!mwStart.ok || !mwEnd.ok || mwEnd.epochMs <= mwStart.epochMs) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_MAINTENANCE_INVALID' };
  }

  return { ok: true, record: parsed as M3_3HvH4A3OperatorRiskAcceptanceV2 };
}

/** Structural claim binding — not authenticated owner identity or human consent. */
export function validateOperatorRiskAcceptanceV2ClaimsAgainstGoNoGoV1(
  risk: M3_3HvH4A3OperatorRiskAcceptanceV2,
  options: {
    authorizedHumanApprover: string;
    changeTicket: string;
    approvalBinding: {
      approvalId: string;
      executeNonce: string;
      validFrom: string;
      validUntil: string;
    };
    maintenanceWindow: { startUtc: string; endUtc: string };
    now: Date;
  },
): { ok: true } | { ok: false; reasonCode: string } {
  const owner = risk.authorizedOwnerIdentity.trim().toLowerCase();
  const approver = options.authorizedHumanApprover.trim().toLowerCase();
  const operator = risk.operatorIdentity.trim().toLowerCase();
  if (!owner || owner !== approver || owner !== operator) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_OWNER_MISMATCH' };
  }
  if (risk.changeTicket.trim() !== options.changeTicket.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_CHANGE_TICKET_MISMATCH' };
  }
  const b = risk.approvalBinding;
  const expected = options.approvalBinding;
  if (
    b.approvalId.trim() !== expected.approvalId.trim() ||
    b.executeNonce.trim() !== expected.executeNonce.trim() ||
    b.validFrom.trim() !== expected.validFrom.trim() ||
    b.validUntil.trim() !== expected.validUntil.trim()
  ) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_BINDING_MISMATCH' };
  }
  const mw = risk.maintenanceWindow;
  const expectedMw = options.maintenanceWindow;
  if (mw.startUtc.trim() !== expectedMw.startUtc.trim() || mw.endUtc.trim() !== expectedMw.endUtc.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_MAINTENANCE_MISMATCH' };
  }

  const acceptedAt = parseUtcIsoTimestampV1(risk.acceptedAtUtc);
  if (!acceptedAt.ok) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_TIMESTAMP_INVALID' };
  }
  const bindingFrom = parseUtcIsoTimestampV1(b.validFrom);
  const bindingUntil = parseUtcIsoTimestampV1(b.validUntil);
  const mwStart = parseUtcIsoTimestampV1(mw.startUtc);
  const mwEnd = parseUtcIsoTimestampV1(mw.endUtc);
  if (!bindingFrom.ok || !bindingUntil.ok || !mwStart.ok || !mwEnd.ok) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_BINDING_WINDOW_INVALID' };
  }
  const nowMs = options.now.getTime();
  if (nowMs < bindingFrom.epochMs || nowMs > bindingUntil.epochMs) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_OUTSIDE_APPROVAL_WINDOW' };
  }
  if (nowMs < mwStart.epochMs || nowMs > mwEnd.epochMs) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_OUTSIDE_MAINTENANCE_WINDOW' };
  }
  if (acceptedAt.epochMs < bindingFrom.epochMs || acceptedAt.epochMs > bindingUntil.epochMs) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_STALE_ACCEPTANCE' };
  }
  if (acceptedAt.epochMs > nowMs) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_FUTURE_ACCEPTANCE' };
  }

  return { ok: true };
}

export type M3_3HvH4A3PhaseASingleOperatorGovernanceClaimsEvaluationV1 =
  | { ok: true; claimsStructurallyValid: true }
  | { ok: false; reasonCode: string };

export function evaluatePhaseASingleOperatorGovernanceClaimsStructuralValidityV1(
  env: NodeJS.ProcessEnv,
  options: {
    authorizedHumanApprover: string;
    changeTicket: string;
    approvalBinding: {
      approvalId: string;
      executeNonce: string;
      validFrom: string;
      validUntil: string;
    };
    maintenanceWindow: { startUtc: string; endUtc: string };
    now?: Date;
  },
): M3_3HvH4A3PhaseASingleOperatorGovernanceClaimsEvaluationV1 {
  const adoption = loadSingleOperatorGovernanceAdoptionRecordV1(env);
  if (!adoption.ok) return adoption;

  if (adoption.record.ratificationStatus === 'RATIFIED') {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SELF_DECLARED_RATIFIED_UNTRUSTED' };
  }

  const provenance = loadGovernanceRatificationProvenanceV1(env);
  if (!provenance.ok) return provenance;

  const provenanceClaims = validateGovernanceRatificationProvenanceClaimsAgainstAdoptionV1(
    provenance.record,
    adoption.record,
  );
  if (!provenanceClaims.ok) return provenanceClaims;

  const riskLoaded = loadOperatorRiskAcceptanceV2(env);
  if (!riskLoaded.ok) return riskLoaded;

  const riskClaims = validateOperatorRiskAcceptanceV2ClaimsAgainstGoNoGoV1(riskLoaded.record, {
    authorizedHumanApprover: options.authorizedHumanApprover,
    changeTicket: options.changeTicket,
    approvalBinding: options.approvalBinding,
    maintenanceWindow: options.maintenanceWindow,
    now: options.now ?? new Date(),
  });
  if (!riskClaims.ok) return riskClaims;

  return { ok: true, claimsStructurallyValid: true };
}

export type M3_3HvH4A3PhaseAHumanVerificationReadinessResultV1 =
  | { ok: true; path: 'MULTI_PARTY_INDEPENDENT_VERIFIER' | 'SINGLE_OPERATOR_PATH_B' }
  | { ok: false; reasonCode: string };

export function evaluatePhaseAHumanVerificationReadinessV1(
  env: NodeJS.ProcessEnv,
  options: {
    verifierIdentity?: string;
    approvingAuthority: string;
    authorizedHumanApprover: string;
    changeTicket: string;
    approvalBinding?: {
      approvalId: string;
      executeNonce: string;
      validFrom: string;
      validUntil: string;
    };
    maintenanceWindow?: { startUtc: string; endUtc: string };
    governanceModeFromGoRecord?: M3_3HvH4A3PhaseAProductionGovernanceModeV1;
    now?: Date;
  },
): M3_3HvH4A3PhaseAHumanVerificationReadinessResultV1 {
  const modeResolved = resolvePhaseAProductionGovernanceModeV1(env);
  if (!modeResolved.ok) return modeResolved;

  if (
    options.governanceModeFromGoRecord &&
    options.governanceModeFromGoRecord !== modeResolved.mode
  ) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_MODE_ENV_RECORD_MISMATCH' };
  }

  if (modeResolved.mode === 'MULTI_PARTY_V1') {
    const verifierIdentity = options.verifierIdentity?.trim() ?? '';
    const verifier = verifierIdentity.toLowerCase();
    const author = options.approvingAuthority.trim().toLowerCase();
    const humanApprover = options.authorizedHumanApprover.trim().toLowerCase();
    if (!verifier || verifier === author || verifier === humanApprover) {
      return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_VERIFIER_NOT_INDEPENDENT' };
    }
    return { ok: true, path: 'MULTI_PARTY_INDEPENDENT_VERIFIER' };
  }

  const adoptionPrecheck = loadSingleOperatorGovernanceAdoptionRecordV1(env);
  if (!adoptionPrecheck.ok) return adoptionPrecheck;

  if (!options.approvalBinding || !options.maintenanceWindow) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_CONTEXT_INCOMPLETE' };
  }

  const claims = evaluatePhaseASingleOperatorGovernanceClaimsStructuralValidityV1(env, {
    authorizedHumanApprover: options.authorizedHumanApprover,
    changeTicket: options.changeTicket,
    approvalBinding: options.approvalBinding,
    maintenanceWindow: options.maintenanceWindow,
    now: options.now,
  });
  if (!claims.ok) return claims;

  const adoption = loadSingleOperatorGovernanceAdoptionRecordV1(env);
  if (!adoption.ok) return adoption;
  const provenance = loadGovernanceRatificationProvenanceV1(env);
  if (!provenance.ok) return provenance;
  const riskLoaded = loadOperatorRiskAcceptanceV2(env);
  if (!riskLoaded.ok) return riskLoaded;

  const authorityVerifier = resolvePhaseAGovernanceExternalAuthorityVerifierV1(env);
  const ratificationAuthority = authorityVerifier.verifyRatificationProvenanceV1({
    provenanceClaims: provenance.record,
    adoptionRecord: adoption.record,
  });
  if (ratificationAuthority.authorityStatus !== 'AUTHORITY_VERIFIED') {
    return { ok: false, reasonCode: ratificationAuthority.reasonCode };
  }

  const riskAuthority = authorityVerifier.verifyOperatorRiskAcceptanceV1({
    riskAcceptanceClaims: riskLoaded.record,
    authorizedHumanApprover: options.authorizedHumanApprover,
    changeTicket: options.changeTicket,
    approvalBinding: options.approvalBinding,
    maintenanceWindow: options.maintenanceWindow,
    now: options.now ?? new Date(),
  });
  if (riskAuthority.authorityStatus !== 'AUTHORITY_VERIFIED') {
    return { ok: false, reasonCode: riskAuthority.reasonCode };
  }

  return { ok: true, path: 'SINGLE_OPERATOR_PATH_B' };
}
