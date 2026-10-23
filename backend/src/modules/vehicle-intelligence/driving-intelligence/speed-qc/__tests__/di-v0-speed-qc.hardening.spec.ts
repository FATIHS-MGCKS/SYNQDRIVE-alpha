import { DI_V0_SPEED_QC_REASON } from '../di-v0-speed-qc-reason-codes';
import { evaluateDiV0SpeedQcInterval } from '../evaluate-di-v0-speed-qc-interval';
import { syntheticHighway130Input, syntheticPostGapSpikeInput } from './fixtures/synthetic-scenarios';

describe('DI_V0_SPEED_QC_POLICY_V1 pre-merge hardening', () => {
  it('rejects duplicate bucket labels with conflicting coordinates', () => {
    const base = syntheticHighway130Input();
    const dup = base.positions[0];
    const conflict = {
      ...dup,
      latitude: (dup.latitude ?? 0) + 0.01,
    };
    const v = evaluateDiV0SpeedQcInterval({
      ...base,
      positions: [...base.positions, conflict],
    });
    expect(v.trustLevel).toBe('UNTRUSTED');
    expect(v.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.DUPLICATE_BUCKET_LABEL);
  });

  it('rejects STATIONARY_BAND with moving motion or high speed', () => {
    const base = syntheticHighway130Input();
    const v = evaluateDiV0SpeedQcInterval({
      ...base,
      shadow: {
        ...base.shadow,
        speedEvidenceState: 'STATIONARY_BAND',
        motionState: 'MOVING_SPEED_ESTIMATED',
        estimatedSpeedKmh: 40,
      },
    });
    expect(v.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.STATIONARY_INCONSISTENT);
  });

  it('rejects centerBucketLabel not aligned with shadow.referenceTime', () => {
    const base = syntheticHighway130Input();
    const v = evaluateDiV0SpeedQcInterval({
      ...base,
      centerBucketLabel: '2020-06-01T12:00:19Z',
    });
    expect(v.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.REFERENCE_TIME_MISMATCH);
  });

  it('invalid shadow.referenceTime fails closed without throwing', () => {
    const base = syntheticHighway130Input();
    const input = {
      ...base,
      shadow: { ...base.shadow, referenceTime: 'not-a-valid-iso-timestamp' },
    };
    expect(() => evaluateDiV0SpeedQcInterval(input)).not.toThrow();
    const v = evaluateDiV0SpeedQcInterval(input);
    expect(v.trustLevel).toBe('UNTRUSTED');
    expect(v.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.REFERENCE_TIME_MISMATCH);
  });

  it('duplicate R1 bucket labels do not affect QC when R1 speed is comparison-only', () => {
    const base = syntheticHighway130Input();
    const v = evaluateDiV0SpeedQcInterval({
      ...base,
      r1Obd: [
        { bucketLabel: base.centerBucketLabel, speedKmh: 130, temporalConfidence: 'INTERVAL_ONLY' },
        { bucketLabel: base.centerBucketLabel, speedKmh: 50, temporalConfidence: 'INTERVAL_ONLY' },
      ],
    });
    expect(v.trustLevel).toBe('TRUSTED');
    expect(v.reasonCodes).not.toContain(DI_V0_SPEED_QC_REASON.DUPLICATE_R1_BUCKET_LABEL);
    expect(v.sourceCorroboration.r1IndependentWitness).toBe(false);
  });

  it('STATIONARY_BAND without center position evidence cannot reach TRUSTED_LIMITED', () => {
    const base = syntheticHighway130Input();
    const v = evaluateDiV0SpeedQcInterval({
      ...base,
      positions: base.positions.filter((p) => p.bucketLabel !== base.centerBucketLabel),
      shadow: {
        ...base.shadow,
        speedEvidenceState: 'STATIONARY_BAND',
        motionState: 'STATIONARY_SUPPORTED',
        estimatedSpeedKmh: 0,
      },
    });
    expect(v.trustLevel).toBe('UNTRUSTED');
    expect(v.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.MISSING_POSITION_EVIDENCE);
    expect(v.qcTrustedSpeedKmh).toBeNull();
  });

  it('ignores R1 vehicle speed for QC corroboration (comparison-only boundary)', () => {
    const base = syntheticHighway130Input();
    const v = evaluateDiV0SpeedQcInterval({
      ...base,
      shadow: {
        ...base.shadow,
        sourceQualityFlags: ['R1_INTERVAL_ONLY'],
      },
      r1Obd: [{ bucketLabel: base.centerBucketLabel, speedKmh: 130, temporalConfidence: 'INTERVAL_ONLY' }],
    });
    expect(v.sourceCorroboration.r1CorroboratesL3).toBe(false);
    expect(v.sourceCorroboration.r1IndependentWitness).toBe(false);
    expect(v.physicalPlausibility.maxLegSpeedMpsApplied).toBeLessThanOrEqual(50);
  });

  it('post-gap lookback alone does not reject when legs remain plausible', () => {
    const base = syntheticHighway130Input();
    const absentLabel = '2020-06-01T12:00:17Z';
    const v = evaluateDiV0SpeedQcInterval({
      ...base,
      positions: [
        { bucketLabel: absentLabel, availability: 'ROW_ABSENT' },
        ...base.positions,
      ],
    });
    expect(v.trustLevel).toBe('TRUSTED');
    expect(v.reasonCodes).not.toContain(DI_V0_SPEED_QC_REASON.POST_GAP_REACQUIRE);
  });

  it('allows plausible speed above 120 km/h on consistent geometry', () => {
    const v = evaluateDiV0SpeedQcInterval(syntheticHighway130Input());
    expect(v.trustLevel).toBe('TRUSTED');
    expect(v.qcTrustedSpeedKmh).toBe(130);
  });

  it('rejects invalid geo coordinates', () => {
    const base = syntheticHighway130Input();
    const positions = base.positions.map((p) =>
      p.bucketLabel === base.centerBucketLabel ? { ...p, latitude: 120 } : p,
    );
    const v = evaluateDiV0SpeedQcInterval({ ...base, positions });
    expect(v.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.INVALID_GEO_COORDINATES);
  });

  it('post-gap spike class remains UNTRUSTED after Q7 refinement', () => {
    const v = evaluateDiV0SpeedQcInterval(syntheticPostGapSpikeInput());
    expect(v.trustLevel).toBe('UNTRUSTED');
  });

  it('POST_GAP_REACQUIRE is structurally overshadowed when L3_SUPPORT_CROSSES_GAP is set (compromised branch runs first)', () => {
    const base = syntheticHighway130Input();
    const absent = '2020-06-01T12:00:18Z';
    const v = evaluateDiV0SpeedQcInterval({
      ...base,
      positions: base.positions.map((p) =>
        p.bucketLabel === absent ? { bucketLabel: absent, availability: 'ROW_ABSENT' } : p,
      ),
      shadow: {
        ...base.shadow,
        sourceQualityFlags: ['L3_SUPPORT_CROSSES_GAP'],
      },
    });
    expect(v.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.SUPPORT_WINDOW_COMPROMISED);
    expect(v.reasonCodes).not.toContain(DI_V0_SPEED_QC_REASON.POST_GAP_REACQUIRE);
  });

  it('determinism holds across 20 repeated evaluations', () => {
    const input = syntheticHighway130Input();
    const first = evaluateDiV0SpeedQcInterval(input);
    for (let i = 0; i < 20; i += 1) {
      expect(evaluateDiV0SpeedQcInterval(input)).toEqual(first);
    }
  });
});
