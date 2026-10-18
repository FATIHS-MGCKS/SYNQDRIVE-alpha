import {
  buildShadowEvidenceByBucket,
  summarizeShadowEvidenceCompleteness,
} from '../di-v0-s4-research-shadow-evidence';

describe('di-v0-s4-research shadow evidence', () => {
  it('maps motion and QC without inventing values', () => {
    const start = new Date('2026-01-01T12:00:00.000Z');
    const map = buildShadowEvidenceByBucket([
      {
        intervalStart: start,
        estimatedSpeedKmh: 42,
        motionState: 'MOVING',
        speedEvidenceState: 'TRUSTED',
        valueConfidence: 'HIGH',
      },
    ]);
    const key = start.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const row = map.get(key);
    expect(row?.motionState).toBe('MOVING');
    expect(row?.qcTrustLevel).toBe('TRUSTED');
    expect(row?.l3SpeedKmh).toBe(42);
  });

  it('flags incomplete evidence when shadow rows missing', () => {
    const summary = summarizeShadowEvidenceCompleteness(['2026-01-01T12:00:00.000Z'], new Map());
    expect(summary.evidenceIncomplete).toBe(true);
  });
});
