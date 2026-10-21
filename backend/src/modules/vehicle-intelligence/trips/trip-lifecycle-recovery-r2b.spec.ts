import { TripDetectionState, TripStatus } from '@prisma/client';
import { TripDecisionEngine } from './decision/trip-decision.engine';
import { TripDetectionOrchestrationService } from './trip-detection-orchestration.service';
import {
  buildMergeReopenRecoveryMeta,
  readMergeReopenFromTrip,
  resolveMergeReopenPossibleStartAt,
} from './trip-lifecycle-recovery-meta';
import {
  evaluateTripLifecycleInvariant,
} from './trip-lifecycle-invariant';
import { TripLifecycleRecoveryService } from './trip-lifecycle-recovery.service';

const VEHICLE = 'veh-r2b';
const T08 = new Date('2026-09-06T08:00:00.000Z');
const T10 = new Date('2026-09-06T10:00:00.000Z');
const T99543 = new Date('2026-09-06T09:59:43.000Z');

describe('R2B — merge recovery state fidelity', () => {
  it('resolveMergeReopenPossibleStartAt prefers effectiveStartAt over trip.startTime', () => {
    const meta = {
      lifecycleRecovery: {
        mergeReopen: buildMergeReopenRecoveryMeta({
          candidateStartAt: T10,
          effectiveStartAt: T99543,
        }),
      },
    };
    expect(
      resolveMergeReopenPossibleStartAt({
        rawDetectionMeta: meta,
        detPossibleStartAt: T10,
      })?.toISOString(),
    ).toBe(T99543.toISOString());
  });

  it('real merge crash replay via reopenTripForMerge + recovery FSM anchor', async () => {
    const tripAId = 'trip-a';
    let persistedMeta: unknown = { prior: true };
    const prisma = {
      vehicleTrip: {
        findUnique: jest.fn().mockImplementation(async () => ({
          id: tripAId,
          rawDetectionMeta: persistedMeta,
        })),
        update: jest.fn().mockImplementation(async ({ data }) => {
          persistedMeta = data.rawDetectionMeta ?? persistedMeta;
          return {
            id: tripAId,
            vehicleId: VEHICLE,
            tripStatus: TripStatus.ONGOING,
            startTime: T08,
            endTime: null,
            rawDetectionMeta: persistedMeta,
          };
        }),
        findMany: jest.fn(),
      },
    };

    const engine = new TripDecisionEngine(prisma as never);
    const reopened = await engine.reopenTripForMerge({
      targetTripId: tripAId,
      lifecycleRecovery: {
        candidateStartAt: T10,
        effectiveStartAt: T99543,
      },
    });

    expect(reopened.tripStatus).toBe(TripStatus.ONGOING);
    expect(reopened.endTime).toBeNull();
    const merge = readMergeReopenFromTrip(persistedMeta);
    expect(merge?.candidateStartAt).toBe(T10.toISOString());
    expect(merge?.effectiveStartAt).toBe(T99543.toISOString());

    const invariant = evaluateTripLifecycleInvariant({
      vehicleId: VEHICLE,
      fsmState: TripDetectionState.POSSIBLE_START,
      possibleStartAt: T10,
      ongoingTrips: [
        {
          id: tripAId,
          tripStatus: TripStatus.ONGOING,
          startTime: T08,
          rawDetectionMeta: persistedMeta,
        },
      ],
    });
    expect(invariant.classification).toBe('RECOVERABLE_MERGE_ORPHAN');

    const transitionState = jest.fn().mockResolvedValue({});
    const scheduleActiveTick = jest.fn().mockResolvedValue(undefined);
    const svc = { transitionState, scheduleActiveTick } as unknown as TripDetectionOrchestrationService;

    await TripDetectionOrchestrationService.prototype.executeLifecycleRecoveryAction.call(
      svc,
      {
        vehicleId: VEHICLE,
        organizationId: 'org',
        dimoTokenId: 1,
        det: {
          possibleStartAt: T10,
          lastEvidenceSummary: {},
        } as any,
        action: 'ADOPT_ONGOING',
        tripId: tripAId,
        classification: 'RECOVERABLE_MERGE_ORPHAN',
        referencedTrip: null,
        recoveredTrip: {
          id: tripAId,
          tripStatus: TripStatus.ONGOING,
          startTime: T08,
          rawDetectionMeta: persistedMeta,
        },
      },
    );

    expect(transitionState.mock.calls[0][2].possibleStartAt).toEqual(T99543);
    expect(transitionState.mock.calls[0][2].possibleStartAt).not.toEqual(T08);

    const secondInvariant = evaluateTripLifecycleInvariant({
      vehicleId: VEHICLE,
      fsmState: TripDetectionState.ACTIVE_TRIP,
      activeTripId: tripAId,
      possibleStartAt: T99543,
      ongoingTrips: [
        {
          id: tripAId,
          tripStatus: TripStatus.ONGOING,
          startTime: T08,
          rawDetectionMeta: persistedMeta,
        },
      ],
      referencedTrip: {
        id: tripAId,
        tripStatus: TripStatus.ONGOING,
        startTime: T08,
        rawDetectionMeta: persistedMeta,
      },
    });
    expect(secondInvariant.classification).toBe('HEALTHY');
    expect(transitionState).toHaveBeenCalledTimes(1);
  });

  it('recovery service idempotent on second merge orphan attempt', async () => {
    const executeLifecycleRecoveryAction = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      vehicleTrip: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'trip-a',
            tripStatus: TripStatus.ONGOING,
            startTime: T08,
            rawDetectionMeta: {
              lifecycleRecovery: {
                mergeReopen: buildMergeReopenRecoveryMeta({
                  candidateStartAt: T10,
                  effectiveStartAt: T99543,
                }),
              },
            },
          },
        ]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new TripLifecycleRecoveryService(
      prisma as any,
      { executeLifecycleRecoveryAction } as any,
      undefined,
    );

    const det = {
      vehicleId: VEHICLE,
      state: TripDetectionState.ACTIVE_TRIP,
      activeTripId: 'trip-a',
      possibleStartAt: T99543,
    } as any;

    const first = await service.attemptRecovery({
      det,
      organizationId: 'org',
      dimoTokenId: 1,
    });
    expect(first.recovered).toBe(false);
    expect(first.evaluated.classification).toBe('HEALTHY');
    expect(executeLifecycleRecoveryAction).not.toHaveBeenCalled();
  });
});
