import { ReferenceCaptureSettlementShadowProbeType } from '@prisma/client';
import { ReferenceCaptureConfig } from './reference-capture.config';
import {
  REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS,
} from './reference-capture-settlement-shadow.constants';
import { ReferenceCaptureSettlementShadowRepository } from './reference-capture-settlement-shadow.repository';
import { ReferenceCaptureSettlementShadowRunnerService } from './reference-capture-settlement-shadow-runner.service';
import { ReferenceCaptureSettlementShadowService } from './reference-capture-settlement-shadow.service';

type ExperimentRow = {
  id: string;
  experimentId: string;
  sessionId: string;
  organizationId: string;
  vehicleId: string;
  tokenId: number;
  status: string;
  metadataJson: Record<string, unknown> | null;
  lastSyncedPhaseCount: number;
};

type ScheduleRow = {
  id: string;
  experimentId: string;
  sessionId: string;
  organizationId: string;
  vehicleId: string;
  tokenId: number;
  probeId: string;
  probeType: ReferenceCaptureSettlementShadowProbeType;
  phase: string | null;
  sourceIntervalStart: Date;
  sourceIntervalEnd: Date;
  queryFrom: Date;
  queryTo: Date;
  aggregationInterval: string;
  scheduledAgeMs: number;
  scheduledAt: Date;
  status: string;
  attemptCount: number;
  executedAt: Date | null;
  bullJobId: string | null;
  idempotencyKey: string;
  lastError: string | null;
  observation?: { requestCompletedAt: Date };
};

