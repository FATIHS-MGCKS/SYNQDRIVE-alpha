import { ReferenceCaptureSessionStatus } from '@prisma/client';
import { ReferenceCaptureConfig } from './reference-capture.config';
import {
  computeActualAgeMs,
  computeScheduleDriftMs,
  computeScheduleTimingProjection,
  EXP021_PHASE_STABILIZATION_MS,
  EXP021_PRIMARY_PROBE_DURATION_MS,
  resolveProbeBStartOffsetMs,
} from './reference-capture-settlement-shadow.policy';
import { resolveNominalPhaseDurationMs } from './reference-capture-exp021-calibration-plan.lib';
import { ReferenceCaptureSettlementShadowRepository } from './reference-capture-settlement-shadow.repository';
import { ReferenceCaptureSettlementShadowRunnerService } from './reference-capture-settlement-shadow-runner.service';
import { ReferenceCaptureSettlementShadowService } from './reference-capture-settlement-shadow.service';
import { ReferenceCaptureProcessor } from '../../../workers/processors/reference-capture.processor';
import { buildReferenceCaptureCycleJobId } from './reference-capture-queue.util';

describe('reference-capture-settlement-shadow runtime (EXP-021 hardening)', () => {
  const config = {
    isEnabled: () => true,
    isSettlementShadowEnabled: () => true,
    getCycleIntervalMs: () => 5000,
    getSlowCycleEvery: () => 6,
    getMaxTransientRetries: () => 5,
    getTransientRetryBaseDelayMs: () => 1000,
  } as ReferenceCaptureConfig;

  const phaseStartIso = '2026-09-07T10:00:00.000Z';
  const phaseStartMs = Date.parse(phaseStartIso);

  function buildActiveAcquisitionState() {
    return {
      cycleCount: 2,
      hfCalibrationSeries: {
        calibrationSeriesId: 'series-1',
        vehicleId: 'veh-1',
        tokenId: 187336,
        seriesStartedAt: phaseStartIso,
        phaseOrder: [180_000],
        activePhase: {
          phaseStartedAt: phaseStartIso,
          effectivePollIntervalMs: 180_000,
          calibrationPhaseId: 'phase-180',
          phaseSequence: 1,
          phaseEndedAt: null,
          phaseProvenance: 'PHYSICAL_T0',
        },
        completedPhases: [],
        completedPhaseSummaries: [],
        pendingPhaseRequest: null,
        terminalFinalizationAt: null,
        lastPhaseBoundaryAt: phaseStartIso,
        controlPlaneRevision: 1,
      },
    };
  }

  function buildSettlementMocks() {
    const scheduleRows: Array<{
      probeId: string;
      scheduledAgeMs: number;
      scheduledAt: Date;
      sourceIntervalEnd: Date;
      idempotencyKey: string;
    }> = [];

    const repository = {
      findExperimentBySessionId: jest.fn().mockResolvedValue({
        id: 'exp-db-1',
        experimentId: 'exp-021-test',
        sessionId: 'sess-1',
        status: 'ACTIVE',
        lastSyncedPhaseCount: 0,
      }),
      findExperimentStatusById: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
      createExperiment: jest.fn(),
      createSchedulesIfAbsent: jest.fn(
        async (
          rows: Array<{
            probeId: string;
            scheduledAgeMs: number;
            scheduledAt: Date;
            sourceIntervalEnd: Date;
            idempotencyKey: string;
          }>,
        ) => {
          let created = 0;
          for (const row of rows) {
            if (scheduleRows.some((s) => s.idempotencyKey === row.idempotencyKey)) continue;
            scheduleRows.push(row);
            created += 1;
          }
          return { created, skipped: rows.length - created };
        },
      ),
      updateLastSyncedPhaseCount: jest.fn(),
      findExperimentsMissingWholeTripShadow: jest.fn().mockResolvedValue([]),
    } as unknown as ReferenceCaptureSettlementShadowRepository;

    const runner = {
      enqueueSchedule: jest.fn(),
    } as unknown as ReferenceCaptureSettlementShadowRunnerService;

    const service = new ReferenceCaptureSettlementShadowService(
      config,
      repository,
      runner,
      { queryGraphQLWithIngressTiming: jest.fn() } as never,
      { getVehicleJwt: jest.fn() } as never,
      {
        referenceCaptureSettlementShadowSchedule: { findMany: jest.fn().mockResolvedValue([]) },
        referenceCaptureSettlementShadowObservation: { findMany: jest.fn() },
        vehicleTrip: { findMany: jest.fn() },
      } as never,
    );

    return { repository, runner, service, scheduleRows };
  }

  it('ReferenceCaptureProcessor invokes settlement sync during RECORDING cycle', async () => {
    const settlementShadow = {
      isEnabled: () => true,
      syncCompletedPhasesFromSession: jest.fn().mockResolvedValue(undefined),
    };
    const sessionRepo = {
      findById: jest
        .fn()
        .mockResolvedValueOnce({
          status: ReferenceCaptureSessionStatus.RECORDING,
          startedAt: new Date(phaseStartIso),
          preflightJson: { broadObservationFields: [] },
          acquisitionStateJson: buildActiveAcquisitionState(),
        })
        .mockResolvedValueOnce({
          status: ReferenceCaptureSessionStatus.RECORDING,
          startedAt: new Date(phaseStartIso),
          preflightJson: { broadObservationFields: [] },
          acquisitionStateJson: buildActiveAcquisitionState(),
        }),
      updateStatus: jest.fn(),
    };
    const acquisition = {
      executeAcquisitionCycle: jest.fn().mockResolvedValue({
        skippedConcurrentCycle: false,
        cycleNumber: 2,
      }),
    };
    const runner = {
      shouldContinueRecording: jest.fn().mockResolvedValue(true),
      scheduleNextCycle: jest.fn(),
      cancelPendingCycleJob: jest.fn(),
      cycleJobId: () => 'job',
    };
    const writer = { clearSession: jest.fn(), enqueueAndMaybeFlush: jest.fn(), flush: jest.fn() };

    const processor = new ReferenceCaptureProcessor(
      config as never,
      sessionRepo as never,
      acquisition as never,
      runner as never,
      writer as never,
      settlementShadow as never,
    );

    await processor.process({
      id: buildReferenceCaptureCycleJobId('sess-1', 2, 'uuid'),
      data: {
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        sessionId: 'sess-1',
        manifestVersion: '1.1.0',
        powertrainProfile: null,
        cycleNumber: 2,
        cycleUuid: 'uuid',
      },
    } as never);

    expect(settlementShadow.syncCompletedPhasesFromSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-1',
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        tokenId: 187336,
      }),
    );
  });

  it('runtime lifecycle: prospective A/B schedules created before early-age deadlines (nominal 300s phase)', async () => {
    const { service, scheduleRows } = buildSettlementMocks();
    const scheduleCreatedAtMs = phaseStartMs + 60_000;

    jest.spyOn(Date, 'now').mockReturnValue(scheduleCreatedAtMs);

    await service.syncCompletedPhasesFromSession({
      sessionId: 'sess-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tokenId: 187336,
      acquisitionStateJson: buildActiveAcquisitionState(),
    });

    jest.spyOn(Date, 'now').mockRestore();

    const nominalDurationMs = resolveNominalPhaseDurationMs(180_000);
    const probeAEndMs = phaseStartMs + EXP021_PHASE_STABILIZATION_MS + EXP021_PRIMARY_PROBE_DURATION_MS;
    const probeBEndMs =
      phaseStartMs + resolveProbeBStartOffsetMs(nominalDurationMs) + EXP021_PRIMARY_PROBE_DURATION_MS;

    const assertOnTime = (probeId: string, ageMs: number, sourceEndMs: number) => {
      const row = scheduleRows.find((r) => r.probeId === probeId && r.scheduledAgeMs === ageMs);
      expect(row).toBeDefined();
      const projection = computeScheduleTimingProjection({
        sourceIntervalEndMs: sourceEndMs,
        scheduledAgeMs: ageMs,
        scheduleCreatedAtMs,
      });
      expect(projection.executableOnTime).toBe(true);
      expect(row!.scheduledAt.getTime()).toBe(sourceEndMs + ageMs);
    };

    assertOnTime('SP-180-A', 30_000, probeAEndMs);
    assertOnTime('SP-180-A', 60_000, probeAEndMs);
    assertOnTime('SP-180-B', 30_000, probeBEndMs);
    assertOnTime('SP-180-B', 60_000, probeBEndMs);

    expect(scheduleRows.filter((r) => r.probeId.startsWith('SP-180-')).length).toBe(12);
  });

  it('prospective schedule creation is idempotent across repeated sync calls', async () => {
    const { service, scheduleRows, repository } = buildSettlementMocks();

    for (let i = 0; i < 3; i += 1) {
      await service.syncCompletedPhasesFromSession({
        sessionId: 'sess-1',
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        tokenId: 187336,
        acquisitionStateJson: buildActiveAcquisitionState(),
      });
    }

    expect(scheduleRows).toHaveLength(12);
    expect(repository.createSchedulesIfAbsent).toHaveBeenCalled();
    const lastCall = (repository.createSchedulesIfAbsent as jest.Mock).mock.results.at(-1)?.value;
    await expect(lastCall).resolves.toEqual(expect.objectContaining({ created: 0, skipped: 6 }));
  });

  it('executeScheduledObservation records actualAgeMs and scheduleDriftMs within tolerance at due time', async () => {
    const probeAEndMs = phaseStartMs + EXP021_PHASE_STABILIZATION_MS + EXP021_PRIMARY_PROBE_DURATION_MS;
    const scheduledAgeMs = 30_000;
    const requestStartedAt = new Date(probeAEndMs + scheduledAgeMs + 2_000);

    const schedule = {
      id: 'sched-a30',
      experimentId: 'exp-db-1',
      sessionId: 'sess-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tokenId: 187336,
      probeId: 'SP-180-A',
      probeType: 'FIXED_INTERVAL',
      phase: '60s',
      sourceIntervalStart: new Date(probeAEndMs - EXP021_PRIMARY_PROBE_DURATION_MS),
      sourceIntervalEnd: new Date(probeAEndMs),
      queryFrom: new Date(probeAEndMs - EXP021_PRIMARY_PROBE_DURATION_MS),
      queryTo: new Date(probeAEndMs),
      aggregationInterval: '1s',
      scheduledAgeMs,
      status: 'PENDING',
      observation: null,
    };

    const observations: unknown[] = [];
    const repository = {
      findScheduleById: jest.fn().mockResolvedValue(schedule),
      findExperimentStatusById: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
      markExecuting: jest.fn(),
      markExecutingIfEligible: jest.fn().mockResolvedValue(true),
      markCompleted: jest.fn(),
      markFailed: jest.fn(),
      markSkipped: jest.fn(),
      createObservationIfEligible: jest.fn(async (input: { actualAgeMs: number; scheduleDriftMs: number }) => {
        observations.push(input);
        return true;
      }),
    } as unknown as ReferenceCaptureSettlementShadowRepository;

    const service = new ReferenceCaptureSettlementShadowService(
      config,
      repository,
      { enqueueSchedule: jest.fn() } as never,
      {
        queryGraphQLWithIngressTiming: jest.fn().mockResolvedValue({
          result: { data: { signals: [{ timestamp: '2026-09-07T10:03:32.000Z', speed: 10 }] } },
        }),
      } as never,
      { getVehicleJwt: jest.fn().mockResolvedValue('jwt') } as never,
      { referenceCaptureSettlementShadowObservation: { findMany: jest.fn().mockResolvedValue([]) } } as never,
    );

    jest.useFakeTimers();
    jest.setSystemTime(requestStartedAt);

    await service.executeScheduledObservation('sched-a30');

    jest.useRealTimers();

    expect(observations).toHaveLength(1);
    const obs = observations[0] as { actualAgeMs: number; scheduleDriftMs: number };
    expect(obs.actualAgeMs).toBe(computeActualAgeMs(requestStartedAt.getTime(), probeAEndMs));
    expect(obs.scheduleDriftMs).toBe(computeScheduleDriftMs(obs.actualAgeMs, scheduledAgeMs));
    expect(obs.scheduleDriftMs).toBeGreaterThanOrEqual(0);
    expect(obs.scheduleDriftMs).toBeLessThanOrEqual(5_000);
  });

  it('recoverWholeTripShadowForPendingExperiments selects partial whole-trip schedule counts', async () => {
    const repository = {
      findExperimentsMissingWholeTripShadow: jest.fn().mockResolvedValue([
        {
          id: 'exp-partial',
          sessionId: 'sess-partial',
          organizationId: 'org-1',
          vehicleId: 'veh-1',
          tokenId: 187336,
          vehicleTripId: 'trip-1',
          tripEndTime: new Date('2026-09-07T11:00:00.000Z'),
          schedules: [{ id: 'wt-1' }, { id: 'wt-2' }],
          session: {
            id: 'sess-partial',
            organizationId: 'org-1',
            vehicleId: 'veh-1',
            startedAt: new Date('2026-09-07T10:00:00.000Z'),
            stoppedAt: new Date('2026-09-07T11:00:00.000Z'),
            completedAt: new Date('2026-09-07T11:00:00.000Z'),
            status: 'COMPLETED',
          },
        },
      ]),
      findExperimentBySessionId: jest.fn().mockResolvedValue({
        id: 'exp-partial',
        experimentId: 'exp-021-partial',
        sessionId: 'sess-partial',
        metadataJson: null,
      }),
      createSchedulesIfAbsent: jest.fn().mockResolvedValue({ created: 4, skipped: 2 }),
      updateExperimentTripBinding: jest.fn(),
      mergeExperimentMetadataJson: jest.fn(),
    } as unknown as ReferenceCaptureSettlementShadowRepository;

    const service = new ReferenceCaptureSettlementShadowService(
      config,
      repository,
      { enqueueSchedule: jest.fn() } as never,
      { queryGraphQLWithIngressTiming: jest.fn() } as never,
      { getVehicleJwt: jest.fn() } as never,
      {
        referenceCaptureSettlementShadowSchedule: { findMany: jest.fn().mockResolvedValue([]) },
        vehicleTrip: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'trip-1',
              tripStatus: 'COMPLETED',
              startTime: new Date('2026-09-07T10:00:00.000Z'),
              endTime: new Date('2026-09-07T11:00:00.000Z'),
            },
          ]),
        },
      } as never,
    );

    const recovered = await service.recoverWholeTripShadowForPendingExperiments();
    expect(recovered).toBe(1);
    expect(repository.createSchedulesIfAbsent).toHaveBeenCalled();
    const rows = (repository.createSchedulesIfAbsent as jest.Mock).mock.calls[0][0];
    expect(rows).toHaveLength(6);
  });
});
