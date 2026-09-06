import { TripDetectionState, TripStatus } from '@prisma/client';
import {
  buildDeterministicLiveStartSegmentId,
  evaluateTripLifecycleInvariant,
  provesStartEpisodeRelationship,
  type TripLifecycleInvariantInput,
  type TripLifecycleTripFact,
} from './trip-lifecycle-invariant';

const VEHICLE = 'veh-1';
const T0 = new Date('2026-09-06T10:00:00.000Z');
const T1 = new Date('2026-09-06T11:00:00.000Z');

function ongoing(
  id: string,
  startTime: Date,
  extras: Partial<TripLifecycleTripFact> = {},
): TripLifecycleTripFact {
  return {
    id,
    tripStatus: TripStatus.ONGOING,
    startTime,
    dimoSegmentId: buildDeterministicLiveStartSegmentId(VEHICLE, startTime),
    tripSource: 'V2_LIVE',
    ...extras,
  };
}

function baseInput(
  overrides: Partial<TripLifecycleInvariantInput> = {},
): TripLifecycleInvariantInput {
  return {
    vehicleId: VEHICLE,
    fsmState: TripDetectionState.RESTING,
    activeTripId: null,
    possibleStartAt: null,
    ongoingTrips: [],
    referencedTrip: null,
    ...overrides,
  };
}

