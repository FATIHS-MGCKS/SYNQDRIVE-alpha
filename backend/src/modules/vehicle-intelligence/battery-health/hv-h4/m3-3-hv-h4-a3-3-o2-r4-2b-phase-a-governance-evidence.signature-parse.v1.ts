import type { M3_3HvH4A3GovernanceSignedAttestationV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.types.v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeCanonicalBase64V1(
  input: string,
): { ok: true; bytes: Buffer } | { ok: false; reasonCode: string } {
  if (typeof input !== 'string' || input.length < 4 || input.length > 512) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_MALFORMED' };
  }
  const trimmed = input.trim();
  if (!trimmed || trimmed !== input.replace(/\s/g, '')) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_MALFORMED' };
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_MALFORMED' };
  }
  if (trimmed.length % 4 === 1) {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_MALFORMED' };
  }
  try {
    const bytes = Buffer.from(trimmed, 'base64');
    if (bytes.length === 0) {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_MALFORMED' };
    }
    return { ok: true, bytes };
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_MALFORMED' };
  }
}

/**
 * Validates governance Ed25519 signature envelope before canonical verification.
 * Fail-closed — never throws.
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
    const keyId = value.keyId.trim();
    if (!keyId) {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_INVALID' };
    }
    if (typeof value.detachedBase64 !== 'string') {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_MALFORMED' };
    }
    const detached = decodeCanonicalBase64V1(value.detachedBase64);
    if (!detached.ok) {
      return detached;
    }
    if (detached.bytes.length !== 64) {
      return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_MALFORMED' };
    }
    return {
      ok: true,
      signature: {
        algorithm: 'Ed25519',
        keyId,
        detachedBase64: value.detachedBase64.trim(),
      },
    };
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_SIGNATURE_MALFORMED' };
  }
}