function buildHarness(options?: { settlementShadowEnabled?: boolean }) {
  const settlementShadowEnabled = options?.settlementShadowEnabled ?? true;
  const experiments = new Map<string, ExperimentRow>();
  const schedules = new Map<string, ScheduleRow>();
  const observations = new Map<string, { requestCompletedAt: Date }>();
  const removedJobs: string[] = [];
  let transactionShouldFail = false;

  const terminalizeInTx = async (
    _tx: unknown,
    input: {
      sessionId: string;
      experimentDbId: string;
      abortReason: string;
      abortedAt: string;
      organizationId: string;
      skipReason: string;
    },
  ) => {
    if (transactionShouldFail) {
      throw new Error('simulated_db_transaction_failure');
    }
    let schedulesSkipped = 0;
    let schedulesCompleted = 0;
    for (const schedule of schedules.values()) {
      if (schedule.sessionId !== input.sessionId) continue;
      if (schedule.status !== 'PENDING' && schedule.status !== 'EXECUTING') continue;
      if (observations.has(schedule.id)) {
        schedule.status = 'COMPLETED';
        schedule.bullJobId = null;
        schedulesCompleted += 1;
      } else {
        schedule.status = 'SKIPPED';
        schedule.lastError = input.skipReason;
        schedule.bullJobId = null;
        schedulesSkipped += 1;
      }
    }
    const row = experiments.get(input.experimentDbId);
    if (!row || row.status !== REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.ACTIVE) {
      return { schedulesSkipped, schedulesCompleted, terminalized: false };
    }
    row.status = REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.CANCELLED;
    row.metadataJson = {
      ...(row.metadataJson ?? {}),
      terminalization: {
        reason: 'RC_SESSION_ABORTED',
        abortReason: input.abortReason,
        abortedAt: input.abortedAt,
        organizationId: input.organizationId,
      },
    };
    return { schedulesSkipped, schedulesCompleted, terminalized: true };
  };

  const repository = {
    findExperimentBySessionId: jest.fn(async (sessionId: string) => {
      const row = [...experiments.values()].find((e) => e.sessionId === sessionId);
      if (!row) return null;
      return {
        ...row,
        schedules: [...schedules.values()].filter((s) => s.sessionId === sessionId),
      };
    }),
    findAbortedSessionsWithActiveExperiments: jest.fn(async () =>
      [...experiments.values()]
        .filter((e) => e.status === REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.ACTIVE)
        .map((e) => ({
          id: e.id,
          sessionId: e.sessionId,
          organizationId: e.organizationId,
          session: { organizationId: e.organizationId, failureReason: 'aborted_session' },
        })),
    ),
    findActiveBullJobIdsForSession: jest.fn(async (sessionId: string) =>
      [...schedules.values()]
        .filter(
          (s) =>
            s.sessionId === sessionId &&
            s.bullJobId &&
            (s.status === 'PENDING' || s.status === 'EXECUTING'),
        )
        .map((s) => ({ id: s.id, bullJobId: s.bullJobId! })),
    ),
    terminalizeAbortedSessionInTransaction: jest.fn(terminalizeInTx),
    findExperimentStatusById: jest.fn(async (experimentDbId: string) => {
      const row = experiments.get(experimentDbId);
      return row ? { status: row.status } : null;
    }),
    findScheduleById: jest.fn(async (scheduleId: string) => {
      const schedule = schedules.get(scheduleId);
      if (!schedule) return null;
      const observation = observations.get(scheduleId);
      return { ...schedule, observation: observation ?? null };
    }),
    markSkipped: jest.fn(async (scheduleId: string, reason: string) => {
      const schedule = schedules.get(scheduleId);
      if (!schedule) return;
      schedule.status = 'SKIPPED';
      schedule.lastError = reason;
    }),
    markExecutingIfEligible: jest.fn(async (scheduleId: string, experimentDbId: string) => {
      const schedule = schedules.get(scheduleId);
      const experiment = experiments.get(experimentDbId);
      if (!schedule || !experiment) return false;
      if (experiment.status !== REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.ACTIVE) {
        return false;
      }
      if (schedule.status !== 'PENDING' || observations.has(scheduleId)) {
        return false;
      }
      schedule.status = 'EXECUTING';
      schedule.attemptCount += 1;
      return true;
    }),
    markCompleted: jest.fn(async (scheduleId: string, executedAt: Date) => {
      const schedule = schedules.get(scheduleId);
      if (schedule) {
        schedule.status = 'COMPLETED';
        schedule.executedAt = executedAt;
      }
    }),
    markFailed: jest.fn(),
    createObservationIfEligible: jest.fn(async (input: { scheduleId: string }) => {
      observations.set(input.scheduleId, { requestCompletedAt: new Date() });
      return true;
    }),
  } as unknown as ReferenceCaptureSettlementShadowRepository;

  const runner = {
    cancelQueuedJobsForSession: jest.fn(async (bullJobIds: string[]) => {
      removedJobs.push(...bullJobIds);
      return { removed: bullJobIds.length, attempted: bullJobIds.length };
    }),
    enqueueSchedule: jest.fn(),
  } as unknown as ReferenceCaptureSettlementShadowRunnerService;

  const prisma = {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    referenceCaptureSettlementShadowObservation: {
      findMany: jest.fn(async () => []),
    },
  };

  const config = {
    isEnabled: () => settlementShadowEnabled,
    isSettlementShadowEnabled: () => settlementShadowEnabled,
  } as ReferenceCaptureConfig;

  const service = new ReferenceCaptureSettlementShadowService(
    config,
    repository,
    runner,
    {} as never,
    {} as never,
    prisma as never,
  );

  return {
    service,
    repository,
    runner,
    experiments,
    schedules,
    observations,
    removedJobs,
    setTransactionShouldFail(value: boolean) {
      transactionShouldFail = value;
    },
    seedExperiment(sessionId: string) {
      const row: ExperimentRow = {
        id: 'exp-db-1',
        experimentId: 'exp-021-test',
        sessionId,
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        tokenId: 187361,
        status: REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.ACTIVE,
        metadataJson: { channel: 'SETTLEMENT_SHADOW' },
        lastSyncedPhaseCount: 0,
      };
      experiments.set(row.id, row);
      return row;
    },
    seedSchedule(input: Partial<ScheduleRow> & { id: string; sessionId: string }) {
      const row: ScheduleRow = {
        experimentId: 'exp-db-1',
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        tokenId: 187361,
        probeId: 'probe-a',
        probeType: ReferenceCaptureSettlementShadowProbeType.FIXED_INTERVAL,
        phase: '60000',
        sourceIntervalStart: new Date('2026-09-09T10:00:00.000Z'),
        sourceIntervalEnd: new Date('2026-09-09T10:01:00.000Z'),
        queryFrom: new Date('2026-09-09T10:00:00.000Z'),
        queryTo: new Date('2026-09-09T10:01:00.000Z'),
        aggregationInterval: '1s',
        scheduledAgeMs: 30000,
        scheduledAt: new Date('2026-09-09T10:01:30.000Z'),
        status: 'PENDING',
        attemptCount: 0,
        executedAt: null,
        bullJobId: 'rc-shadow-sched-1',
        idempotencyKey: 'key-1',
        lastError: null,
        ...input,
      };
      schedules.set(row.id, row);
      return row;
    },
  };
}

