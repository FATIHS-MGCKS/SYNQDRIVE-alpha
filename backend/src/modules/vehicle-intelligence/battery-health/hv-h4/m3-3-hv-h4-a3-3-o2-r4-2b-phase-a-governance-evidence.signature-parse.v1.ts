import type { M3_3HvH4A3GovernanceSignedAttestationV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.types.v1';

/** Canonical Base64 length for a 64-byte Ed25519 detached signature (RFC 4648, padded). */
export const M3_3_HV_H4_A3_GOVERNANCE_ED25519_DETACHED_BASE64_LENGTH_V1 = 88;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Decodes governance Ed25519 detached signatures only.
 * Fail-closed canonical Base64: padded, byte-for-byte round-trip, no whitespace, no padding-bit aliases.
 */
function decodeCanonicalEd25519DetachedBase64V1(
  input: string,
): { ok: true; bytes: Buffer } | { ok: false; reasonCode: string } {
  if (typeof input !== 'string') {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_MALFORMED' };
  }
  if (input.length !== M3_3_HV_H4_A3_GOVERNANCE_ED25519_DETACHED_BASE64_LENGTH_V1) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_MALFORMED' };
  }
  if (/\s/.test(input)) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_MALFORMED' };
  }
  if (input.length % 4 !== 0) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_MALFORMED' };
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input)) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_MALFORMED' };
  }
  try {
    const bytes = Buffer.from(input, 'base64');
    if (bytes.length !== 64) {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_MALFORMED' };
    }
    const roundTrip = bytes.toString('base64');
    if (roundTrip !== input) {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_MALFORMED' };
    }
    return { ok: true, bytes };
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_MALFORMED' };
  }
}

/**
 * Validates governance Ed25519 signature envelope before canonical verification.
 * Fail-closed — never throws; does not normalize keyId or detachedBase64.
 */
export function parseGovernanceSignedAttestationV1(
  value: unknown,
): { ok: true; signature: M3_3HvH4A3GovernanceSignedAttestationV1 } | { ok: false; reasonCode: string } {
  try {
    if (!isRecord(value)) {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_INVALID' };
    }
    if (value.algorithm !== 'Ed25519') {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_INVALID' };
    }
    if (typeof value.keyId !== 'string') {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_INVALID' };
    }
    const keyId = value.keyId;
    if (!keyId || keyId !== keyId.trim()) {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_INVALID' };
    }
    if (typeof value.detachedBase64 !== 'string') {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_MALFORMED' };
    }
    const detached = decodeCanonicalEd25519DetachedBase64V1(value.detachedBase64);
    if (!detached.ok) {
      return detached;
    }
    return {
      ok: true,
      signature: {
        algorithm: 'Ed25519',
        keyId,
        detachedBase64: value.detachedBase64,
      },
    };
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_MALFORMED' };
  }
}
