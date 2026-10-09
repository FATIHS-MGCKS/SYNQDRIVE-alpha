import { readFileSync } from 'node:fs';
import { parseUtcInstantStrictV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.utc-instant.v1';
import {
  M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_CONTRACT_V1,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_CONTRACT_V2,
  M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_CONTRACT_V1,
  type M3_3HvH4A3OperatorRiskAcceptanceV1,
  type M3_3HvH4A3PhaseAProductionGovernanceModeV1,
  type M3_3HvH4A3SingleOperatorGovernanceAdoptionRecordV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-governance-mode.types.v1';

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

export type M3_3HvH4A3PhaseAHumanVerificationReadinessResultV1 =
  | { ok: true; path: 'MULTI_PARTY_INDEPENDENT_VERIFIER' | 'SINGLE_OPERATOR_PATH_B' }
  | { ok: false; reasonCode: string };

export function evaluatePhaseAHumanVerificationReadinessV1(
  env: NodeJS.ProcessEnv,
  options: {
    verifierIdentity: string;
    approvingAuthority: string;
    authorizedHumanApprover: string;
    changeTicket: string;
  },
): M3_3HvH4A3PhaseAHumanVerificationReadinessResultV1 {
  const modeResolved = resolvePhaseAProductionGovernanceModeV1(env);
  if (!modeResolved.ok) return modeResolved;

  if (modeResolved.mode === 'MULTI_PARTY_V1') {
    const verifier = options.verifierIdentity.trim().toLowerCase();
    const author = options.approvingAuthority.trim().toLowerCase();
    const humanApprover = options.authorizedHumanApprover.trim().toLowerCase();
    if (!verifier || verifier === author || verifier === humanApprover) {
      return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_VERIFIER_NOT_INDEPENDENT' };
    }
    return { ok: true, path: 'MULTI_PARTY_INDEPENDENT_VERIFIER' };
  }

  const adoption = loadSingleOperatorGovernanceAdoptionRecordV1(env);
  if (!adoption.ok) return adoption;
  if (adoption.record.ratificationStatus !== 'RATIFIED') {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_ADOPTION_NOT_RATIFIED' };
  }

  const risk = loadOperatorRiskAcceptanceV1(env);
  if (!risk.ok) return risk;
  if (risk.record.changeTicket.trim() !== options.changeTicket.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_OPERATOR_RISK_ACCEPTANCE_CHANGE_TICKET_MISMATCH' };
  }

  return { ok: true, path: 'SINGLE_OPERATOR_PATH_B' };
}
