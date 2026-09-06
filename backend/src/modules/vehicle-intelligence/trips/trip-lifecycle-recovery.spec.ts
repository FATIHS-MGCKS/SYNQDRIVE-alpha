import { TripDetectionState, TripStatus } from '@prisma/client';
import {
  buildDeterministicLiveStartSegmentId,
  evaluateTripLifecycleInvariant,
} from './trip-lifecycle-invariant';
import { TripLifecycleRecoveryService } from './trip-lifecycle-recovery.service';

const VEHICLE = 'veh-crash';
const ORG = 'org-1';
const DIMO = 42;
const T0 = new Date('2026-09-06T10:00:00.000Z');

function makeDet(overrides: Record<string, unknown> = {}) {
  return {
    vehicleId: VEHICLE,
    organizationId: ORG,
    state: TripDetectionState.POSSIBLE_START,
    activeTripId: null,
    possibleStartAt: T0,
    possibleStartEnteredAt: T0,
    lastEvidenceSummary: {},
    ...overrides,
  } as any;
}

describe('R2 — lifecycle recovery crash injection', () => {
  const executeLifecycleRecoveryAction = jest.fn().mockResolvedValue(undefined);

  const prisma = {
    vehicleTrip: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    vehicleTripDetectionState: {
      findUnique: jest.fn(),
    },
  };

  const orchestration = {
    executeLifecycleRecoveryAction,
  };

  const tripMetrics = {
    ongoingFsmDivergence: { inc: jest.fn() },
    completedFsmDivergence: { inc: jest.fn() },
    tripLifecycleInvariantRecovery: { inc: jest.fn() },
    tripLifecycleInvariantConflict: { inc: jest.fn() },
  };

  let service: TripLifecycleRecoveryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TripLifecycleRecoveryService(
      prisma as any,
      orchestration as any,
      tripMetrics as any,
    );
  });

  it('1. createTrip succeeds → FSM ACTIVE fails → recovery adopts same trip', async () => {
    const tripId = 'trip-start-orphan';
    const segmentId = buildDeterministicLiveStartSegmentId(VEHICLE, T0);
    prisma.vehicleTrip.findMany.mockResolvedValue([
      {
        id: tripId,
        tripStatus: TripStatus.ONGOING,
        startTime: T0,
        dimoSegmentId: segmentId,
        tripSource: 'V2_LIVE',
        rawDetectionMeta: null,
      },
    ]);
    prisma.vehicleTrip.findUnique.mockResolvedValue(null);

    const outcome = await service.attemptRecovery({
      det: makeDet(),
      organizationId: ORG,
      dimoTokenId: DIMO,
      context: {
        expectedStartAt: T0,
        expectedDimoSegmentId: segmentId,
      },
    });

    expect(outcome.recovered).toBe(true);
    expect(outcome.evaluated.classification).toBe('RECOVERABLE_START_ORPHAN');
    expect(executeLifecycleRecoveryAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ADOPT_ONGOING',
        tripId,
        recoveredTrip: expect.objectContaining({ id: tripId }),
      }),
    );
  });

  it('2. recovery invoked twice is idempotent at planner level', async () => {
    const tripId = 'trip-start-orphan';
    const segmentId = buildDeterministicLiveStartSegmentId(VEHICLE, T0);
    const ongoing = [
      {
        id: tripId,
        tripStatus: TripStatus.ONGOING,
        startTime: T0,
        dimoSegmentId: segmentId,
      },
    ];
    prisma.vehicleTrip.findMany.mockResolvedValue(ongoing);
    prisma.vehicleTrip.findUnique.mockResolvedValue(null);

    const first = await service.attemptRecovery({
      det: makeDet(),
      organizationId: ORG,
      dimoTokenId: DIMO,
      context: { expectedStartAt: T0, expectedDimoSegmentId: segmentId },
    });
    const second = await service.attemptRecovery({
      det: makeDet({ state: TripDetectionState.ACTIVE_TRIP, activeTripId: tripId }),
      organizationId: ORG,
      dimoTokenId: DIMO,
      context: { expectedStartAt: T0, expectedDimoSegmentId: segmentId },
    });

    expect(first.recovered).toBe(true);
    expect(second.recovered).toBe(false);
    expect(second.evaluated.classification).toBe('HEALTHY');
    expect(executeLifecycleRecoveryAction).toHaveBeenCalledTimes(1);
  });

  it('3. reopenTripForMerge succeeds → FSM transition fails → recovery adopts reopened trip', async () => {
    const mergeTripId = 'trip-merge';
    prisma.vehicleTrip.findMany.mockResolvedValue([
      {
        id: mergeTripId,
        tripStatus: TripStatus.ONGOING,
        startTime: T0,
        dimoSegmentId: null,
        tripSource: 'V2_LIVE',
      },
    ]);
    prisma.vehicleTrip.findUnique.mockResolvedValue(null);

    const outcome = await service.attemptRecovery({
      det: makeDet(),
      organizationId: ORG,
      dimoTokenId: DIMO,
      context: { mergeTargetTripId: mergeTripId },
    });

    expect(outcome.recovered).toBe(true);
    expect(outcome.evaluated.classification).toBe('RECOVERABLE_MERGE_ORPHAN');
    expect(executeLifecycleRecoveryAction).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: mergeTripId, action: 'ADOPT_ONGOING' }),
    );
  });

  it('4. finalizeTrip succeeds → RESTING transition fails → recovery reaches RESTING', async () => {
    const tripId = 'trip-completed';
    prisma.vehicleTrip.findMany.mockResolvedValue([]);
    prisma.vehicleTrip.findUnique.mockResolvedValue({
      id: tripId,
      tripStatus: TripStatus.COMPLETED,
      startTime: T0,
      endTime: new Date(T0.getTime() + 30 * 60_000),
    });

    const outcome = await service.attemptRecovery({
      det: makeDet({
        state: TripDetectionState.POSSIBLE_END,
        activeTripId: tripId,
      }),
      organizationId: ORG,
      dimoTokenId: DIMO,
    });

    expect(outcome.recovered).toBe(true);
    expect(outcome.evaluated.action).toBe('RESET_TO_RESTING');
    expect(executeLifecycleRecoveryAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'RESET_TO_RESTING', tripId }),
    );
  });

  it('5. discardTrip succeeds → RESTING transition fails → recovery reaches RESTING', async () => {
    const tripId = 'trip-cancelled';
    prisma.vehicleTrip.findMany.mockResolvedValue([]);
    prisma.vehicleTrip.findUnique.mockResolvedValue({
      id: tripId,
      tripStatus: TripStatus.CANCELLED,
      startTime: T0,
    });

    const outcome = await service.attemptRecovery({
      det: makeDet({
        state: TripDetectionState.ACTIVE_TRIP,
        activeTripId: tripId,
      }),
      organizationId: ORG,
      dimoTokenId: DIMO,
    });

    expect(outcome.recovered).toBe(true);
    expect(outcome.evaluated.action).toBe('RESET_TO_RESTING');
  });

  it('6. FSM ACTIVE + matching single ONGOING → HEALTHY/no mutation', async () => {
    const tripId = 'trip-healthy';
    const trip = {
      id: tripId,
      tripStatus: TripStatus.ONGOING,
      startTime: T0,
      dimoSegmentId: buildDeterministicLiveStartSegmentId(VEHICLE, T0),
    };
    prisma.vehicleTrip.findMany.mockResolvedValue([trip]);
    prisma.vehicleTrip.findUnique.mockResolvedValue(trip);

    const outcome = await service.attemptRecovery({
      det: makeDet({
        state: TripDetectionState.ACTIVE_TRIP,
        activeTripId: tripId,
        possibleStartAt: T0,
      }),
      organizationId: ORG,
      dimoTokenId: DIMO,
    });

    expect(outcome.recovered).toBe(false);
    expect(outcome.evaluated.classification).toBe('HEALTHY');
    expect(executeLifecycleRecoveryAction).not.toHaveBeenCalled();
  });

  it('9. multiple ONGOING rows → CONFLICT/no destructive repair', async () => {
    prisma.vehicleTrip.findMany.mockResolvedValue([
      { id: 'a', tripStatus: TripStatus.ONGOING, startTime: T0 },
      { id: 'b', tripStatus: TripStatus.ONGOING, startTime: T0 },
    ]);
    prisma.vehicleTrip.findUnique.mockResolvedValue(null);

    const outcome = await service.attemptRecovery({
      det: makeDet({ state: TripDetectionState.ACTIVE_TRIP }),
      organizationId: ORG,
      dimoTokenId: DIMO,
    });

    expect(outcome.blocked).toBe(true);
    expect(outcome.evaluated.classification).toBe('CONFLICT_MULTIPLE_ONGOING');
    expect(executeLifecycleRecoveryAction).not.toHaveBeenCalled();
    expect(tripMetrics.tripLifecycleInvariantConflict.inc).toHaveBeenCalled();
  });

  it('10. mismatched ONGOING trip → FAIL CLOSED', async () => {
    prisma.vehicleTrip.findMany.mockResolvedValue([
      {
        id: 'trip-real',
        tripStatus: TripStatus.ONGOING,
        startTime: T0,
        dimoSegmentId: buildDeterministicLiveStartSegmentId(VEHICLE, T0),
      },
    ]);
    prisma.vehicleTrip.findUnique.mockResolvedValue({
      id: 'trip-real',
      tripStatus: TripStatus.ONGOING,
      startTime: T0,
    });

    const outcome = await service.attemptRecovery({
      det: makeDet({
        state: TripDetectionState.ACTIVE_TRIP,
        activeTripId: 'trip-other',
        possibleStartAt: T0,
      }),
      organizationId: ORG,
      dimoTokenId: DIMO,
    });

    expect(outcome.blocked).toBe(true);
    expect(outcome.evaluated.classification).toBe('CONFLICT_MISMATCH');
  });

  it('R2.15 negative: unrelated ONGOING must not be adopted for new candidate', () => {
    const unrelatedStart = new Date('2026-09-06T11:00:00.000Z');
    const result = evaluateTripLifecycleInvariant({
      vehicleId: VEHICLE,
      fsmState: TripDetectionState.POSSIBLE_START,
      activeTripId: null,
      possibleStartAt: unrelatedStart,
      expectedStartAt: unrelatedStart,
      ongoingTrips: [
        {
          id: 'trip-a',
          tripStatus: TripStatus.ONGOING,
          startTime: T0,
          dimoSegmentId: buildDeterministicLiveStartSegmentId(VEHICLE, T0),
        },
      ],
    });
    expect(result.action).toBe('NO_SAFE_REPAIR');
    expect(result.classification).toBe('CONFLICT_MISMATCH');
  });
});
