import { createHash } from 'crypto';
import {
  buildM3_3HvH4ChargeSessionEvidenceCanonicalUtf8V1,
  computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1,
} from './m3-3-hv-h4-a3-charge-session-evidence-fingerprint.v1';
import {
  buildRandomizedBinary64ProjectionVectorsV1,
  generateDeterministicBinary64EnergyValuesV1,
  M3_3_HV_H4_A3_O2_R2_DECIMAL_SAFE_NUMERIC_VECTORS_V1,
  M3_3_HV_H4_A3_O2_R2_EXPLICIT_NUMERIC_BOUNDARY_VECTORS_V1,
} from './m3-3-hv-h4-a3-3-o2-r2-numeric-parity.harness.v1';

describe('M3.3-HV-H4-A3.3-O2-R2 ECMAScript canonical numeric authority (TS-only)', () => {
  it('decimal-safe FINITE energy vectors are self-consistent under JSON.stringify tuple authority', () => {
    for (const vector of M3_3_HV_H4_A3_O2_R2_DECIMAL_SAFE_NUMERIC_VECTORS_V1) {
      const utf8 = buildM3_3HvH4ChargeSessionEvidenceCanonicalUtf8V1(vector.projection);
      const sha = computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(vector.projection);
      const nodeSha = createHash('sha256').update(utf8, 'utf8').digest('hex');
      expect(sha).toBe(nodeSha);
    }
  });

  it('deterministic randomized binary64 corpus is stable across runs', () => {
    const a = generateDeterministicBinary64EnergyValuesV1(64, 42);
    const b = generateDeterministicBinary64EnergyValuesV1(64, 42);
    expect(a).toEqual(b);
    expect(a.length).toBe(64);
  });

  it('randomized binary64 projections fingerprint without throwing', () => {
    const vectors = buildRandomizedBinary64ProjectionVectorsV1(128, 99);
    for (const vector of vectors) {
      expect(() =>
        computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(vector.projection),
      ).not.toThrow();
    }
  });

  it('explicit exponent/boundary corpus documents non-decimal-safe numeric surface', () => {
    expect(M3_3_HV_H4_A3_O2_R2_EXPLICIT_NUMERIC_BOUNDARY_VECTORS_V1.length).toBeGreaterThan(0);
  });
});
