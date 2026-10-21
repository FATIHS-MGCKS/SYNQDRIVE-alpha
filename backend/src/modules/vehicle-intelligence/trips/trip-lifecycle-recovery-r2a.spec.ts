import { TripDetectionState, TripStatus } from '@prisma/client';
import {
  buildMergeReopenRecoveryMeta,
  buildStartEpisodeRecoveryMeta,
  readMergeReopenFromTrip,
  readStartEpisodeFromTrip,
} from './trip-lifecycle-recovery-meta';
import {
  evaluateTripLifecycleInvariant,
  provesMergeEpisodeRelationship,
} from './trip-lifecycle-invariant';
import { TripDetectionOrchestrationService } from './trip-detection-orchestration.service';
import { buildMidGapSplitActiveFsmExtras } from './trip-mid-gap-fsm.util';

const VEHICLE = 'veh-r2a';
const T0 = new Date('2026-09-06T10:00:00.000Z');
const T0_MINUS_17S = new Date(T0.getTime() - 17_000);

describe('R2A — lifecycle recovery closure', () => {
  describe('durable start episode fingerprint', () => {
    it('matches refined effectiveStartAt via candidate episode identity', () => {
      const meta = {
        lifecycleRecovery: {
          startEpisode: buildStartEpisodeRecoveryMeta({
            vehicleId: VEHICLE,
            candidateStartAt: T0,
            effectiveStartAt: T0_MINUS_17S,
            dimoSegmentId: `v2-${VEHICLE}-${T0_MINUS_17S.getTime()}`,
          }),
        },
      };
      const result = evaluateTripLifecycleInvariant({
        vehicleId: VEHICLE,
        fsmState: TripDetectionState.POSSIBLE_START,
        possibleStartAt: T0,
        ongoingTrips: [
          {
            id: 'trip-refined',
            tripStatus: TripStatus.ONGOING,
            startTime: T0_MINUS_17S,
            dimoSegmentId: `v2-${VEHICLE}-${T0_MINUS_17S.getTime()}`,
            rawDetectionMeta: meta,
          },
        ],
      });
      expect(result.classification).toBe('RECOVERABLE_START_ORPHAN');
      expect(result.action).toBe('ADOPT_ONGOING');
      expect(readStartEpisodeFromTrip(meta)?.candidateStartAt).toBe(T0.toISOString());
    });
  });

  describe('real merge reopen crash replay', () => {
    it('recovers from persisted mergeReopen meta without mergeTargetTripId', () => {
      const mergeMeta = {
        lifecycleRecovery: {
          mergeReopen: buildMergeReopenRecoveryMeta({
            candidateStartAt: T0,
            effectiveStartAt: T0_MINUS_17S,
          }),
        },
      };
      expect(
        provesMergeEpisodeRelationship(
          {
            id: 'trip-a',
            tripStatus: TripStatus.ONGOING,
            startTime: T0_MINUS_17S,
            rawDetectionMeta: mergeMeta,
          },
          T0,
        ),
      ).toBe(true);

      const result = evaluateTripLifecycleInvariant({
        vehicleId: VEHICLE,
        fsmState: TripDetectionState.POSSIBLE_START,
        possibleStartAt: T0,
        ongoingTrips: [
          {
            id: 'trip-a',
            tripStatus: TripStatus.ONGOING,
            startTime: T0_MINUS_17S,
            rawDetectionMeta: mergeMeta,
          },
        ],
      });
      expect(result.classification).toBe('RECOVERABLE_MERGE_ORPHAN');
      expect(readMergeReopenFromTrip(mergeMeta)?.candidateStartAt).toBe(T0.toISOString());
    });
  });

  describe('executeLifecycleRecoveryAction state fidelity', () => {
    it('ADOPT_ONGOING preserves canonical possibleStartAt', async () => {
      const transitionState = jest.fn().mockResolvedValue({});
      const scheduleActiveTick = jest.fn().mockResolvedValue(undefined);
      const svc = {
        transitionState,
        scheduleActiveTick,
      } as unknown as TripDetectionOrchestrationService;

      await TripDetectionOrchestrationService.prototype.executeLifecycleRecoveryAction.call(
        svc,
        {
          vehicleId: VEHICLE,
          organizationId: 'org',
          dimoTokenId: 1,
          det: {
            possibleStartAt: T0,
            lastEvidenceSummary: {},
          } as any,
          action: 'ADOPT_ONGOING',
          tripId: 'trip-refined',
          classification: 'RECOVERABLE_START_ORPHAN',
          referencedTrip: null,
          recoveredTrip: {
            id: 'trip-refined',
            tripStatus: TripStatus.ONGOING,
            startTime: T0_MINUS_17S,
          },
        },
      );

      expect(transitionState).toHaveBeenCalledWith(
        VEHICLE,
        TripDetectionState.ACTIVE_TRIP,
        expect.objectContaining({
          activeTripId: 'trip-refined',
          possibleStartAt: T0_MINUS_17S,
          possibleStartEnteredAt: null,
        }),
      );
    });

    it('MISSING_POINTER preserves existing possibleStartAt when valid', async () => {
      const transitionState = jest.fn().mockResolvedValue({});
      const scheduleActiveTick = jest.fn().mockResolvedValue(undefined);
      const svc = {
        transitionState,
        scheduleActiveTick,
      } as unknown as TripDetectionOrchestrationService;

      await TripDetectionOrchestrationService.prototype.executeLifecycleRecoveryAction.call(
        svc,
        {
          vehicleId: VEHICLE,
          organizationId: 'org',
          dimoTokenId: 1,
          det: {
            possibleStartAt: T0,
            lastEvidenceSummary: {},
          } as any,
          action: 'ADOPT_ONGOING',
          tripId: 'trip-refined',
          classification: 'RECOVERABLE_MISSING_POINTER',
          referencedTrip: null,
          recoveredTrip: {
            id: 'trip-refined',
            tripStatus: TripStatus.ONGOING,
            startTime: T0_MINUS_17S,
          },
        },
      );

      expect(transitionState.mock.calls[0][2].possibleStartAt).toEqual(T0);
    });

    it('REPOINT_ACTIVE_TRIP uses shared mid-gap FSM builder', async () => {
      const transitionState = jest.fn().mockResolvedValue({});
      const scheduleActiveTick = jest.fn().mockResolvedValue(undefined);
      const svc = {
        transitionState,
        scheduleActiveTick,
      } as unknown as TripDetectionOrchestrationService;
      const secondStart = new Date('2026-09-06T11:30:00.000Z');

      await TripDetectionOrchestrationService.prototype.executeLifecycleRecoveryAction.call(
        svc,
        {
          vehicleId: VEHICLE,
          organizationId: 'org',
          dimoTokenId: 1,
          det: { lastEvidenceSummary: {} } as any,
          action: 'REPOINT_ACTIVE_TRIP',
          tripId: 'trip2',
          classification: 'RECOVERABLE_SPLIT_REPOINT',
          referencedTrip: {
            id: 'trip1',
            tripStatus: TripStatus.COMPLETED,
            startTime: T0,
          },
          recoveredTrip: {
            id: 'trip2',
            tripStatus: TripStatus.ONGOING,
            startTime: secondStart,
            rawDetectionMeta: { splitFrom: 'trip1' },
          },
        },
      );

      expect(transitionState).toHaveBeenCalledWith(
        VEHICLE,
        TripDetectionState.ACTIVE_TRIP,
        expect.objectContaining(
          buildMidGapSplitActiveFsmExtras({
            secondTripId: 'trip2',
            secondStartAt: secondStart,
          }),
        ),
      );
    });
  });
});
