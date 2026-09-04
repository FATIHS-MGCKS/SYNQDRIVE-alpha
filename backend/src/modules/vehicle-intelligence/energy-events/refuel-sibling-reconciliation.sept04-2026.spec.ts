import {
  resolveSupersededRefuelSiblingIds,
  shouldSupersedeRefuelSibling,
  type RefuelEventWindow,
} from './refuel-sibling-reconciliation';
import {
  KS_MX_2024_SEPT04_EVENT_A,
  KS_MX_2024_SEPT04_EVENT_B,
} from '@modules/dimo/fixtures/ks-mx-2024-sept04-refuel.fixture';
import { coalesceSegments } from './energy-events.pipeline';
import type { DimoEnergyEventSegment } from '@modules/dimo/dimo-segments.service';

function windowFromFixture(
  fixture: typeof KS_MX_2024_SEPT04_EVENT_A | typeof KS_MX_2024_SEPT04_EVENT_B,
): RefuelEventWindow {
  return {
    id: fixture.id,
    dimoSegmentId: fixture.dimoSegmentId,
    startTime: new Date(fixture.startTime),
    endTime: new Date(fixture.endTime),
    durationSeconds: fixture.durationSeconds,
    fuelDeltaPercent: fixture.fuelDeltaPercent,
    fuelDeltaLiters: fixture.fuelDeltaLiters,
  };
}

function segmentFromFixture(
  fixture: typeof KS_MX_2024_SEPT04_EVENT_A | typeof KS_MX_2024_SEPT04_EVENT_B,
): DimoEnergyEventSegment {
  return {
    segmentId: fixture.dimoSegmentId,
    mechanism: 'refuel',
    startTime: fixture.startTime,
    endTime: fixture.endTime,
    isOngoing: false,
    startedBeforeRange: false,
    durationSeconds: fixture.durationSeconds,
    startLatitude: fixture.startLatitude,
    startLongitude: fixture.startLongitude,
    endLatitude: fixture.startLatitude,
    endLongitude: fixture.startLongitude,
    odometerStartKm: null,
    odometerEndKm: fixture.odometerEndKm,
    fuelStartLiters: fixture.fuelStartLiters,
    fuelEndLiters: fixture.fuelEndLiters,
    fuelDeltaLiters: fixture.fuelDeltaLiters,
    fuelStartPercent: fixture.fuelStartPercent,
    fuelEndPercent: fixture.fuelEndPercent,
    fuelDeltaPercent: fixture.fuelDeltaPercent,
    socStartPercent: null,
    socEndPercent: null,
    socDeltaPercent: null,
    energyStartKwh: null,
    energyEndKwh: null,
    energyDeltaKwh: null,
  };
}

describe('KS MX 2024-09-04 post-cutover duplicate REFUEL forensic replay', () => {
  const eventA = windowFromFixture(KS_MX_2024_SEPT04_EVENT_A);
  const eventB = windowFromFixture(KS_MX_2024_SEPT04_EVENT_B);

  it('ORDER 1: A canonical batch does not delete B when B not yet persisted', () => {
    expect(resolveSupersededRefuelSiblingIds([eventA], [])).toEqual([]);
  });

  it('ORDER 2: B canonical batch does not supersede longer envelope A', () => {
    expect(shouldSupersedeRefuelSibling(eventB, eventA)).toBe(false);
    expect(resolveSupersededRefuelSiblingIds([eventB], [eventA])).toEqual([]);
  });

  it('ORDER 3: same-batch reconcile fails due to fuel-percent compatibility guard', () => {
    expect(shouldSupersedeRefuelSibling(eventA, eventB)).toBe(false);
    expect(resolveSupersededRefuelSiblingIds([eventA], [eventB])).toEqual([]);
    expect(shouldSupersedeRefuelSibling(eventB, eventA)).toBe(false);
  });

  it('coalesce does not merge segments (478s gap, ~1758m start distance)', () => {
    const coalesced = coalesceSegments([
      segmentFromFixture(KS_MX_2024_SEPT04_EVENT_A),
      segmentFromFixture(KS_MX_2024_SEPT04_EVENT_B),
    ]);
    expect(coalesced).toHaveLength(2);
    expect(coalesced[0].coalescedFromSegmentIds).toEqual([
      KS_MX_2024_SEPT04_EVENT_A.dimoSegmentId,
    ]);
    expect(coalesced[1].coalescedFromSegmentIds).toEqual([
      KS_MX_2024_SEPT04_EVENT_B.dimoSegmentId,
    ]);
  });

  it('documents arrival-order dependence: both orders leave two rows', () => {
    const orderAFirst = resolveSupersededRefuelSiblingIds([eventA], [eventB]);
    const orderBFirst = resolveSupersededRefuelSiblingIds([eventB], [eventA]);
    expect(orderAFirst).toEqual([]);
    expect(orderBFirst).toEqual([]);
  });
});
