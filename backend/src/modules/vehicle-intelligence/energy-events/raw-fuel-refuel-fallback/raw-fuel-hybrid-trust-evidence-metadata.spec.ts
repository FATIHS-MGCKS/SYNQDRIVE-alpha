import { RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION } from './raw-fuel-hybrid-absolute-signal-trust.authority';
import {
  HYBRID_ABSOLUTE_SIGNAL_TRUST_EVIDENCE_META_KEY,
  buildHybridAbsoluteSignalTrustEvidence,
  inspectHybridAbsoluteSignalTrustEvidence,
  parseHybridAbsoluteSignalTrustEvidenceBlock,
  readHybridAbsoluteSignalTrustEvidence,
} from './raw-fuel-hybrid-trust-evidence-metadata';

function validHybridBlock(overrides: Record<string, unknown> = {}) {
  const hybrid = buildHybridAbsoluteSignalTrustEvidence(
    {
      authorityVersion: RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION,
      classification: 'UNKNOWN',
      reasonCode: 'RELATIVE_COVERAGE_INSUFFICIENT',
      absoluteDetectionAdmissibility: 'ADMISSIBLE',
      relativeSampleCoverage: 'PARTIAL',
      baselineRecencyClassification: 'FRESH',
      absoluteDeltaLiters: 9,
      relativeDeltaPercent: null,
      materialRiseLiters: 5,
      materialRisePercent: 5,
      relativePrePlateauLocal: 'INVALID',
      relativePostPlateauLocal: 'UNKNOWN',
      absolutePostPlateauLocal: 'VALID',
    },
    {
      relativePrePlateauLocal: 'INVALID',
      relativePostPlateauLocal: 'UNKNOWN',
      absolutePostPlateauLocal: 'VALID',
    },
  );
  return { ...hybrid, ...overrides };
}

describe('readHybridAbsoluteSignalTrustEvidence (strict runtime boundary)', () => {
  it('returns null for missing evidenceMeta', () => {
    expect(readHybridAbsoluteSignalTrustEvidence(null)).toBeNull();
    expect(inspectHybridAbsoluteSignalTrustEvidence(null).kind).toBe('missing');
  });

  it('returns null for missing hybrid block key', () => {
    expect(readHybridAbsoluteSignalTrustEvidence({})).toBeNull();
    expect(inspectHybridAbsoluteSignalTrustEvidence({}).kind).toBe('missing');
  });

  it('accepts a fully valid block', () => {
    const block = validHybridBlock();
    const meta = { [HYBRID_ABSOLUTE_SIGNAL_TRUST_EVIDENCE_META_KEY]: block };
    expect(readHybridAbsoluteSignalTrustEvidence(meta)).toEqual(block);
    expect(inspectHybridAbsoluteSignalTrustEvidence(meta).kind).toBe('ok');
  });

  it('rejects invalid relativeSampleCoverage', () => {
    const meta = {
      [HYBRID_ABSOLUTE_SIGNAL_TRUST_EVIDENCE_META_KEY]: validHybridBlock({
        relativeSampleCoverage: 'BROKEN',
      }),
    };
    expect(readHybridAbsoluteSignalTrustEvidence(meta)).toBeNull();
    expect(inspectHybridAbsoluteSignalTrustEvidence(meta).kind).toBe('malformed');
  });

  it('rejects invalid baselineRecencyClassification string', () => {
    const meta = {
      [HYBRID_ABSOLUTE_SIGNAL_TRUST_EVIDENCE_META_KEY]: validHybridBlock({
        baselineRecencyClassification: 'ARBITRARY',
      }),
    };
    expect(inspectHybridAbsoluteSignalTrustEvidence(meta).kind).toBe('malformed');
  });

  it('rejects missing locality fields', () => {
    const block = validHybridBlock();
    const { relativePrePlateauLocal: _a, ...withoutPre } = block;
    expect(parseHybridAbsoluteSignalTrustEvidenceBlock(withoutPre)).toBeNull();
  });

  it('rejects invalid locality string', () => {
    const meta = {
      [HYBRID_ABSOLUTE_SIGNAL_TRUST_EVIDENCE_META_KEY]: validHybridBlock({
        relativePostPlateauLocal: 'MAYBE',
      }),
    };
    expect(inspectHybridAbsoluteSignalTrustEvidence(meta).kind).toBe('malformed');
  });

  it('rejects non-finite absoluteDeltaLiters', () => {
    const meta = {
      [HYBRID_ABSOLUTE_SIGNAL_TRUST_EVIDENCE_META_KEY]: validHybridBlock({
        absoluteDeltaLiters: Number.NaN,
      }),
    };
    expect(inspectHybridAbsoluteSignalTrustEvidence(meta).kind).toBe('malformed');
  });

  it('rejects non-finite relativeDeltaPercent', () => {
    const meta = {
      [HYBRID_ABSOLUTE_SIGNAL_TRUST_EVIDENCE_META_KEY]: validHybridBlock({
        relativeDeltaPercent: '10' as unknown as number,
      }),
    };
    expect(inspectHybridAbsoluteSignalTrustEvidence(meta).kind).toBe('malformed');
  });

  it('rejects materialRiseLiters NaN', () => {
    const meta = {
      [HYBRID_ABSOLUTE_SIGNAL_TRUST_EVIDENCE_META_KEY]: validHybridBlock({
        materialRiseLiters: Number.NaN,
      }),
    };
    expect(inspectHybridAbsoluteSignalTrustEvidence(meta).kind).toBe('malformed');
  });

  it('rejects materialRisePercent Infinity', () => {
    const meta = {
      [HYBRID_ABSOLUTE_SIGNAL_TRUST_EVIDENCE_META_KEY]: validHybridBlock({
        materialRisePercent: Number.POSITIVE_INFINITY,
      }),
    };
    expect(inspectHybridAbsoluteSignalTrustEvidence(meta).kind).toBe('malformed');
  });

  it('rejects arbitrary reasonCode', () => {
    const meta = {
      [HYBRID_ABSOLUTE_SIGNAL_TRUST_EVIDENCE_META_KEY]: validHybridBlock({
        reasonCode: 'NOT_A_REAL_REASON',
      }),
    };
    expect(inspectHybridAbsoluteSignalTrustEvidence(meta).kind).toBe('malformed');
  });

  it('allows null delta fields', () => {
    const block = validHybridBlock({
      absoluteDeltaLiters: null,
      relativeDeltaPercent: null,
    });
    expect(parseHybridAbsoluteSignalTrustEvidenceBlock(block)).toEqual(block);
  });
});
