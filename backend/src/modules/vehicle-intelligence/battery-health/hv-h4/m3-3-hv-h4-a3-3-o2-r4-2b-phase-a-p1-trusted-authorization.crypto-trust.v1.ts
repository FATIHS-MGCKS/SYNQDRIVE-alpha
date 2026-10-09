import { createHash, createPublicKey, type KeyObject } from 'node:crypto';

export function sha256HexFingerprintV1(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function decodeBase64ToBytesV1(
  input: string,
): { ok: true; bytes: Buffer } | { ok: false; reasonCode: string } {
  if (typeof input !== 'string' || input.length < 4 || input.length > 512) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_KEY_MALFORMED' };
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input)) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_KEY_MALFORMED' };
  }
  if (input.length % 4 === 1) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_KEY_MALFORMED' };
  }
  try {
    const bytes = Buffer.from(input, 'base64');
    if (bytes.length === 0) {
      return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_KEY_MALFORMED' };
    }
    return { ok: true, bytes };
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_KEY_MALFORMED' };
  }
}

/** RFC-style canonical Base64 (Node `Buffer#toString('base64')` with padding). */
export function canonicalBase64FromBytesV1(bytes: Buffer): string {
  return bytes.toString('base64');
}

export function exportCanonicalEd25519SpkiDerV1(publicKey: KeyObject): Buffer {
  const exported = publicKey.export({ type: 'spki', format: 'der' });
  return Buffer.from(exported);
}

function buffersEqualV1(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && a.equals(b);
}

export type ParsedEd25519TrustSpkiV1 = {
  der: Buffer;
  spkiSha256Hex: string;
  canonicalSpkiBase64: string;
  publicKey: KeyObject;
};

/**
 * Decode and validate Ed25519 SPKI trust material.
 * Input DER must exactly match Node's canonical SPKI export (no trailing bytes / alternate ASN.1).
 */
export function materializeEd25519TrustSpkiV1(
  publicKeySpkiBase64: string,
): { ok: true; value: ParsedEd25519TrustSpkiV1 } | { ok: false; reasonCode: string } {
  const decoded = decodeBase64ToBytesV1(publicKeySpkiBase64);
  if (!decoded.ok) return decoded;

  const inputDer = decoded.bytes;

  try {
    const publicKey = createPublicKey({ key: inputDer, format: 'der', type: 'spki' });
    if (publicKey.asymmetricKeyType !== 'ed25519') {
      return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_KEY_TYPE_UNSUPPORTED' };
    }

    const canonicalDer = exportCanonicalEd25519SpkiDerV1(publicKey);
    if (!buffersEqualV1(inputDer, canonicalDer)) {
      return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_KEY_SPKI_DER_NONCANONICAL' };
    }

    const canonicalSpkiBase64 = canonicalBase64FromBytesV1(canonicalDer);
    const spkiSha256Hex = sha256HexFingerprintV1(canonicalDer);

    return {
      ok: true,
      value: {
        der: canonicalDer,
        spkiSha256Hex,
        canonicalSpkiBase64,
        publicKey,
      },
    };
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_KEY_MALFORMED' };
  }
}

export function parseEd25519TrustSpkiBase64V1(
  publicKeySpkiBase64: string,
): { ok: true; value: ParsedEd25519TrustSpkiV1 } | { ok: false; reasonCode: string } {
  const materialized = materializeEd25519TrustSpkiV1(publicKeySpkiBase64);
  if (!materialized.ok) return materialized;
  if (publicKeySpkiBase64 !== materialized.value.canonicalSpkiBase64) {
    return { ok: false, reasonCode: 'PHASE_A_P1_TRUST_KEY_SPKI_BASE64_NONCANONICAL' };
  }
  return materialized;
}
