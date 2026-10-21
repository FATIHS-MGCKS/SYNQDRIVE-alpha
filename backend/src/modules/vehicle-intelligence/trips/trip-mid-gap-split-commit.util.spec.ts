import { TripStatus } from '@prisma/client';

import {
  classifyDurableLiveSplitOutcome,
  readDurableLiveSplitOutcome,
} from './trip-mid-gap-split-commit.util';

const TRIP1 = 'trip-1';
const TRIP2 = 'trip-2';
const FIRST_END = new Date('2026-09-06T12:00:00.000Z');
const SECOND_START = new Date('2026-09-06T12:03:10.000Z');

function completedTrip1(overrides: Record<string, unknown> = {}) {
  return {
    id: TRIP1,
    tripStatus: TripStatus.COMPLETED,
    startTime: new Date('2026-09-06T11:00:00.000Z'),
    endTime: FIRST_END,
    rawDetectionMeta: {
      splitTriggeredBy: 'LIVE_FSM',
      splitSecondStartAt: SECOND_START.toISOString(),
      splitFirstEndAt: FIRST_END.toISOString(),
    },
    ...overrides,
  };
}

function continuationTrip2(overrides: Record<string, unknown> = {}) {
  return {
    id: TRIP2,
    tripStatus: TripStatus.ONGOING,
    startTime: SECOND_START,
    endTime: null,
    rawDetectionMeta: {
      splitFrom: TRIP1,
      splitTriggeredBy: 'LIVE_FSM',
    },
    ...overrides,
  };
}

describe('trip-mid-gap-split-commit.util (R6A)', () => {
  it('NOT_COMMITTED when trip1 still ONGOING and no linked continuation', () => {
    expect(
      classifyDurableLiveSplitOutcome({
        originalTripId: TRIP1,
        expectedFirstEndAt: FIRST_END,
        expectedSecondStartAt: SECOND_START,
        originalTrip: {
          id: TRIP1,
          tripStatus: TripStatus.ONGOING,
          startTime: new Date('2026-09-06T11:00:00.000Z'),
        },
        ongoingTrips: [
          {
            id: TRIP1,
            tripStatus: TripStatus.ONGOING,
            startTime: new Date('2026-09-06T11:00:00.000Z'),
          },
        ],
      }),
    ).toBe('NOT_COMMITTED');
  });

  it('COMMITTED_LINKED with strong split proof', () => {
    expect(
      classifyDurableLiveSplitOutcome({
        originalTripId: TRIP1,
        expectedFirstEndAt: FIRST_END,
        expectedSecondStartAt: SECOND_START,
        originalTrip: completedTrip1(),
        ongoingTrips: [continuationTrip2()],
      }),
    ).toBe('COMMITTED_LINKED');
  });

  it('A — trip1 COMPLETED with no continuation → AMBIGUOUS', () => {
    expect(
      classifyDurableLiveSplitOutcome({
        originalTripId: TRIP1,
        expectedFirstEndAt: FIRST_END,
        expectedSecondStartAt: SECOND_START,
        originalTrip: completedTrip1(),
        ongoingTrips: [],
      }),
    ).toBe('AMBIGUOUS');
  });

  it('B — two ONGOING continuations → AMBIGUOUS', () => {
    expect(
      classifyDurableLiveSplitOutcome({
        originalTripId: TRIP1,
        expectedFirstEndAt: FIRST_END,
        expectedSecondStartAt: SECOND_START,
        originalTrip: completedTrip1(),
        ongoingTrips: [
          continuationTrip2({ id: 'trip-2a' }),
          continuationTrip2({ id: 'trip-2b' }),
        ],
      }),
    ).toBe('AMBIGUOUS');
  });

  it('C — splitFrom mismatch → AMBIGUOUS', () => {
    expect(
      classifyDurableLiveSplitOutcome({
        originalTripId: TRIP1,
        expectedFirstEndAt: FIRST_END,
        expectedSecondStartAt: SECOND_START,
        originalTrip: completedTrip1(),
        ongoingTrips: [
          continuationTrip2({
            rawDetectionMeta: { splitFrom: 'other-trip', splitTriggeredBy: 'LIVE_FSM' },
          }),
        ],
      }),
    ).toBe('AMBIGUOUS');
  });

  it('D — startTime mismatch → AMBIGUOUS', () => {
    expect(
      classifyDurableLiveSplitOutcome({
        originalTripId: TRIP1,
        expectedFirstEndAt: FIRST_END,
        expectedSecondStartAt: SECOND_START,
        originalTrip: completedTrip1(),
        ongoingTrips: [
          continuationTrip2({
            startTime: new Date('2026-09-06T12:05:00.000Z'),
          }),
        ],
      }),
    ).toBe('AMBIGUOUS');
  });

  it('F — trip1 ONGOING but linked continuation exists → AMBIGUOUS', () => {
    expect(
      classifyDurableLiveSplitOutcome({
        originalTripId: TRIP1,
        expectedFirstEndAt: FIRST_END,
        expectedSecondStartAt: SECOND_START,
        originalTrip: {
          id: TRIP1,
          tripStatus: TripStatus.ONGOING,
          startTime: new Date('2026-09-06T11:00:00.000Z'),
        },
        ongoingTrips: [continuationTrip2(), {
          id: TRIP1,
          tripStatus: TripStatus.ONGOING,
          startTime: new Date('2026-09-06T11:00:00.000Z'),
        }],
      }),
    ).toBe('AMBIGUOUS');
  });

  it('E — durable read failure → AMBIGUOUS', async () => {
    const outcome = await readDurableLiveSplitOutcome(
      {
        vehicleTrip: {
          findUnique: jest.fn().mockRejectedValue(new Error('db down')),
          findMany: jest.fn(),
        },
      },
      {
        vehicleId: 'veh',
        originalTripId: TRIP1,
        expectedFirstEndAt: FIRST_END,
        expectedSecondStartAt: SECOND_START,
      },
    );
    expect(outcome).toBe('AMBIGUOUS');
  });
});

