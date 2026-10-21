import { createHash, generateKeyPairSync } from 'node:crypto';
import { parsePhaseAP1TrustStoreV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.parse.v1';
import {
  canonicalBase64FromBytesV1,
  materializeEd25519TrustSpkiV1,
  parseEd25519TrustSpkiBase64V1,
  sha256HexFingerprintV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.crypto-trust.v1';
import { M3_3_HV_H4_A3_PHASE_A_P1_TRUST_STORE_CONTRACT_V1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.types.v1';

/** Outer SEQUENCE short-form length → long-form 0x81 <len> (Node accepts; export is canonical). */
function buildLongFormOuterSequenceSpkiV1(canonicalDer: Buffer): Buffer {
  if (canonicalDer[0] !== 0x30 || canonicalDer[1] >= 0x80) {
    throw new Error('unexpected SPKI shape for long-form test fixture');
  }
  const contentLength = canonicalDer[1];
  const body = canonicalDer.subarray(2);
  return Buffer.concat([Buffer.from([0x30, 0x81, contentLength]), body]);
}

describe('materializeEd25519TrustSpkiV1 canonical DER (H3)', () => {
  it('accepts canonical Ed25519 SPKI export', () => {
    const { publicKey } = generateKeyPairSync('ed25519');
    const der = publicKey.export({ type: 'spki', format: 'der' });
    const b64 = canonicalBase64FromBytesV1(der);
    const result = materializeEd25519TrustSpkiV1(b64);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.der.length).toBe(44);
      expect(result.value.spkiSha256Hex).toBe(sha256HexFingerprintV1(Buffer.from(der)));
    }
  });

  it('rejects SPKI with trailing zero bytes (H3)', () => {
    const { publicKey } = generateKeyPairSync('ed25519');
    const der = publicKey.export({ type: 'spki', format: 'der' });
    const trailing = Buffer.concat([Buffer.from(der), Buffer.from([0])]);
    const trailingB64 = canonicalBase64FromBytesV1(trailing);
    expect(trailingB64).not.toBe(canonicalBase64FromBytesV1(der));
    const result = materializeEd25519TrustSpkiV1(trailingB64);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasonCode).toBe('PHASE_A_P1_TRUST_KEY_SPKI_DER_NONCANONICAL');
    }
  });

  it('rejects alternate ASN.1 length encoding accepted by Node parser (H3)', () => {
    const { publicKey } = generateKeyPairSync('ed25519');
    const der = publicKey.export({ type: 'spki', format: 'der' });
    const longForm = buildLongFormOuterSequenceSpkiV1(Buffer.from(der));
    expect(longForm.length).toBe(der.length + 1);
    const result = materializeEd25519TrustSpkiV1(canonicalBase64FromBytesV1(longForm));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasonCode).toBe('PHASE_A_P1_TRUST_KEY_SPKI_DER_NONCANONICAL');
    }
  });

  it('shows Base64 canonicality alone does not imply canonical DER (H3)', () => {
    const { publicKey } = generateKeyPairSync('ed25519');
    const der = publicKey.export({ type: 'spki', format: 'der' });
    const trailing = Buffer.concat([Buffer.from(der), Buffer.from([0])]);
    const trailingCanonicalB64 = canonicalBase64FromBytesV1(trailing);
    const rawFp = sha256HexFingerprintV1(trailing);
    const canonicalFp = sha256HexFingerprintV1(Buffer.from(der));
    expect(rawFp).not.toBe(canonicalFp);
    const parsed = materializeEd25519TrustSpkiV1(trailingCanonicalB64);
    expect(parsed.ok).toBe(false);
  });

  it('accepts two distinct valid Ed25519 keys', () => {
    const a = generateKeyPairSync('ed25519');
    const b = generateKeyPairSync('ed25519');
    expect(materializeEd25519TrustSpkiV1(canonicalBase64FromBytesV1(a.publicKey.export({ type: 'spki', format: 'der' }))).ok).toBe(
      true,
    );
    expect(materializeEd25519TrustSpkiV1(canonicalBase64FromBytesV1(b.publicKey.export({ type: 'spki', format: 'der' }))).ok).toBe(
      true,
    );
  });
});

