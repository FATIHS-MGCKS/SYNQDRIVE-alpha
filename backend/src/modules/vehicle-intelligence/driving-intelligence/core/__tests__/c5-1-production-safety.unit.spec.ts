import {
  computeC5_1GatedRepair,
  computeC5_1GatedRepairFrozenV12,
  computeC5_1GatedRepairResearchV12,
  EVIDENCE,
  FROZEN,
  orderMotionCoreGrid,
  presentBucketMap,
  type MotionCorePositionBucket,
} from '../index';
import { manoeuvreGuardQ4, tripleAccelEvidence } from '../kinematics/c5-1-gated-repair-v1-2';

describe('C5.1 production input guards', () => {
  const mk = (i: number): MotionCorePositionBucket => ({
    bucketLabelUtc: new Date((1_900_000_000 + i) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    availability: 'PRESENT',
    latitude: 48.1 + (i * 27.8) / 111_320,
    longitude: 11.5,
  });

  it('production compute equals research V1.2 entrypoints for frozen profile', () => {
    const grid = [0, 1, 2, 3, 4].map(mk);
    const a = computeC5_1GatedRepairResearchV12(grid);
    const b = computeC5_1GatedRepairFrozenV12(grid, { safetyProfile: 'frozen_v12' });
    expect(a.meta.repairAccepted).toBe(b.meta.repairAccepted);
    expect(a.samples.map((s) => s.valueKmh)).toEqual(b.samples.map((s) => s.valueKmh));
  });

  it('NaN neighbor speed is INSUFFICIENT_EVIDENCE under production guards', () => {
    const ordered = orderMotionCoreGrid([0, 1, 2, 3].map(mk));
    const pm = presentBucketMap(ordered);
    const tSec = 1_900_000_002;
    const frozen = tripleAccelEvidence(
      tSec,
      100,
      pm,
      (s) => (s === tSec - 1 ? Number.NaN : 100),
      9,
      () => null,
      'frozen_v12',
    );
    const prod = tripleAccelEvidence(
      tSec,
      100,
      pm,
      (s) => (s === tSec - 1 ? Number.NaN : 100),
      9,
      () => null,
      'production_guards_v1',
    );
    expect(frozen.status).toBe(EVIDENCE.VALID);
    expect(prod.status).toBe(EVIDENCE.INSUFFICIENT_EVIDENCE);
  });

  it('Q4 missing neighbors fail-closed in production profile only', () => {
    const ordered = orderMotionCoreGrid([mk(2)]);
    const pm = presentBucketMap(ordered);
    const pSec = 1_900_000_002;
    const dist = () => 10;
    expect(manoeuvreGuardQ4(pSec, pm, dist, 9, 'frozen_v12').pass).toBe(true);
    expect(manoeuvreGuardQ4(pSec, pm, dist, 9, 'production_guards_v1').pass).toBe(false);
  });

  it('keeps frozen neighbor gap horizon', () => {
    expect(FROZEN.maxNeighborGapS).toBe(3);
    const prod = computeC5_1GatedRepair([0, 1, 2, 5, 6].map(mk));
    expect(prod.meta.version).toContain('V1_2');
  });
});