function ongoingTrip1() {
  return {
    id: TRIP1,
    tripStatus: TripStatus.ONGOING,
    startTime: new Date('2026-09-06T11:00:00.000Z'),
  };
}

describe('trip-mid-gap-split-commit.util (R6B strict NOT_COMMITTED)', () => {
  it('A — sole ONGOING trip1, no linked continuation → NOT_COMMITTED', () => {
    expect(
      classifyDurableLiveSplitOutcome({
        originalTripId: TRIP1,
        expectedFirstEndAt: FIRST_END,
        expectedSecondStartAt: SECOND_START,
        originalTrip: ongoingTrip1(),
        ongoingTrips: [ongoingTrip1()],
      }),
    ).toBe('NOT_COMMITTED');
  });

  it('B — trip1 ONGOING plus unrelated second ONGOING → AMBIGUOUS', () => {
    expect(
      classifyDurableLiveSplitOutcome({
        originalTripId: TRIP1,
        expectedFirstEndAt: FIRST_END,
        expectedSecondStartAt: SECOND_START,
        originalTrip: ongoingTrip1(),
        ongoingTrips: [
          ongoingTrip1(),
          {
            id: 'trip-unrelated',
            tripStatus: TripStatus.ONGOING,
            startTime: new Date('2026-09-06T10:00:00.000Z'),
          },
        ],
      }),
    ).toBe('AMBIGUOUS');
  });

  it('C — trip1 ONGOING but ongoing set is only unrelated trip → AMBIGUOUS', () => {
    expect(
      classifyDurableLiveSplitOutcome({
        originalTripId: TRIP1,
        expectedFirstEndAt: FIRST_END,
        expectedSecondStartAt: SECOND_START,
        originalTrip: ongoingTrip1(),
        ongoingTrips: [
          {
            id: 'trip-unrelated',
            tripStatus: TripStatus.ONGOING,
            startTime: new Date('2026-09-06T10:00:00.000Z'),
          },
        ],
      }),
    ).toBe('AMBIGUOUS');
  });

  it('D — trip1 ONGOING but ongoing set empty → AMBIGUOUS', () => {
    expect(
      classifyDurableLiveSplitOutcome({
        originalTripId: TRIP1,
        expectedFirstEndAt: FIRST_END,
        expectedSecondStartAt: SECOND_START,
        originalTrip: ongoingTrip1(),
        ongoingTrips: [],
      }),
    ).toBe('AMBIGUOUS');
  });

  it('E — trip1 ONGOING with linked continuation present → AMBIGUOUS', () => {
    expect(
      classifyDurableLiveSplitOutcome({
        originalTripId: TRIP1,
        expectedFirstEndAt: FIRST_END,
        expectedSecondStartAt: SECOND_START,
        originalTrip: ongoingTrip1(),
        ongoingTrips: [ongoingTrip1(), continuationTrip2()],
      }),
    ).toBe('AMBIGUOUS');
  });

  it('F — COMMITTED_LINKED proof unchanged', () => {
    expect(
      classifyDurableLiveSplitOutcome({
        originalTripId: TRIP1,
        expectedFirstEndAt: FIRST_END,
        expectedSecondStartAt: SECOND_START,
        originalTrip: completedTrip1(),
        ongoingTrips: [continuationTrip2()],
      }),
    ).toBe('COMMITTED_LINKED');
  });
});
