import {
  classifyPhysicalRefuelSibling,
  chooseCanonicalRefuel,
  HISTORICAL_REFUEL_CALIBRATION_ROWS,
  transitionCompletenessScore,
} from './physical-refuel-identity.matcher';
import {
  KS_MX_2024_SEPT04_EVENT_A,
  KS_MX_2024_SEPT04_EVENT_B,
} from '@modules/dimo/fixtures/ks-mx-2024-sept04-refuel.fixture';

describe('physical refuel identity matcher (G1.2 hardened)', () => {
  const incidentA = HISTORICAL_REFUEL_CALIBRATION_ROWS[0];
  const incidentB = HISTORICAL_REFUEL_CALIBRATION_ROWS[1];

  it('classifies Sept04 A+B as SAME_PHYSICAL_REFUEL with canonical A', () => {
    const ab = classifyPhysicalRefuelSibling(incidentA, incidentB);
    expect(ab.classification).toBe('SAME_PHYSICAL_REFUEL');
    expect(ab.canonicalId).toBe(incidentA.id);
    expect(transitionCompletenessScore(incidentA)).toBeGreaterThan(
      transitionCompletenessScore(incidentB),
    );
  });

  it('is symmetric for all classifications', () => {
    const pairs = [
      [incidentA, incidentB],
      [HISTORICAL_REFUEL_CALIBRATION_ROWS[4], HISTORICAL_REFUEL_CALIBRATION_ROWS[5]],
      [incidentA, HISTORICAL_REFUEL_CALIBRATION_ROWS[4]],
      [HISTORICAL_REFUEL_CALIBRATION_ROWS[2], HISTORICAL_REFUEL_CALIBRATION_ROWS[3]],
    ];
    for (const [a, b] of pairs) {
      const ab = classifyPhysicalRefuelSibling(a, b);
      const ba = classifyPhysicalRefuelSibling(b, a);
      expect(ab.classification).toBe(ba.classification);
      expect(ab.reason).toBe(ba.reason);
      if (ab.classification === 'SAME_PHYSICAL_REFUEL') {
        expect(ab.canonicalId).toBe(ba.canonicalId);
      }
    }
  });

  it('canonical choice is symmetric', () => {
    expect(chooseCanonicalRefuel(incidentA, incidentB)).toBe(incidentA.id);
    expect(chooseCanonicalRefuel(incidentB, incidentA)).toBe(incidentA.id);
  });

  it('does not merge clearly separate refuels on different days', () => {
    const sep = HISTORICAL_REFUEL_CALIBRATION_ROWS[4];
    const other = HISTORICAL_REFUEL_CALIBRATION_ROWS[5];
    expect(classifyPhysicalRefuelSibling(sep, other).classification).toBe(
      'DISTINCT_PHYSICAL_REFUEL',
    );
  });

  it('does not merge incident with unrelated row', () => {
    expect(
      classifyPhysicalRefuelSibling(incidentA, HISTORICAL_REFUEL_CALIBRATION_ROWS[4]).classification,
    ).toBe('DISTINCT_PHYSICAL_REFUEL');
  });

  it('Aug29 overlapping pair returns INSUFFICIENT_EVIDENCE (missing fuel endpoints)', () => {
    const long = HISTORICAL_REFUEL_CALIBRATION_ROWS[2];
    const short = HISTORICAL_REFUEL_CALIBRATION_ROWS[3];
    const result = classifyPhysicalRefuelSibling(long, short);
    expect(result.classification).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.reason).toMatch(/missing_terminal|transition/);
  });

  it('rejects same vehicle with contradictory terminal fuel', () => {
    const a = { ...incidentA, fuelEndLiters: 28 };
    const b = { ...incidentB, fuelEndLiters: 20, id: 'other-id', dimoSegmentId: 'other-seg' };
    expect(classifyPhysicalRefuelSibling(a, b).classification).toBe('DISTINCT_PHYSICAL_REFUEL');
  });

  it('rejects same transition on different vehicles', () => {
    const b = { ...incidentB, vehicleId: 'other-vehicle' };
    expect(classifyPhysicalRefuelSibling(incidentA, b).classification).toBe(
      'DISTINCT_PHYSICAL_REFUEL',
    );
  });

  it('rejects same terminal fuel but events hours apart', () => {
    const a = {
      ...incidentA,
      endTime: '2026-09-04T03:55:10.000Z',
      startTime: '2026-09-04T03:40:45.000Z',
    };
    const b = {
      ...incidentB,
      id: 'hours-apart',
      dimoSegmentId: 'seg-hours',
      vehicleId: incidentA.vehicleId,
      endTime: '2026-09-04T08:55:10.000Z',
      startTime: '2026-09-04T08:40:45.000Z',
      fuelEndLiters: 28,
    };
    expect(classifyPhysicalRefuelSibling(a, b).classification).toBe('DISTINCT_PHYSICAL_REFUEL');
  });

  it('rejects near-identical end timestamps with different odometer', () => {
    const a = { ...incidentA, odometerEndKm: 100 };
    const b = { ...incidentB, odometerEndKm: 200 };
    expect(classifyPhysicalRefuelSibling(a, b).classification).toBe('DISTINCT_PHYSICAL_REFUEL');
  });

  it('rejects overlapping windows without compatible transition', () => {
    const a = {
      ...incidentA,
      fuelStartLiters: 5,
      fuelEndLiters: 10,
      startTime: '2026-09-04T03:40:00.000Z',
      endTime: '2026-09-04T03:50:00.000Z',
    };
    const b = {
      ...incidentB,
      id: 'overlap-incompatible',
      dimoSegmentId: 'seg-overlap',
      fuelStartLiters: 15,
      fuelEndLiters: 25,
      startTime: '2026-09-04T03:45:00.000Z',
      endTime: '2026-09-04T03:55:00.000Z',
    };
    expect(classifyPhysicalRefuelSibling(a, b).classification).toBe('DISTINCT_PHYSICAL_REFUEL');
  });

  it('fails closed on sparse incomplete evidence', () => {
    const sparse = {
      id: 'sparse',
      vehicleId: incidentA.vehicleId,
      kind: 'REFUEL' as const,
      startTime: incidentA.startTime,
      endTime: incidentA.endTime,
      dimoSegmentId: 'sparse-seg',
    };
    expect(classifyPhysicalRefuelSibling(incidentA, sparse).classification).toBe(
      'INSUFFICIENT_EVIDENCE',
    );
  });

  it('fixture transitions are suffix-compatible 7→28 and 21→28', () => {
    expect(KS_MX_2024_SEPT04_EVENT_A.fuelStartLiters).toBe(7);
    expect(KS_MX_2024_SEPT04_EVENT_B.fuelStartLiters).toBe(21);
    expect(KS_MX_2024_SEPT04_EVENT_A.fuelEndLiters).toBe(28);
    expect(KS_MX_2024_SEPT04_EVENT_B.fuelEndLiters).toBe(28);
  });
});
