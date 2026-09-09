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

function buildHarness() {
  const experiments = new Map<string, ExperimentRow>();
  const schedules = new Map<string, ScheduleRow>();
  const observations = new Map<string, { requestCompletedAt: Date }>();
  const removedJobs: string[] = [];

  const repository = {
    findExperimentBySessionId: jest.fn(async (sessionId: string) => {
      const row = [...experiments.values()].find((e) => e.sessionId === sessionId);
      if (!row) return null;
      return {
        ...row,
        schedules: [...schedules.values()].filter((s) => s.sessionId === sessionId),
      };
    }),
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
    skipUnobservedSchedulesForSession: jest.fn(async (sessionId: string, skipReason: string) => {
      let count = 0;
      for (const schedule of schedules.values()) {
        if (
          schedule.sessionId === sessionId &&
          (schedule.status === 'PENDING' || schedule.status === 'EXECUTING') &&
          !observations.has(schedule.id)
        ) {
          schedule.status = 'SKIPPED';
          schedule.lastError = skipReason;
          schedule.bullJobId = null;
          count += 1;
        }
      }
      return { count };
    }),
    completeObservedSchedulesForSession: jest.fn(async (sessionId: string) => {
      let count = 0;
      for (const schedule of schedules.values()) {
        if (
          schedule.sessionId === sessionId &&
          (schedule.status === 'PENDING' || schedule.status === 'EXECUTING') &&
          observations.has(schedule.id)
        ) {
          schedule.status = 'COMPLETED';
          schedule.lastError = null;
          schedule.bullJobId = null;
          count += 1;
        }
      }
      return { count };
    }),
    terminalizeExperimentOnAbort: jest.fn(
      async (
        experimentDbId: string,
        input: {
          abortReason: string;
          abortedAt: string;
          organizationId: string;
          existingMetadata: Record<string, unknown> | null;
        },
      ) => {
        const row = experiments.get(experimentDbId);
        if (!row || row.status !== REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.ACTIVE) {
          return false;
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
        return true;
      },
    ),
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
  } as unknown as ReferenceCaptureSettlementShadowRepository;

  const runner = {
    cancelQueuedJobsForSession: jest.fn(async (bullJobIds: string[]) => {
      removedJobs.push(...bullJobIds);
      return { removed: bullJobIds.length, attempted: bullJobIds.length };
    }),
    enqueueSchedule: jest.fn(),
  } as unknown as ReferenceCaptureSettlementShadowRunnerService;

  const prisma = {
    $transaction: jest.fn(async (fn: () => Promise<unknown>) => fn()),
    referenceCaptureSettlementShadowExperiment: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => experiments.get(where.id) ?? null),
    },
    referenceCaptureSettlementShadowObservation: {
      findMany: jest.fn(async () => []),
    },
  };

  const config = {
    isEnabled: () => true,
    isSettlementShadowEnabled: () => true,
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
    expect(result.schedulesSkipped).toBe(0);
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

  it('executeScheduledObservation skips cancelled experiment schedules without creating observations', async () => {
    const harness = buildHarness();
    harness.seedExperiment('sess-4');
    const experiment = harness.experiments.get('exp-db-1')!;
    experiment.status = REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.CANCELLED;
    harness.seedSchedule({ id: 'sched-4', sessionId: 'sess-4', bullJobId: null });

    await harness.service.executeScheduledObservation('sched-4');

    expect(harness.repository.markSkipped).toHaveBeenCalled();
    expect(harness.observations.size).toBe(0);
  });

  it('abort with delayed BullMQ jobs removes queued job ids before terminalizing experiment', async () => {
    const harness = buildHarness();
    harness.seedExperiment('sess-delayed');
    harness.seedSchedule({
      id: 'sched-delayed',
      sessionId: 'sess-delayed',
      bullJobId: 'rc-shadow-sched-delayed',
      scheduledAt: new Date(Date.now() + 60_000),
    });

    const result = await harness.service.cancelExperimentForAbortedSession({
      sessionId: 'sess-delayed',
      organizationId: 'org-1',
      abortReason: 'delayed_job_abort',
    });

    expect(result.jobsRemoved).toBe(1);
    expect(harness.removedJobs).toContain('rc-shadow-sched-delayed');
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
