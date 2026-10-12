import { readFileSync } from 'node:fs';
import {
  M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_CONTRACT_V1,
  type M3_3HvH4A3GovernanceRatificationProvenanceV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-ratification-provenance.types.v1';
import { normalizePhaseAAuthorizedReleaseShaV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-readiness-validation.v1';
import type { M3_3HvH4A3SingleOperatorGovernanceAdoptionRecordV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-governance-mode.types.v1';

export const M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_JSON_ENV =
  'M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_JSON' as const;

export const M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_PATH_ENV =
  'M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_PATH' as const;

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
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_RATIFICATION_PROVENANCE_UNREADABLE' };
    }
  }
  return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_RATIFICATION_PROVENANCE_REQUIRED' };
}

export function loadGovernanceRatificationProvenanceV1(
  env: NodeJS.ProcessEnv,
): { ok: true; record: M3_3HvH4A3GovernanceRatificationProvenanceV1 } | { ok: false; reasonCode: string } {
  const loaded = loadJsonFromEnvV1(
    env,
    M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_JSON_ENV,
    M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_PATH_ENV,
  );
  if (!loaded.ok) return loaded;

  let parsed: unknown;
  try {
    parsed = JSON.parse(loaded.raw);
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_RATIFICATION_PROVENANCE_INVALID_JSON' };
  }
  if (!isRecord(parsed)) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_RATIFICATION_PROVENANCE_INVALID_SHAPE' };
  }
  if (parsed.contractVersion !== M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_CONTRACT_V1) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_RATIFICATION_PROVENANCE_CONTRACT_MISMATCH' };
  }
  if (typeof parsed.governancePolicyId !== 'string' || !parsed.governancePolicyId.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_RATIFICATION_PROVENANCE_INVALID_SHAPE' };
  }
  if (typeof parsed.governanceAdoptionProposalRef !== 'string' || !parsed.governanceAdoptionProposalRef.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_RATIFICATION_PROVENANCE_INVALID_SHAPE' };
  }
  const pr = parsed.pullRequestNumber;
  if (typeof pr !== 'number' || !Number.isInteger(pr) || pr <= 0) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_RATIFICATION_PROVENANCE_INVALID_SHAPE' };
  }
  const mergeSha = normalizePhaseAAuthorizedReleaseShaV1(
    typeof parsed.ratifiedMergeCommitSha === 'string' ? parsed.ratifiedMergeCommitSha : undefined,
  );
  if (!mergeSha.ok) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_RATIFICATION_PROVENANCE_MERGE_SHA_INVALID' };
  }
  if (typeof parsed.authorizedOwnerIdentity !== 'string' || parsed.authorizedOwnerIdentity.trim().length < 3) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_RATIFICATION_PROVENANCE_INVALID_SHAPE' };
  }
  if (parsed.ratificationAction !== 'OWNER_CONTROLLED_REPOSITORY_MERGE') {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_RATIFICATION_PROVENANCE_ACTION_INVALID' };
  }
  const authStatus = parsed.provenanceAuthenticationStatus;
  if (authStatus === 'TRUSTED_EXTERNAL_VERIFIED') {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SELF_ASSERTED_TRUST_STATUS_FORBIDDEN' };
  }
  if (authStatus !== 'UNVERIFIED') {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_RATIFICATION_PROVENANCE_AUTH_STATUS_INVALID' };
  }

  const record = parsed as M3_3HvH4A3GovernanceRatificationProvenanceV1;
  record.ratifiedMergeCommitSha = mergeSha.normalized;
  return { ok: true, record };
}

/** Structural consistency of claim records — not authentication or merge proof. */
export function validateGovernanceRatificationProvenanceClaimsAgainstAdoptionV1(
  provenance: M3_3HvH4A3GovernanceRatificationProvenanceV1,
  adoption: M3_3HvH4A3SingleOperatorGovernanceAdoptionRecordV1,
): { ok: true } | { ok: false; reasonCode: string } {
  if (provenance.governancePolicyId.trim() !== adoption.governanceContractId.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_RATIFICATION_PROVENANCE_POLICY_MISMATCH' };
  }
  if (provenance.governanceAdoptionProposalRef.trim() !== adoption.governanceProposalRef.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_RATIFICATION_PROVENANCE_PROPOSAL_MISMATCH' };
  }
  const owner = provenance.authorizedOwnerIdentity.trim().toLowerCase();
  const adoptionOwner = adoption.authorities.humanOwnerOperator.trim().toLowerCase();
  if (!owner || owner !== adoptionOwner) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_RATIFICATION_PROVENANCE_OWNER_MISMATCH' };
  }
  return { ok: true };
}
