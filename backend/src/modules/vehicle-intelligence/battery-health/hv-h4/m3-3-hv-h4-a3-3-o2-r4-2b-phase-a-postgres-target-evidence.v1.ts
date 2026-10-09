import { hashPostgresTargetEvidenceSigningPayloadV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.canonical.v1';
import { verifyGovernanceEd25519SignatureV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.crypto.v1';
import {
  M3_3_HV_H4_A3_POSTGRES_TARGET_EVIDENCE_CONTRACT_V1,
  type M3_3HvH4A3GovernanceTrustStoreV1,
  type M3_3HvH4A3PostgresTargetEvidenceV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.types.v1';
import { parseUtcInstantStrictV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.utc-instant.v1';

export type M3_3HvH4A3PostgresTargetEvidenceVerifyResultV1 =
  | {
      ok: true;
      offlineVerified: true;
      verificationStatus: 'TARGET_CONFIGURATION_MATCHED';
      liveDatabaseRoleVerified: false;
    }
  | { ok: false; reasonCode: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parsePostgresTargetEvidenceV1(
  parsed: unknown,
): { ok: true; evidence: M3_3HvH4A3PostgresTargetEvidenceV1 } | { ok: false; reasonCode: string } {
  if (!isRecord(parsed) || parsed.contractVersion !== M3_3_HV_H4_A3_POSTGRES_TARGET_EVIDENCE_CONTRACT_V1) {
    return { ok: false, reasonCode: 'PHASE_A_POSTGRES_TARGET_EVIDENCE_INVALID' };
  }
  if (parsed.verificationStatus === 'LIVE_DATABASE_ROLE_VERIFIED') {
    return { ok: false, reasonCode: 'PHASE_A_POSTGRES_TARGET_LIVE_ROLE_CLAIM_FORBIDDEN_IN_A1' };
  }
  if (parsed.verificationStatus !== 'TARGET_CONFIGURATION_MATCHED') {
    return { ok: false, reasonCode: 'PHASE_A_POSTGRES_TARGET_EVIDENCE_INVALID' };
  }
  return { ok: true, evidence: parsed as M3_3HvH4A3PostgresTargetEvidenceV1 };
}

export function verifyPostgresTargetEvidenceOfflineV1(
  input: {
    trustStore: M3_3HvH4A3GovernanceTrustStoreV1;
    evidence: M3_3HvH4A3PostgresTargetEvidenceV1;
    expected: {
      hostname: string;
      port: number;
      database: string;
      auditRoleLogin: string;
    };
    now: Date;
    seenEvidenceNonces?: Set<string>;
  },
): M3_3HvH4A3PostgresTargetEvidenceVerifyResultV1 {
  const { evidence, now } = input;
  const issued = parseUtcInstantStrictV1(evidence.issuedAtUtc);
  const expires = parseUtcInstantStrictV1(evidence.expiresAtUtc);
  if (!issued || !expires || expires <= issued || now < issued || now > expires) {
    return { ok: false, reasonCode: 'PHASE_A_POSTGRES_TARGET_EVIDENCE_EXPIRED' };
  }
  if (input.seenEvidenceNonces?.has(evidence.evidenceNonce)) {
    return { ok: false, reasonCode: 'PHASE_A_POSTGRES_TARGET_EVIDENCE_NONCE_REPLAY' };
  }

  const digest = hashPostgresTargetEvidenceSigningPayloadV1(evidence);
  const sig = verifyGovernanceEd25519SignatureV1(
    input.trustStore,
    'POSTGRES_TARGET',
    evidence.signature,
    digest,
    now,
  );
  if (!sig.ok) return sig;

  if (
    evidence.hostname !== input.expected.hostname ||
    evidence.port !== input.expected.port ||
    evidence.database !== input.expected.database ||
    evidence.auditRoleLogin !== input.expected.auditRoleLogin
  ) {
    return { ok: false, reasonCode: 'PHASE_A_POSTGRES_TARGET_IDENTITY_MISMATCH' };
  }

  input.seenEvidenceNonces?.add(evidence.evidenceNonce);
  return {
    ok: true,
    offlineVerified: true,
    verificationStatus: 'TARGET_CONFIGURATION_MATCHED',
    liveDatabaseRoleVerified: false,
  };
}