describe('reference-capture-settlement-shadow abort lifecycle', () => {
  it('abort before settlement experiment exists is a no-op', async () => {
    const { service } = buildHarness();
    const result = await service.cancelExperimentForAbortedSession({
      sessionId: 'sess-none',
      organizationId: 'org-1',
      abortReason: 'operator_abort',
    });
    expect(result.cancelled).toBe(false);
    expect(result.cleanupFailed).toBe(false);
    expect(result.schedulesSkipped).toBe(0);
  });

  it('FEATURE_DISABLED_EXISTING_EXPERIMENT_ABORT_CLEANUP = PASS', async () => {
    const harness = buildHarness({ settlementShadowEnabled: false });
    harness.seedExperiment('sess-disabled');
    harness.seedSchedule({ id: 'sched-disabled', sessionId: 'sess-disabled', bullJobId: 'job-disabled' });

    const result = await harness.service.cancelExperimentForAbortedSession({
      sessionId: 'sess-disabled',
      organizationId: 'org-1',
      abortReason: 'feature_disabled_abort_cleanup',
    });

    expect(result.cancelled).toBe(true);
    expect(result.cleanupFailed).toBe(false);
    expect(harness.experiments.get('exp-db-1')?.status).toBe(
      REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.CANCELLED,
    );
  });

  it('abort with experiment but no observations skips pending schedules and cancels jobs', async () => {
    const harness = buildHarness();
    harness.seedExperiment('sess-1');
    harness.seedSchedule({ id: 'sched-1', sessionId: 'sess-1', bullJobId: 'job-1' });
    harness.seedSchedule({ id: 'sched-2', sessionId: 'sess-1', bullJobId: 'job-2' });

    const result = await harness.service.cancelExperimentForAbortedSession({
      sessionId: 'sess-1',
      organizationId: 'org-1',
      abortReason: 'exp021_stationary_certification_non_physical_dry_run',
    });

    expect(result.cancelled).toBe(true);
    expect(result.schedulesSkipped).toBe(2);
    expect(result.jobsRemoved).toBe(2);
    expect(harness.repository.terminalizeAbortedSessionInTransaction).toHaveBeenCalled();
    expect(harness.experiments.get('exp-db-1')?.status).toBe(
      REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.CANCELLED,
    );
    expect([...harness.schedules.values()].every((s) => s.status === 'SKIPPED')).toBe(true);
    expect(harness.removedJobs).toEqual(['job-1', 'job-2']);
  });

  it('abort with persisted observations preserves evidence and completes observed schedules', async () => {
    const harness = buildHarness();
    harness.seedExperiment('sess-2');
    harness.seedSchedule({ id: 'sched-obs', sessionId: 'sess-2', bullJobId: 'job-obs' });
    harness.observations.set('sched-obs', { requestCompletedAt: new Date('2026-09-09T10:02:00.000Z') });
    harness.seedSchedule({ id: 'sched-pending', sessionId: 'sess-2', bullJobId: 'job-pending' });

    const result = await harness.service.cancelExperimentForAbortedSession({
      sessionId: 'sess-2',
      organizationId: 'org-1',
      abortReason: 'operator_abort',
    });

    expect(result.schedulesCompleted).toBe(1);
    expect(result.schedulesSkipped).toBe(1);
    expect(harness.schedules.get('sched-obs')?.status).toBe('COMPLETED');
    expect(harness.observations.has('sched-obs')).toBe(true);
    expect(harness.schedules.get('sched-pending')?.status).toBe('SKIPPED');
  });

  it('surfaces cleanup failure and reconciles later', async () => {
    const harness = buildHarness();
    harness.seedExperiment('sess-fail');
    harness.seedSchedule({ id: 'sched-fail', sessionId: 'sess-fail', bullJobId: 'job-fail' });
    harness.setTransactionShouldFail(true);

    const failed = await harness.service.cancelExperimentForAbortedSession({
      sessionId: 'sess-fail',
      organizationId: 'org-1',
      abortReason: 'cleanup_failure',
    });
    expect(failed.cleanupFailed).toBe(true);
    expect(failed.cancelled).toBe(false);
    expect(harness.experiments.get('exp-db-1')?.status).toBe(
      REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.ACTIVE,
    );

    harness.setTransactionShouldFail(false);
    const reconciled = await harness.service.reconcileAbortedSessionSettlementExperiments();
    expect(reconciled).toBe(1);
    expect(harness.experiments.get('exp-db-1')?.status).toBe(
      REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.CANCELLED,
    );
  });

  it('abort called twice is idempotent', async () => {
    const harness = buildHarness();
    harness.seedExperiment('sess-3');
    harness.seedSchedule({ id: 'sched-3', sessionId: 'sess-3', bullJobId: 'job-3' });

    const first = await harness.service.cancelExperimentForAbortedSession({
      sessionId: 'sess-3',
      organizationId: 'org-1',
      abortReason: 'first_abort',
    });
    const second = await harness.service.cancelExperimentForAbortedSession({
      sessionId: 'sess-3',
      organizationId: 'org-1',
      abortReason: 'second_abort',
    });

    expect(first.cancelled).toBe(true);
    expect(second.alreadyTerminal).toBe(true);
    expect(harness.runner.cancelQueuedJobsForSession).toHaveBeenCalledTimes(1);
  });

  it('CANCELLED experiment cannot create new observation after concurrent abort race', async () => {
    const harness = buildHarness();
    harness.seedExperiment('sess-race');
    harness.seedSchedule({ id: 'sched-race', sessionId: 'sess-race', bullJobId: null, status: 'EXECUTING' });

    const dimoTelemetry = {
      queryGraphQLWithIngressTiming: jest.fn().mockResolvedValue({
        result: { data: { signals: [{ timestamp: '2026-09-09T10:03:32.000Z', speed: 10 }] } },
      }),
    };
    const dimoAuth = { getVehicleJwt: jest.fn().mockResolvedValue('jwt') };
    const service = new ReferenceCaptureSettlementShadowService(
      { isEnabled: () => true, isSettlementShadowEnabled: () => true } as ReferenceCaptureConfig,
      harness.repository,
      harness.runner,
      dimoTelemetry as never,
      dimoAuth as never,
      {
        referenceCaptureSettlementShadowObservation: { findMany: jest.fn().mockResolvedValue([]) },
      } as never,
    );

    harness.experiments.get('exp-db-1')!.status =
      REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.CANCELLED;

    await service.executeScheduledObservation('sched-race');

    expect(harness.repository.createObservationIfEligible).not.toHaveBeenCalled();
    expect(harness.observations.size).toBe(0);
  });

  it('markExecutingIfEligible refuses cancelled experiment schedules', async () => {
    const harness = buildHarness();
    harness.seedExperiment('sess-claim');
    harness.seedSchedule({ id: 'sched-claim', sessionId: 'sess-claim', bullJobId: null });
    harness.experiments.get('exp-db-1')!.status =
      REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.CANCELLED;

    const claimed = await harness.repository.markExecutingIfEligible('sched-claim', 'exp-db-1');
    expect(claimed).toBe(false);
    expect(harness.schedules.get('sched-claim')?.status).toBe('PENDING');
  });

  it('active experiment without abort still allows sync scheduling path', async () => {
    const harness = buildHarness();
    harness.seedExperiment('sess-active');

    await harness.service.syncCompletedPhasesFromSession({
      sessionId: 'sess-active',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tokenId: 187361,
      acquisitionStateJson: {
        hfCalibrationSeries: {
          calibrationSeriesId: 'series-active',
          vehicleId: 'veh-1',
          tokenId: 187361,
          seriesStartedAt: '2026-09-09T10:00:00.000Z',
          activePhase: {
            effectivePollIntervalMs: 60000,
            phaseStartedAt: '2026-09-09T10:00:00.000Z',
          },
          pendingPhaseRequest: null,
          completedPhaseSummaries: [],
          completedPhases: [],
        },
      },
    });

    expect(harness.experiments.get('exp-db-1')?.status).toBe(
      REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.ACTIVE,
    );
  });

  it('syncCompletedPhasesFromSession does not schedule probes for cancelled experiment', async () => {
    const harness = buildHarness();
    harness.seedExperiment('sess-5');
    const experiment = harness.experiments.get('exp-db-1')!;
    experiment.status = REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.CANCELLED;

    await harness.service.syncCompletedPhasesFromSession({
      sessionId: 'sess-5',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tokenId: 187361,
      acquisitionStateJson: {
        hfCalibrationSeries: {
          calibrationSeriesId: 'series-1',
          vehicleId: 'veh-1',
          tokenId: 187361,
          seriesStartedAt: '2026-09-09T10:00:00.000Z',
          activePhase: {
            effectivePollIntervalMs: 60000,
            phaseStartedAt: '2026-09-09T10:00:00.000Z',
          },
          pendingPhaseRequest: null,
          completedPhaseSummaries: [],
          completedPhases: [],
        },
      },
    });

    expect(harness.runner.enqueueSchedule).not.toHaveBeenCalled();
  });
});
