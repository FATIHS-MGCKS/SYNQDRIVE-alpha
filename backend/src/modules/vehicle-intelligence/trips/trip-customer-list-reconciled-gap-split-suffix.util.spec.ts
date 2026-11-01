import {
  filterCustomerVisibleTrips,
  listReconciledGapSplitSuffixTripIdsHiddenFromCustomerList,
  shouldHideReconciledGapSplitSuffixFromCustomerList,
} from './trip-customer-list-reconciled-gap-split-suffix.util';

const CANONICAL_ID = '2245f107-0dda-412f-9903-dbfe1cd725a7';
const SUFFIX_ID = '22b79470-cae2-4fa7-8aed-74201cf6107e';
const VEHICLE_ID = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
const SPLIT_SECOND_START = new Date('2026-10-31T19:16:54.841Z');

function tiguanIncidentParent() {
  return {
    id: CANONICAL_ID,
    tripStatus: 'COMPLETED',
    startTime: new Date('2026-10-31T18:59:00.000Z'),
    endDetectionMode: 'MID_TRIP_GAP_SPLIT',
    isRepaired: true,
    rawDetectionMeta: {
      splitReason: 'live_mid_trip_gap_split',
      splitTriggeredBy: 'LIVE_FSM',
      splitGapMs: 340229,
      splitSecondStartAt: SPLIT_SECOND_START.toISOString(),
      boundaryRepair: {
        repairType: 'PARTIAL_TRIP_BOUNDARY_EXTENSION',
        newEndTime: '2026-10-31T19:18:00.000Z',
      },
    },
  };
}

function tiguanIncidentSuffix(withSplitFrom: boolean) {
  return {
    id: SUFFIX_ID,
    tripStatus: 'CANCELLED',
    startTime: SPLIT_SECOND_START,
    endDetectionMode: 'MID_TRIP_GAP_SPLIT',
    isRepaired: false,
    rawDetectionMeta: withSplitFrom
      ? { splitFrom: CANONICAL_ID, splitTriggeredBy: 'LIVE_FSM', discardReason: 'too_short_no_distance' }
      : { discardReason: 'too_short_no_distance' },
  };
}

describe('shouldHideReconciledGapSplitSuffixFromCustomerList', () => {
  it('hides Tiguan incident suffix when parent has splitSecondStartAt anchor (no splitFrom on suffix)', () => {
    expect(
      shouldHideReconciledGapSplitSuffixFromCustomerList(
        tiguanIncidentSuffix(false),
        tiguanIncidentParent(),
      ),
    ).toBe(true);
  });

  it('hides suffix when splitFrom lineage is present', () => {
    expect(
      shouldHideReconciledGapSplitSuffixFromCustomerList(
        tiguanIncidentSuffix(true),
        tiguanIncidentParent(),
      ),
    ).toBe(true);
  });

  it('keeps independent CANCELLED too_short trip without reconciled LIVE_FSM parent', () => {
    const independent = {
      id: 'independent-cancelled',
      tripStatus: 'CANCELLED',
      startTime: new Date('2026-11-01T10:00:00.000Z'),
      rawDetectionMeta: { discardReason: 'too_short_no_distance' },
    };
    expect(
      shouldHideReconciledGapSplitSuffixFromCustomerList(independent, tiguanIncidentParent()),
    ).toBe(false);
  });

  it('keeps suffix when parent boundary extension not proven', () => {
    const parent = { ...tiguanIncidentParent(), isRepaired: false, rawDetectionMeta: { splitTriggeredBy: 'LIVE_FSM' } };
    expect(
      shouldHideReconciledGapSplitSuffixFromCustomerList(tiguanIncidentSuffix(false), parent),
    ).toBe(false);
  });

  it('keeps legitimate COMPLETED trip unchanged in batch filter', () => {
    const parent = tiguanIncidentParent();
    const suffix = tiguanIncidentSuffix(false);
    const other = {
      id: 'other-trip',
      tripStatus: 'COMPLETED',
      startTime: new Date('2026-10-30T12:00:00.000Z'),
      rawDetectionMeta: {},
    };
    const hidden = new Set([SUFFIX_ID]);
    const visible = filterCustomerVisibleTrips([parent, suffix, other], hidden);
    expect(visible.map((t) => t.id)).toEqual([CANONICAL_ID, 'other-trip']);
  });
});

describe('listReconciledGapSplitSuffixTripIdsHiddenFromCustomerList', () => {
  it('returns empty when prisma yields no rows', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    await expect(
      listReconciledGapSplitSuffixTripIdsHiddenFromCustomerList(prisma, VEHICLE_ID),
    ).resolves.toEqual([]);
  });
});
