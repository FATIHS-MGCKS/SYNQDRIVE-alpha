import {
  classifyPhysicalRefuelSibling,
  chooseCanonicalRefuel,
  compareCanonicalRefuelCandidates,
  HISTORICAL_REFUEL_CALIBRATION_ROWS,
  type RefuelRowForMatcher,
} from './physical-refuel-identity.matcher';
import {
  KS_MX_2024_SEPT04_EVENT_A,
  KS_MX_2024_SEPT04_EVENT_B,
} from '@modules/dimo/fixtures/ks-mx-2024-sept04-refuel.fixture';

describe('physical refuel identity matcher (G1.2b hardened)', () => {
  const incidentA = HISTORICAL_REFUEL_CALIBRATION_ROWS[0];
  const incidentB = HISTORICAL_REFUEL_CALIBRATION_ROWS[1];

  it('classifies Sept04 A+B as SAME_PHYSICAL_REFUEL with canonical A', () => {
    const ab = classifyPhysicalRefuelSibling(incidentA, incidentB);
    expect(ab.classification).toBe('SAME_PHYSICAL_REFUEL');
    expect(ab.canonicalId).toBe(incidentA.id);
    expect(compareCanonicalRefuelCandidates(incidentA, incidentB)).toBeLessThan(0);
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

  describe('dimensionally-safe canonical comparator (G1.2b)', () => {
    const base = incidentA;

    it('prefers larger liter transition over larger percent delta', () => {
      const litersFavorA: RefuelRowForMatcher = {
        ...base,
        id: 'liters-a',
        dimoSegmentId: 'seg-liters-a',
        fuelStartLiters: 7,
        fuelEndLiters: 28,
        fuelDeltaLiters: 21,
        fuelStartPercent: 10,
        fuelEndPercent: 43,
        fuelDeltaPercent: 33,
      };
      const percentLooksLargerB: RefuelRowForMatcher = {
        ...incidentB,
        id: 'percent-b',
        dimoSegmentId: 'seg-percent-b',
        fuelStartLiters: 21,
        fuelEndLiters: 28,
        fuelDeltaLiters: 7,
        fuelStartPercent: 5,
        fuelEndPercent: 43,
        fuelDeltaPercent: 38,
      };
      expect(chooseCanonicalRefuel(litersFavorA, percentLooksLargerB)).toBe(litersFavorA.id);
      expect(chooseCanonicalRefuel(percentLooksLargerB, litersFavorA)).toBe(litersFavorA.id);
      expect(
        compareCanonicalRefuelCandidates(litersFavorA, percentLooksLargerB),
      ).toBe(-compareCanonicalRefuelCandidates(percentLooksLargerB, litersFavorA));
    });

    it('uses percent only when liters absent for both', () => {
      const pctA: RefuelRowForMatcher = {
        ...base,
        id: 'pct-a',
        dimoSegmentId: 'seg-pct-a',
        fuelStartLiters: null,
        fuelEndLiters: null,
        fuelDeltaLiters: null,
        fuelStartPercent: 10,
        fuelEndPercent: 40,
        fuelDeltaPercent: 30,
      };
      const pctB: RefuelRowForMatcher = {
        ...base,
        id: 'pct-b',
        dimoSegmentId: 'seg-pct-b',
        fuelStartLiters: null,
        fuelEndLiters: null,
        fuelDeltaLiters: null,
        fuelStartPercent: 20,
        fuelEndPercent: 35,
        fuelDeltaPercent: 15,
      };
      expect(chooseCanonicalRefuel(pctA, pctB)).toBe(pctA.id);
    });

    it('prefers row with liter evidence when only one has liters', () => {
      const withLiters: RefuelRowForMatcher = {
        ...base,
        id: 'with-liters',
        dimoSegmentId: 'seg-with-liters',
        fuelStartLiters: 10,
        fuelEndLiters: 20,
        fuelDeltaLiters: 10,
        fuelStartPercent: null,
        fuelEndPercent: null,
      };
      const pctOnly: RefuelRowForMatcher = {
        ...base,
        id: 'pct-only',
        dimoSegmentId: 'seg-pct-only',
        fuelStartLiters: null,
        fuelEndLiters: null,
        fuelDeltaLiters: null,
        fuelStartPercent: 5,
        fuelEndPercent: 50,
        fuelDeltaPercent: 45,
      };
      expect(chooseCanonicalRefuel(withLiters, pctOnly)).toBe(withLiters.id);
    });

    it('breaks equal terminal states by lexicographic id', () => {
      const a: RefuelRowForMatcher = {
        ...base,
        id: 'aaa-equal',
        dimoSegmentId: 'seg-aaa',
        fuelStartLiters: 10,
        fuelEndLiters: 20,
        durationSeconds: 100,
      };
      const b: RefuelRowForMatcher = {
        ...base,
        id: 'bbb-equal',
        dimoSegmentId: 'seg-bbb',
        fuelStartLiters: 10,
        fuelEndLiters: 20,
        durationSeconds: 100,
      };
      expect(chooseCanonicalRefuel(a, b)).toBe(a.id);
      expect(chooseCanonicalRefuel(b, a)).toBe(a.id);
    });

    it('is symmetric under reverse argument order', () => {
      const pairs: [RefuelRowForMatcher, RefuelRowForMatcher][] = [
        [incidentA, incidentB],
        [HISTORICAL_REFUEL_CALIBRATION_ROWS[4], HISTORICAL_REFUEL_CALIBRATION_ROWS[5]],
      ];
      for (const [a, b] of pairs) {
        expect(chooseCanonicalRefuel(a, b)).toBe(chooseCanonicalRefuel(b, a));
      }
    });
  });
});
