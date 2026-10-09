import { createHash } from 'node:crypto';
import { M3_3_HV_H4_A3_PHASE_A_QUERY_MANIFEST_V1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.query-manifest.v1';
import {
  M3_3_HV_H4_A3_PHASE_A_P1_AUTHORIZATION_PURPOSE_V1,
  M3_3_HV_H4_A3_PHASE_A_P1_AUTHORIZATION_SCOPE_V1,
  M3_3_HV_H4_A3_PHASE_A_P1_TRUSTED_AUTHORIZATION_SIGNING_DOMAIN_V1,
  type M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.types.v1';

function stableStringifyV1(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringifyV1(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringifyV1(record[k])}`).join(',')}}`;
}

/** SHA-256 hex over stable manifest id + per-statement sql hashes. */
export function computePhaseAQueryManifestFingerprintV1(): string {
  const ids = Object.keys(M3_3_HV_H4_A3_PHASE_A_QUERY_MANIFEST_V1).sort() as Array<
    keyof typeof M3_3_HV_H4_A3_PHASE_A_QUERY_MANIFEST_V1
  >;
  const entries = ids.map((id) => {
    const sql = M3_3_HV_H4_A3_PHASE_A_QUERY_MANIFEST_V1[id];
    const sqlSha256 = createHash('sha256').update(sql, 'utf8').digest('hex');
    return { id, sqlSha256 };
  });
  return createHash('sha256').update(stableStringifyV1(entries), 'utf8').digest('hex');
}

export type PhaseAP1TrustedAuthorizationSigningPayloadV1 = {
  signingDomain: typeof M3_3_HV_H4_A3_PHASE_A_P1_TRUSTED_AUTHORIZATION_SIGNING_DOMAIN_V1;
  signingHeader: {
    contractVersion: M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1['contractVersion'];
    signatureAlgorithm: 'Ed25519';
    signingKeyId: string;
    authorizationPurpose: typeof M3_3_HV_H4_A3_PHASE_A_P1_AUTHORIZATION_PURPOSE_V1;
    authorizationScope: typeof M3_3_HV_H4_A3_PHASE_A_P1_AUTHORIZATION_SCOPE_V1;
  };
  authorizationBody: Omit<M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1, 'signature'>;
};

/**
 * Domain-separated signed payload: binds algorithm, key id, contract version, purpose, scope,
 * and authorization body. Only `signature.detachedBase64` is excluded from the signed material.
 */
export function buildPhaseAP1TrustedAuthorizationSigningPayloadV1(
  artifact: M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1,
): PhaseAP1TrustedAuthorizationSigningPayloadV1 {
  const { signature, ...authorizationBody } = artifact;
  return {
    signingDomain: M3_3_HV_H4_A3_PHASE_A_P1_TRUSTED_AUTHORIZATION_SIGNING_DOMAIN_V1,
    signingHeader: {
      contractVersion: artifact.contractVersion,
      signatureAlgorithm: signature.algorithm,
      signingKeyId: signature.keyId,
      authorizationPurpose: M3_3_HV_H4_A3_PHASE_A_P1_AUTHORIZATION_PURPOSE_V1,
      authorizationScope: M3_3_HV_H4_A3_PHASE_A_P1_AUTHORIZATION_SCOPE_V1,
    },
    authorizationBody,
  };
}

export function hashPhaseAP1TrustedAuthorizationSigningPayloadV1(
  artifact: M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1,
): Buffer {
  const payload = buildPhaseAP1TrustedAuthorizationSigningPayloadV1(artifact);
  const canonical = stableStringifyV1(payload);
  return createHash('sha256').update(canonical, 'utf8').digest();
}
