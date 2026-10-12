import { createHash } from 'node:crypto';
import {
  M3_3_HV_H4_A3_GOVERNANCE_DEPLOYMENT_PROBE_SIGNING_DOMAIN_V1,
  M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_SIGNING_DOMAIN_V1,
  M3_3_HV_H4_A3_GOVERNANCE_POSTGRES_TARGET_SIGNING_DOMAIN_V1,
  M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_SIGNING_DOMAIN_V1,
  type M3_3HvH4A3DeploymentIdentityEvidenceV1,
  type M3_3HvH4A3GovernanceOperatorRiskAttestationV1,
  type M3_3HvH4A3GovernanceRatificationAttestationV1,
  type M3_3HvH4A3PostgresTargetEvidenceV1,
  type M3_3HvH4A3RepositoryMergeEvidenceV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.types.v1';

export function stableStringifyGovernanceEvidenceV1(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringifyGovernanceEvidenceV1(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringifyGovernanceEvidenceV1(record[k])}`).join(',')}}`;
}

export function hashRepositoryMergeEvidenceFingerprintV1(
  evidence: Pick<
    M3_3HvH4A3RepositoryMergeEvidenceV1,
    | 'contractVersion'
    | 'evidenceSource'
    | 'repositoryFullName'
    | 'pullRequestNumber'
    | 'mergeCommitSha'
    | 'merged'
    | 'mergedAtUtc'
    | 'acquiredAtUtc'
  >,
): string {
  return createHash('sha256').update(stableStringifyGovernanceEvidenceV1(evidence), 'utf8').digest('hex');
}

function signingPayloadV1<T extends { contractVersion: string; signature: unknown }>(
  signingDomain: string,
  body: T,
): { signingDomain: string; signingHeader: { contractVersion: string; signatureAlgorithm: 'Ed25519'; signingKeyId: string }; attestationBody: Omit<T, 'signature'> } {
  const { signature, ...rest } = body;
  return {
    signingDomain,
    signingHeader: {
      contractVersion: body.contractVersion,
      signatureAlgorithm: 'Ed25519',
      signingKeyId: (signature as { keyId: string }).keyId,
    },
    attestationBody: rest as Omit<T, 'signature'>,
  };
}

export function hashGovernanceRatificationAttestationSigningPayloadV1(
  attestation: M3_3HvH4A3GovernanceRatificationAttestationV1,
): Buffer {
  const payload = signingPayloadV1(
    M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_SIGNING_DOMAIN_V1,
    attestation,
  );
  return createHash('sha256').update(stableStringifyGovernanceEvidenceV1(payload), 'utf8').digest();
}

export function hashGovernanceOperatorRiskAttestationSigningPayloadV1(
  attestation: M3_3HvH4A3GovernanceOperatorRiskAttestationV1,
): Buffer {
  const payload = signingPayloadV1(
    M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_SIGNING_DOMAIN_V1,
    attestation,
  );
  return createHash('sha256').update(stableStringifyGovernanceEvidenceV1(payload), 'utf8').digest();
}

export function hashDeploymentIdentityEvidenceSigningPayloadV1(
  evidence: M3_3HvH4A3DeploymentIdentityEvidenceV1,
): Buffer {
  const payload = signingPayloadV1(M3_3_HV_H4_A3_GOVERNANCE_DEPLOYMENT_PROBE_SIGNING_DOMAIN_V1, evidence);
  return createHash('sha256').update(stableStringifyGovernanceEvidenceV1(payload), 'utf8').digest();
}

export function hashPostgresTargetEvidenceSigningPayloadV1(
  evidence: M3_3HvH4A3PostgresTargetEvidenceV1,
): Buffer {
  const payload = signingPayloadV1(M3_3_HV_H4_A3_GOVERNANCE_POSTGRES_TARGET_SIGNING_DOMAIN_V1, evidence);
  return createHash('sha256').update(stableStringifyGovernanceEvidenceV1(payload), 'utf8').digest();
}
