import { generateKeyPairSync } from 'node:crypto';
import { parsePhaseAP1TrustStoreV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.parse.v1';
import {
  canonicalBase64FromBytesV1,
  parseEd25519TrustSpkiBase64V1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.crypto-trust.v1';
import { M3_3_HV_H4_A3_PHASE_A_P1_TRUST_STORE_CONTRACT_V1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.types.v1';

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
    if (!parsed.ok) expect(parsed.reasonCode).toBe('PHASE_A_P1_TRUST_STORE_DUPLICATE_KEY_ALIAS');
  });
});
