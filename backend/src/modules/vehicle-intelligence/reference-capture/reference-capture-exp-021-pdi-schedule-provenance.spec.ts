import {
  computePdiExecutedOnTime,
  computePdiProspectiveAtCreation,
} from './reference-capture-exp-021-motion.lib';
import { ReferenceCaptureSettlementShadowService } from './reference-capture-settlement-shadow.service';
import { hashCanonicalShadowResponse } from './reference-capture-settlement-shadow-response.parser';

describe('EXP-021 PDI schedule provenance', () => {
  it('separates schedule creation from request execution (delayed worker)', async () => {
    const boundaryAt = new Date('2026-09-10T12:00:00.000Z');
    const scheduleCreatedAt = new Date('2026-09-10T12:00:05.000Z');
    const scheduledAt = new Date('2026-09-10T12:00:30.000Z');
    const requestStartedAt = new Date('2026-09-10T12:00:35.000Z');

    const prospectiveAtCreation = computePdiProspectiveAtCreation({
      scheduleCreatedAt,
      candidateBoundaryAt: boundaryAt,
      scheduledAgeMs: 30_000,
    });
    const executedOnTime = computePdiExecutedOnTime({
      requestStartedAt,
      scheduledAt,
    });

    expect(prospectiveAtCreation).toBe(true);
    expect(executedOnTime).toBe(false);

    const observations: Array<{ observationJson: Record<string, unknown>; responseHash: string }> =
      [];
    const schedule = {
      id: 'sched-pdi-30',
      experimentId: 'exp-db-1',
      sessionId: 'sess-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tokenId: 187361,
      probeId: 'PDI-30',
      probeType: 'WHOLE_TRIP',
      phase: 'PHYSICAL_DRIVE_INTERVAL_SHADOW',
      sourceIntervalStart: new Date('2026-09-10T11:30:00.000Z'),
      sourceIntervalEnd: boundaryAt,
      queryFrom: new Date('2026-09-10T11:30:00.000Z'),
      queryTo: boundaryAt,
      aggregationInterval: '1s',
      scheduledAgeMs: 30_000,
      scheduledAt,
      createdAt: scheduleCreatedAt,
      status: 'EXECUTING',
      observation: null,
      idempotencyKey: 'exp|PDI-30|pdi-123|30000',
    };

    const repository = {
      findScheduleById: jest.fn().mockResolvedValue(schedule),
      findExperimentStatusById: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
      markExecutingIfEligible: jest.fn().mockResolvedValue(true),
      markSkipped: jest.fn(),
      createObservationIfEligible: jest.fn(async (input: { observationJson: Record<string, unknown>; responseHash: string }) => {
        observations.push({
          observationJson: input.observationJson,
          responseHash: input.responseHash,
        });
        return true;
      }),
    };

    const service = new ReferenceCaptureSettlementShadowService(
      { isSettlementShadowEnabled: () => true } as never,
      repository as never,
      {} as never,
      {
        queryGraphQLWithIngressTiming: jest.fn().mockResolvedValue({
          result: { data: { signals: [] } },
        }),
      } as never,
      { getVehicleJwt: jest.fn().mockResolvedValue('jwt') } as never,
      { referenceCaptureSettlementShadowObservation: { findMany: jest.fn().mockResolvedValue([]) } } as never,
    );

    jest.useFakeTimers({ now: requestStartedAt });
    await service.executeScheduledObservation('sched-pdi-30');
    jest.useRealTimers();

    expect(observations).toHaveLength(1);
    const payload = observations[0].observationJson;
    expect(payload.scheduleCreatedAt).toBe(scheduleCreatedAt.toISOString());
    expect(payload.requestStartedAt).toBe(requestStartedAt.toISOString());
    expect(payload.scheduledAt).toBe(scheduledAt.toISOString());
    expect(payload.candidateBoundaryAt).toBe(boundaryAt.toISOString());
    expect(payload.prospectiveAtCreation).toBe(true);
    expect(payload.executedOnTime).toBe(false);
    expect(payload.actualAgeMs).toBe(35_000);
    expect(payload.scheduleDriftMs).toBe(5_000);
    expect(payload.candidateStatus).toBeUndefined();
    expect(observations[0].responseHash).toBe(hashCanonicalShadowResponse(payload));
  });

  it('invalidatePhysicalDriveIntervalCandidate does not mutate completed observationJson', async () => {
    const originalJson = {
      candidateId: 'pdi-abc',
      candidateBoundaryAt: '2026-09-10T12:00:00.000Z',
      uniqueBucketIdentities: ['speed|2026-09-10T12:00:00.000Z'],
    };
    const originalHash = hashCanonicalShadowResponse(originalJson);

    const mergeExperimentMetadataJson = jest.fn().mockResolvedValue(undefined);
    const repository = {
      findExperimentBySessionId: jest.fn().mockResolvedValue({
        id: 'exp-db-1',
        metadataJson: {
          pdiCandidates: {
            'pdi-abc': {
              candidateId: 'pdi-abc',
              candidateBoundaryAt: '2026-09-10T12:00:00.000Z',
              candidateStatus: 'PROVISIONAL',
            },
          },
        },
      }),
      mergeExperimentMetadataJson,
      markSkipped: jest.fn(),
    };

    const prisma = {
      referenceCaptureSettlementShadowSchedule: {
        findMany: jest.fn().mockResolvedValue([{ id: 'sched-1', bullJobId: null }]),
      },
      referenceCaptureSettlementShadowObservation: {
        update: jest.fn(),
      },
    };

    const service = new ReferenceCaptureSettlementShadowService(
      { isSettlementShadowEnabled: () => true } as never,
      repository as never,
      { cancelQueuedJobsForSession: jest.fn() } as never,
      {} as never,
      {} as never,
      prisma as never,
    );

    await service.invalidatePhysicalDriveIntervalCandidate({
      sessionId: 'sess-1',
      candidateId: 'pdi-abc',
      reason: 'movement_resumed_after_end_candidate',
    });

    expect(prisma.referenceCaptureSettlementShadowObservation.update).not.toHaveBeenCalled();
    expect(mergeExperimentMetadataJson).toHaveBeenCalled();
    expect(originalHash).toBe(hashCanonicalShadowResponse(originalJson));
  });

  it('INVALIDATED_CANDIDATE_CANNOT_BECOME_CONFIRMED', async () => {
    const mergeExperimentMetadataJson = jest.fn().mockResolvedValue(undefined);
    const repository = {
      findExperimentBySessionId: jest.fn().mockResolvedValue({
        id: 'exp-db-1',
        metadataJson: {
          pdiCandidates: {
            'pdi-abc': {
              candidateId: 'pdi-abc',
              candidateBoundaryAt: '2026-09-10T12:00:00.000Z',
              candidateStatus: 'INVALIDATED_END_CANDIDATE',
            },
          },
        },
      }),
      mergeExperimentMetadataJson,
      markSkipped: jest.fn(),
    };

    const service = new ReferenceCaptureSettlementShadowService(
      { isSettlementShadowEnabled: () => true } as never,
      repository as never,
      { cancelQueuedJobsForSession: jest.fn() } as never,
      {} as never,
      {} as never,
      {
        referenceCaptureSettlementShadowSchedule: { findMany: jest.fn().mockResolvedValue([]) },
      } as never,
    );

    const confirmed = await service.confirmPhysicalDriveIntervalCandidate({
      sessionId: 'sess-1',
      candidateId: 'pdi-abc',
      reason: 'should_not_apply',
    });
    expect(confirmed).toBe(false);
  });
});
