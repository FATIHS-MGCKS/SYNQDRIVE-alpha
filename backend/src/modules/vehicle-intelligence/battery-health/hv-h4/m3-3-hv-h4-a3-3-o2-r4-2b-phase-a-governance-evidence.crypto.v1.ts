import { createPublicKey, verify, type KeyObject } from 'node:crypto';
import { materializeEd25519TrustSpkiV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.crypto-trust.v1';
import { parseUtcInstantStrictV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.utc-instant.v1';
import type {
  M3_3HvH4A3GovernanceSignedAttestationV1,
  M3_3HvH4A3GovernanceTrustStoreV1,
  M3_3HvH4A3GovernanceTrustedPublicKeyV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.types.v1';

function resolveGovernanceTrustKeyV1(
  trustStore: M3_3HvH4A3GovernanceTrustStoreV1,
  keyId: string,
  issuerPurpose: M3_3HvH4A3GovernanceTrustedPublicKeyV1['issuerPurpose'],
  now: Date,
): { ok: true; publicKey: KeyObject } | { ok: false; reasonCode: string } {
  if (trustStore.revokedKeyIds.includes(keyId)) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_TRUST_KEY_REVOKED' };
  }
  const entry = trustStore.keys.find((k) => k.keyId === keyId && k.issuerPurpose === issuerPurpose);
  if (!entry) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_TRUST_KEY_NOT_FOUND' };
  }
  if (entry.notBeforeUtc) {
    const notBefore = parseUtcInstantStrictV1(entry.notBeforeUtc);
    if (!notBefore || now < notBefore) {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_TRUST_KEY_NOT_YET_VALID' };
    }
  }
  if (entry.notAfterUtc) {
    const notAfter = parseUtcInstantStrictV1(entry.notAfterUtc);
    if (!notAfter || now > notAfter) {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_TRUST_KEY_EXPIRED' };
    }
  }
  const materialized = materializeEd25519TrustSpkiV1(entry.publicKeySpkiBase64);
  if (!materialized.ok) {
    return { ok: false, reasonCode: materialized.reasonCode };
  }
  return { ok: true, publicKey: materialized.value.publicKey };
}

export function verifyGovernanceEd25519SignatureV1(
  trustStore: M3_3HvH4A3GovernanceTrustStoreV1,
  issuerPurpose: M3_3HvH4A3GovernanceTrustedPublicKeyV1['issuerPurpose'],
  signature: M3_3HvH4A3GovernanceSignedAttestationV1,
  digest: Buffer,
  now: Date,
): { ok: true } | { ok: false; reasonCode: string } {
  if (signature.algorithm !== 'Ed25519' || signature.keyId !== signature.keyId.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_INVALID' };
  }
  const key = resolveGovernanceTrustKeyV1(trustStore, signature.keyId, issuerPurpose, now);
  if (!key.ok) return key;
  try {
    const detached = Buffer.from(signature.detachedBase64, 'base64');
    if (detached.length !== 64) {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_MALFORMED' };
    }
    const valid = verify(null, digest, key.publicKey, detached);
    if (!valid) {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_VERIFY_FAILED' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_MALFORMED' };
  }
}
