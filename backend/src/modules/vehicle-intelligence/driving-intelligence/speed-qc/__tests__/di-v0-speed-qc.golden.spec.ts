import { DI_V0_SPEED_QC_REASON } from '../di-v0-speed-qc-reason-codes';
import { DI_V0_SPEED_QC_POLICY_V1 } from '../di-v0-speed-qc-policy.version';
import { evaluateDiV0SpeedQcInterval } from '../evaluate-di-v0-speed-qc-interval';
import {
  syntheticHighLegSpeedInput,
  syntheticHighway130Input,
  syntheticPostGapSpikeInput,
} from './fixtures/synthetic-scenarios';

describe('DI_V0_SPEED_QC_POLICY_V1 golden scenarios', () => {
  it('T1 / T10 — post-gap position jump (76af class) → UNTRUSTED', () => {
    const v = evaluateDiV0SpeedQcInterval(syntheticPostGapSpikeInput());
    expect(v.qcPolicyVersion).toBe(DI_V0_SPEED_QC_POLICY_V1);
    expect(v.trustLevel).toBe('UNTRUSTED');
    expect(v.qcTrustedSpeedKmh).toBeNull();
    const spikeReasons = [
      DI_V0_SPEED_QC_REASON.POST_GAP_REACQUIRE,
      DI_V0_SPEED_QC_REASON.GEOMETRY_JUMP,
      DI_V0_SPEED_QC_REASON.KINEMATIC_IMPLAUSIBLE_LEG,
    ];
    expect(v.reasonCodes.some((r) => spikeReasons.includes(r as (typeof spikeReasons)[number]))).toBe(
      true,
    );
    expect(v.originalEstimatedSpeedKmh).toBe(1652);
  });

  it('T2 — high 1 Hz leg speed without R1 (c66a class) → UNTRUSTED with geometry/accel reason', () => {
    const v = evaluateDiV0SpeedQcInterval(syntheticHighLegSpeedInput());
    expect(v.trustLevel).toBe('UNTRUSTED');
    expect(v.qcTrustedSpeedKmh).toBeNull();
    const kinematicReasons: string[] = [
      DI_V0_SPEED_QC_REASON.GEOMETRY_JUMP,
      DI_V0_SPEED_QC_REASON.KINEMATIC_IMPLAUSIBLE_LEG,
    ];
    expect(v.reasonCodes.some((r) => kinematicReasons.includes(r))).toBe(true);
    expect(v.sourceCorroboration.r1IndependentWitness).toBe(false);
  });

  it('T3 — smooth highway ~130 km/h → TRUSTED (no blanket high-speed reject)', () => {
    const v = evaluateDiV0SpeedQcInterval(syntheticHighway130Input());
    expect(v.trustLevel).toBe('TRUSTED');
    expect(v.qcTrustedSpeedKmh).toBe(130);
    expect(v.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.OK);
  });

  it('T4 — R1 conflict on shadow row → UNTRUSTED', () => {
    const base = syntheticHighway130Input();
    const v = evaluateDiV0SpeedQcInterval({
      ...base,
      shadow: { ...base.shadow, sourceRelation: 'CONFLICT_EXPLAINED', valueConfidence: 'LOW' },
    });
    expect(v.trustLevel).toBe('UNTRUSTED');
    expect(v.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.CROSS_SOURCE_CONFLICT);
  });

  it('T5 — no numeric speed (3964 class) → NO_NUMERIC', () => {
    const base = syntheticHighway130Input();
    const v = evaluateDiV0SpeedQcInterval({
      ...base,
      shadow: { ...base.shadow, estimatedSpeedKmh: null, speedEvidenceState: 'NONE' },
    });
    expect(v.trustLevel).toBe('UNTRUSTED');
    expect(v.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.NO_NUMERIC);
  });

  it('T6 — stationary band → no invented trusted speed', () => {
    const base = syntheticHighway130Input();
    const v = evaluateDiV0SpeedQcInterval({
      ...base,
      shadow: {
        ...base.shadow,
        estimatedSpeedKmh: 2,
        speedEvidenceState: 'STATIONARY_BAND',
        motionState: 'STATIONARY_SUPPORTED',
      },
    });
    expect(v.trustLevel).toBe('TRUSTED_LIMITED');
    expect(v.qcTrustedSpeedKmh).toBeNull();
  });

  it('T7 — slow crawl MODERATE → TRUSTED_LIMITED', () => {
    const base = syntheticHighway130Input();
    const v = evaluateDiV0SpeedQcInterval({
      ...base,
      shadow: {
        ...base.shadow,
        estimatedSpeedKmh: 12,
        valueConfidence: 'MODERATE',
        speedEvidenceState: 'NUMERIC_MODERATE',
      },
    });
    expect(v.trustLevel).toBe('TRUSTED_LIMITED');
    expect(v.qcTrustedSpeedKmh).toBe(12);
    expect(v.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.OK_MODERATE);
  });

  it('T8 — snapshot integrity mismatch → fail closed', () => {
    const base = syntheticHighway130Input();
    const v = evaluateDiV0SpeedQcInterval({
      ...base,
      evidenceIdentity: {
        pinnedSnapshotHash: 'ACTUAL',
        expectedPinnedSnapshotHash: 'EXPECTED_DIFFERENT',
      },
    });
    expect(v.trustLevel).toBe('UNTRUSTED');
    expect(v.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.SNAPSHOT_INTEGRITY_FAIL);
  });

  it('T9 — frozen in support window → UNTRUSTED', () => {
    const base = syntheticHighway130Input();
    const positions = base.positions.map((p) =>
      p.bucketLabel === base.centerBucketLabel
        ? { ...p, positionState: 'FROZEN_MOVEMENT_SUPPORTED' as const }
        : p,
    );
    const v = evaluateDiV0SpeedQcInterval({ ...base, positions });
    expect(v.trustLevel).toBe('UNTRUSTED');
    expect(v.reasonCodes).toContain(DI_V0_SPEED_QC_REASON.FROZEN_OR_RELEASE_IN_SUPPORT);
  });
});