describe('parseEd25519TrustSpkiBase64V1', () => {
  it('rejects non-canonical Base64 encodings of the same SPKI bytes (H2)', () => {
    const { publicKey } = generateKeyPairSync('ed25519');
    const der = publicKey.export({ type: 'spki', format: 'der' });
    const canonical = canonicalBase64FromBytesV1(der);
    const unpadded = canonical.replace(/=+$/, '');

    expect(parseEd25519TrustSpkiBase64V1(canonical).ok).toBe(true);
    const unpaddedResult = parseEd25519TrustSpkiBase64V1(unpadded);
    expect(unpaddedResult.ok).toBe(false);
    if (!unpaddedResult.ok) {
      expect(unpaddedResult.reasonCode).toBe('PHASE_A_P1_TRUST_KEY_SPKI_BASE64_NONCANONICAL');
    }
  });
});

describe('parsePhaseAP1TrustStoreV1 SPKI deduplication', () => {
  it('rejects padded vs unpadded duplicate Ed25519 aliases under different key IDs (H2)', () => {
    const { publicKey } = generateKeyPairSync('ed25519');
    const der = publicKey.export({ type: 'spki', format: 'der' });
    const canonical = canonicalBase64FromBytesV1(der);
    const unpadded = canonical.replace(/=+$/, '');

    const parsed = parsePhaseAP1TrustStoreV1({
      contractVersion: M3_3_HV_H4_A3_PHASE_A_P1_TRUST_STORE_CONTRACT_V1,
      keys: [
        { keyId: 'operator-key-1', publicKeySpkiBase64: canonical },
        { keyId: 'operator-key-alias', publicKeySpkiBase64: unpadded },
      ],
      revokedKeyIds: [],
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect([
        'PHASE_A_P1_TRUST_STORE_DUPLICATE_KEY_ALIAS',
        'PHASE_A_P1_TRUST_KEY_SPKI_BASE64_NONCANONICAL',
      ]).toContain(parsed.reasonCode);
    }
  });

  it('rejects trailing-DER alias under alternate keyId (cannot bypass revocation) (H3)', () => {
    const { publicKey } = generateKeyPairSync('ed25519');
    const der = publicKey.export({ type: 'spki', format: 'der' });
    const canonical = canonicalBase64FromBytesV1(der);
    const trailing = Buffer.concat([Buffer.from(der), Buffer.from([0])]);
    const trailingB64 = canonicalBase64FromBytesV1(trailing);

    const parsed = parsePhaseAP1TrustStoreV1({
      contractVersion: M3_3_HV_H4_A3_PHASE_A_P1_TRUST_STORE_CONTRACT_V1,
      keys: [
        { keyId: 'operator-key-1', publicKeySpkiBase64: canonical },
        { keyId: 'operator-key-bypass', publicKeySpkiBase64: trailingB64 },
      ],
      revokedKeyIds: ['operator-key-1'],
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect([
        'PHASE_A_P1_TRUST_STORE_DUPLICATE_KEY_ALIAS',
        'PHASE_A_P1_TRUST_KEY_SPKI_DER_NONCANONICAL',
      ]).toContain(parsed.reasonCode);
    }
  });

  it('rejects long-form DER alias under alternate keyId (H3)', () => {
    const { publicKey } = generateKeyPairSync('ed25519');
    const der = Buffer.from(publicKey.export({ type: 'spki', format: 'der' }));
    const canonical = canonicalBase64FromBytesV1(der);
    const longFormB64 = canonicalBase64FromBytesV1(buildLongFormOuterSequenceSpkiV1(der));

    const parsed = parsePhaseAP1TrustStoreV1({
      contractVersion: M3_3_HV_H4_A3_PHASE_A_P1_TRUST_STORE_CONTRACT_V1,
      keys: [
        { keyId: 'operator-key-1', publicKeySpkiBase64: canonical },
        { keyId: 'operator-key-bypass', publicKeySpkiBase64: longFormB64 },
      ],
      revokedKeyIds: ['operator-key-1'],
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reasonCode).toBe('PHASE_A_P1_TRUST_KEY_SPKI_DER_NONCANONICAL');
  });
});

describe('fingerprint uses canonical DER only (H3)', () => {
  it('differs for trailing-byte encoding vs canonical export', () => {
    const { publicKey } = generateKeyPairSync('ed25519');
    const der = Buffer.from(publicKey.export({ type: 'spki', format: 'der' }));
    const trailing = Buffer.concat([der, Buffer.from([0])]);
    expect(createHash('sha256').update(trailing).digest('hex')).not.toBe(
      createHash('sha256').update(der).digest('hex'),
    );
    const materialized = materializeEd25519TrustSpkiV1(canonicalBase64FromBytesV1(der));
    expect(materialized.ok).toBe(true);
    if (materialized.ok) {
      expect(materialized.value.spkiSha256Hex).toBe(sha256HexFingerprintV1(der));
    }
  });
});