describe('R2 — trip lifecycle invariant planner', () => {
  describe('healthy classifications', () => {
    it('HEALTHY-1: RESTING with zero ONGOING', () => {
      const result = evaluateTripLifecycleInvariant(baseInput());
      expect(result.classification).toBe('HEALTHY_RESTING');
      expect(result.action).toBe('NONE');
    });

    it('HEALTHY-2: POSSIBLE_START with zero ONGOING', () => {
      const result = evaluateTripLifecycleInvariant(
        baseInput({
          fsmState: TripDetectionState.POSSIBLE_START,
          possibleStartAt: T0,
        }),
      );
      expect(result.classification).toBe('HEALTHY_POSSIBLE_START');
      expect(result.action).toBe('NONE');
    });

    it('HEALTHY-3: ACTIVE with matching sole ONGOING', () => {
      const trip = ongoing('trip-a', T0);
      const result = evaluateTripLifecycleInvariant(
        baseInput({
          fsmState: TripDetectionState.ACTIVE_TRIP,
          activeTripId: 'trip-a',
          possibleStartAt: T0,
          ongoingTrips: [trip],
          referencedTrip: trip,
        }),
      );
      expect(result.classification).toBe('HEALTHY');
      expect(result.action).toBe('NONE');
    });
  });

  describe('start orphan recovery', () => {
    it('RECOVERABLE-START-ORPHAN when ONGOING matches expected start fingerprint', () => {
      const trip = ongoing('trip-start', T0);
      const result = evaluateTripLifecycleInvariant(
        baseInput({
          fsmState: TripDetectionState.POSSIBLE_START,
          possibleStartAt: T0,
          expectedStartAt: T0,
          expectedDimoSegmentId: trip.dimoSegmentId!,
          ongoingTrips: [trip],
        }),
      );
      expect(result.classification).toBe('RECOVERABLE_START_ORPHAN');
      expect(result.action).toBe('ADOPT_ONGOING');
      expect(result.tripId).toBe('trip-start');
    });

    it('RECOVERABLE-MERGE-ORPHAN when reopened trip id matches merge target', () => {
      const trip = ongoing('trip-merge', T0);
      const result = evaluateTripLifecycleInvariant(
        baseInput({
          fsmState: TripDetectionState.POSSIBLE_START,
          possibleStartAt: T0,
          mergeTargetTripId: 'trip-merge',
          ongoingTrips: [trip],
        }),
      );
      expect(result.classification).toBe('RECOVERABLE_MERGE_ORPHAN');
      expect(result.action).toBe('ADOPT_ONGOING');
    });

    it('RECOVERABLE-MERGE-ORPHAN from durable mergeReopen meta without mergeTargetTripId', () => {
      const trip = ongoing('trip-merge', T0, {
        rawDetectionMeta: {
          lifecycleRecovery: {
            mergeReopen: {
              version: 'r2a-v1',
              type: 'merge_reopen',
              candidateStartAt: T0.toISOString(),
              effectiveStartAt: T0.toISOString(),
              reopenedAt: T0.toISOString(),
            },
          },
        },
      });
      const result = evaluateTripLifecycleInvariant(
        baseInput({
          fsmState: TripDetectionState.POSSIBLE_START,
          possibleStartAt: T0,
          ongoingTrips: [trip],
        }),
      );
      expect(result.classification).toBe('RECOVERABLE_MERGE_ORPHAN');
    });

    it('negative: unrelated ONGOING trip must not be adopted for new candidate', () => {
      const unrelated = ongoing('trip-a', T0);
      const result = evaluateTripLifecycleInvariant(
        baseInput({
          fsmState: TripDetectionState.POSSIBLE_START,
          possibleStartAt: T1,
          expectedStartAt: T1,
          ongoingTrips: [unrelated],
        }),
      );
      expect(result.action).toBe('NO_SAFE_REPAIR');
      expect(result.classification).toBe('CONFLICT_MISMATCH');
    });
  });

  describe('end orphan recovery', () => {
    it('RECOVERABLE-END-ORPHAN when activeTripId is COMPLETED', () => {
      const completed = {
        id: 'trip-x',
        tripStatus: TripStatus.COMPLETED,
        startTime: T0,
        endTime: T1,
      };
      const result = evaluateTripLifecycleInvariant(
        baseInput({
          fsmState: TripDetectionState.POSSIBLE_END,
          activeTripId: 'trip-x',
          referencedTrip: completed,
        }),
      );
      expect(result.classification).toBe('RECOVERABLE_END_ORPHAN');
      expect(result.action).toBe('RESET_TO_RESTING');
    });

    it('RECOVERABLE-END-ORPHAN when activeTripId is CANCELLED', () => {
      const cancelled = {
        id: 'trip-y',
        tripStatus: TripStatus.CANCELLED,
        startTime: T0,
      };
      const result = evaluateTripLifecycleInvariant(
        baseInput({
          fsmState: TripDetectionState.ACTIVE_TRIP,
          activeTripId: 'trip-y',
          referencedTrip: cancelled,
        }),
      );
      expect(result.classification).toBe('RECOVERABLE_END_ORPHAN');
      expect(result.action).toBe('RESET_TO_RESTING');
    });
  });

  describe('missing pointer recovery', () => {
    it('RECOVERABLE-MISSING-POINTER when one provably matching ONGOING exists', () => {
      const trip = ongoing('trip-z', T0);
      const result = evaluateTripLifecycleInvariant(
        baseInput({
          fsmState: TripDetectionState.ACTIVE_TRIP,
          activeTripId: null,
          possibleStartAt: T0,
          ongoingTrips: [trip],
        }),
      );
      expect(result.classification).toBe('RECOVERABLE_MISSING_POINTER');
      expect(result.action).toBe('ADOPT_ONGOING');
      expect(result.tripId).toBe('trip-z');
    });

    it('fallback: lastMeaningfulMovementAt path uses startTime match via possibleStartAt', () => {
      expect(
        provesStartEpisodeRelationship(ongoing('trip-fallback', T0), {
          vehicleId: VEHICLE,
          possibleStartAt: T0,
          expectedStartAt: null,
          expectedDimoSegmentId: null,
          mergeTargetTripId: null,
        }),
      ).toBe(true);
    });
  });

  describe('mid-gap split repoint', () => {
    it('RECOVERABLE-SPLIT-REPOINT when continuation trip splitFrom matches completed pointer', () => {
      const trip1 = {
        id: 'trip1',
        tripStatus: TripStatus.COMPLETED,
        startTime: T0,
        endTime: T1,
      };
      const trip2 = ongoing('trip2', T1, {
        rawDetectionMeta: { splitFrom: 'trip1' },
      });
      const result = evaluateTripLifecycleInvariant(
        baseInput({
          fsmState: TripDetectionState.ACTIVE_TRIP,
          activeTripId: 'trip1',
          referencedTrip: trip1,
          ongoingTrips: [trip2],
        }),
      );
      expect(result.classification).toBe('RECOVERABLE_SPLIT_REPOINT');
      expect(result.action).toBe('REPOINT_ACTIVE_TRIP');
      expect(result.tripId).toBe('trip2');
    });
  });

  describe('fail-closed conflicts', () => {
    it('CONFLICT-MULTIPLE-ONGOING', () => {
      const result = evaluateTripLifecycleInvariant(
        baseInput({
          fsmState: TripDetectionState.ACTIVE_TRIP,
          ongoingTrips: [ongoing('a', T0), ongoing('b', T1)],
        }),
      );
      expect(result.classification).toBe('CONFLICT_MULTIPLE_ONGOING');
      expect(result.action).toBe('NO_SAFE_REPAIR');
    });

    it('CONFLICT-MISMATCH when pointer does not match sole ONGOING', () => {
      const trip = ongoing('trip-real', T0);
      const result = evaluateTripLifecycleInvariant(
        baseInput({
          fsmState: TripDetectionState.ACTIVE_TRIP,
          activeTripId: 'trip-other',
          ongoingTrips: [trip],
          referencedTrip: trip,
        }),
      );
      expect(result.classification).toBe('CONFLICT_MISMATCH');
      expect(result.action).toBe('NO_SAFE_REPAIR');
    });

    it('CONFLICT-AMBIGUOUS when missing pointer and ONGOING cannot be proven', () => {
      const trip = ongoing('trip-unrelated', T0);
      const result = evaluateTripLifecycleInvariant(
        baseInput({
          fsmState: TripDetectionState.IDLE_WITHIN_TRIP,
          activeTripId: null,
          possibleStartAt: T1,
          ongoingTrips: [trip],
        }),
      );
      expect(result.classification).toBe('CONFLICT_AMBIGUOUS');
      expect(result.action).toBe('NO_SAFE_REPAIR');
    });
  });
});
