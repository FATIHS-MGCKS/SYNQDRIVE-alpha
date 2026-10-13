import { DI_V0_SPEED_QC_REASON } from '../di-v0-speed-qc-reason-codes';
import { evaluateDiV0SpeedQcInterval } from '../evaluate-di-v0-speed-qc-interval';
import { syntheticHighway130Input } from './fixtures/synthetic-scenarios';

describe('DI_V0_SPEED_QC_POLICY_V1 unit / edge cases', () => {
  it('is deterministic across repeated evaluation', () => {
    const input = syntheticHighway130Input();
    const a = evaluateDiV0SpeedQcInterval(input);
    const b = evaluateDiV0SpeedQcInterval(input);
    expect(a).toEqual(b);
  });

  it('Q4 flags → SUPPORT_WINDOW_COMPROMISED', () => {
    const base = syntheticHighway130Input();
    const v = evaluateDiV0SpeedQcInterval({
      ...base,
      shadow: { ...base.shadow, sourceQualityFlags: ['L3_SUPPORT_CROSSES_GAP'] },
    });
    expect(v.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.SUPPORT_WINDOW_COMPROMISED);
  });

  it('R1 present but disagreeing → R1_DISAGREEMENT (not treated as corroboration)', () => {
    const base = syntheticHighway130Input();
    const v = evaluateDiV0SpeedQcInterval({
      ...base,
      r1Obd: [{ bucketLabel: base.centerBucketLabel, speedKmh: 40 }],
    });
    expect(v.trustLevel).toBe('UNTRUSTED');
    expect(v.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.R1_DISAGREEMENT);
    expect(v.sourceCorroboration.r1IndependentWitness).toBe(false);
  });

  it('missing position triple → MISSING_POSITION_EVIDENCE', () => {
    const base = syntheticHighway130Input();
    const v = evaluateDiV0SpeedQcInterval({
      ...base,
      positions: base.positions.filter((p) => p.bucketLabel !== base.centerBucketLabel),
    });
    expect(v.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.MISSING_POSITION_EVIDENCE);
  });

  it('rejects NaN speed as NO_NUMERIC', () => {
    const base = syntheticHighway130Input();
    const v = evaluateDiV0SpeedQcInterval({
      ...base,
      shadow: { ...base.shadow, estimatedSpeedKmh: Number.NaN },
    });
    expect(v.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.NO_NUMERIC);
  });

  it('invalid bucket label → INVALID_INPUT', () => {
    const base = syntheticHighway130Input();
    const v = evaluateDiV0SpeedQcInterval({
      ...base,
      centerBucketLabel: 'not-a-date',
    });
    expect(v.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.INVALID_INPUT);
  });
});
