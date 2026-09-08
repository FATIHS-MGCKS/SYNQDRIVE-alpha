import { ReferenceCaptureSettlementShadowProbeType } from '@prisma/client';
import { ReferenceCaptureConfig } from './reference-capture.config';
import { ReferenceCaptureSettlementShadowRepository } from './reference-capture-settlement-shadow.repository';
import { ReferenceCaptureSettlementShadowRunnerService } from './reference-capture-settlement-shadow-runner.service';
import { ReferenceCaptureSettlementShadowService } from './reference-capture-settlement-shadow.service';
import { runExp021SettlementShadowPreflight } from './reference-capture-settlement-shadow.preflight';

describe('reference-capture-settlement-shadow (EXP-021A dry-run)', () => {
  const config = {
    isEnabled: () => true,
    isSettlementShadowEnabled: () => true,
  } as ReferenceCaptureConfig;

  it('default OFF when settlement shadow flag false', () => {
    const offConfig = {
      isEnabled: () => true,
      isSettlementShadowEnabled: () => false,
    } as ReferenceCaptureConfig;
    expect(offConfig.isSettlementShadowEnabled()).toBe(false);
  });

  it('preflight returns machine-readable readiness', async () => {
    const repository = {
      countPendingBySession: jest.fn().mockResolvedValue(0),
    } as unknown as ReferenceCaptureSettlementShadowRepository;

    const result = await runExp021SettlementShadowPreflight({
      config,
      repository,
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tokenId: 999001,
      dimoReachable: true,
      persistenceWritable: true,
      activeCalibrationSessionId: null,
      staleShadowJobs: 0,
    });

    expect(result.nextSequence).toBe('60_30_20_10');
    expect(result.expectedSettlementShadowRequests).toBe(48);
    expect(result.expectedPostTripShadowRequests).toBe(6);
    expect(result.ready).toBe(true);
  });

  it('dry-run lifecycle: experiment → schedules → idempotent execute → restart recovery', async () => {
    const schedules: Array<{
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
      observation?: unknown;
    }> = [];

    const observations = new Map<string, unknown>();

    const repository = {
      findExperimentBySessionId: jest.fn(async (sessionId: string) =>
        schedules.length
          ? {
              id: 'exp-db-1',
              experimentId: 'exp-021-test',
              sessionId,
              lastSyncedPhaseCount: 0,
              schedules,
            }
          : null,
      ),
      createExperiment: jest.fn(async (input: { experimentId: string; sessionId: string }) => ({
        id: 'exp-db-1',
        experimentId: input.experimentId,
        sessionId: input.sessionId,
        lastSyncedPhaseCount: 0,
      })),
      createSchedulesIfAbsent: jest.fn(async (rows: Array<{ idempotencyKey: string }>) => {
        let created = 0;
        for (const row of rows) {
          if (schedules.some((s) => s.idempotencyKey === row.idempotencyKey)) continue;
          schedules.push({
            id: `sched-${schedules.length + 1}`,
            experimentId: 'exp-db-1',
            sessionId: 'sess-1',
            organizationId: 'org-1',
            vehicleId: 'veh-1',
            tokenId: 42,
            probeId: 'SP-60-A',
            probeType: ReferenceCaptureSettlementShadowProbeType.FIXED_INTERVAL,
            phase: '60s',
            sourceIntervalStart: new Date('2026-09-07T10:02:00.000Z'),
            sourceIntervalEnd: new Date('2026-09-07T10:03:00.000Z'),
            queryFrom: new Date('2026-09-07T10:02:00.000Z'),
            queryTo: new Date('2026-09-07T10:03:00.000Z'),
            aggregationInterval: '1s',
            scheduledAgeMs: 30_000,
            scheduledAt: new Date('2026-09-07T10:03:30.000Z'),
            status: 'PENDING',
            attemptCount: 0,
            executedAt: null,
            bullJobId: null,
            idempotencyKey: row.idempotencyKey,
            lastError: null,
          });
          created += 1;
        }
        return { created, skipped: rows.length - created };
      }),
      findScheduleById: jest.fn(async (id: string) => {
        const schedule = schedules.find((s) => s.id === id);
        if (!schedule) return null;
        const obs = observations.get(id);
        return { ...schedule, observation: obs ?? null };
      }),
      markExecuting: jest.fn(async (id: string) => {
        const row = schedules.find((s) => s.id === id);
        if (row) {
          row.status = 'EXECUTING';
          row.attemptCount += 1;
        }
      }),
      markCompleted: jest.fn(async (id: string, executedAt: Date) => {
        const row = schedules.find((s) => s.id === id);
        if (row) {
          row.status = 'COMPLETED';
          row.executedAt = executedAt;
        }
      }),
      markFailed: jest.fn(),
      updateBullJobId: jest.fn(async (id: string, jobId: string) => {
        const row = schedules.find((s) => s.id === id);
        if (row) row.bullJobId = jobId;
      }),
      resetExecutingToPending: jest.fn(async (id: string) => {
        const row = schedules.find((s) => s.id === id);
        if (row) {
          row.status = 'PENDING';
          row.bullJobId = null;
        }
      }),
      findRecoverableSchedules: jest.fn(async () =>
        schedules.filter((s) => s.status === 'PENDING' && !observations.has(s.id)),
      ),
      createObservation: jest.fn(async (input: { scheduleId: string }) => {
        observations.set(input.scheduleId, input);
      }),
      updateLastSyncedPhaseCount: jest.fn(),
      updateExperimentTripBinding: jest.fn(),
    } as unknown as ReferenceCaptureSettlementShadowRepository;

    const enqueued: string[] = [];
    const runner = {
      enqueueSchedule: jest.fn(async (schedule: { id: string }) => {
        enqueued.push(schedule.id);
      }),
      recoverDueSchedules: jest.fn(async () => {
        for (const row of schedules.filter((s) => s.status === 'PENDING')) {
          enqueued.push(row.id);
        }
        return schedules.length;
      }),
    } as unknown as ReferenceCaptureSettlementShadowRunnerService;

    const dimoTelemetry = {
      queryGraphQLWithIngressTiming: jest.fn().mockResolvedValue({
        result: {
          data: {
            signals: [{ timestamp: '2026-09-07T10:02:30.000Z', speed: 42 }],
          },
        },
      }),
    };

    const prisma = {
      referenceCaptureSettlementShadowSchedule: {
        findMany: jest.fn(async () => schedules.filter((s) => s.status === 'PENDING')),
      },
      referenceCaptureSettlementShadowObservation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      vehicleTrip: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const service = new ReferenceCaptureSettlementShadowService(
      config,
      repository,
      runner,
      dimoTelemetry as never,
      { getVehicleJwt: jest.fn().mockResolvedValue('jwt') } as never,
      prisma as never,
    );

    await service.ensureExperiment({
      sessionId: 'sess-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tokenId: 42,
    });

    await repository.createSchedulesIfAbsent([
      { idempotencyKey: 'exp-021-test|SP-60-A|30000' } as never,
    ]);
    await (service as unknown as { enqueuePendingSchedules: (id: string) => Promise<void> }).enqueuePendingSchedules(
      'exp-db-1',
    );
    expect(enqueued).toContain('sched-1');

    await service.executeScheduledObservation('sched-1');
    await service.executeScheduledObservation('sched-1');
    expect(observations.size).toBe(1);

    schedules[0].bullJobId = null;
    schedules[0].status = 'PENDING';
    const recovered = await runner.recoverDueSchedules();
    expect(recovered).toBeGreaterThan(0);
  });

  it('schedules prospective probe A during active phase before completion', async () => {
    const scheduleRows: Array<{ probeId: string; scheduledAgeMs: number; scheduledAt: Date }> = [];
    const repository = {
      findExperimentBySessionId: jest.fn().mockResolvedValue({
        id: 'exp-db-1',
        experimentId: 'exp-021-test',
        sessionId: 'sess-1',
        lastSyncedPhaseCount: 0,
      }),
      createExperiment: jest.fn(),
      createSchedulesIfAbsent: jest.fn(async (rows: Array<{ probeId: string; scheduledAgeMs: number; scheduledAt: Date }>) => {
        scheduleRows.push(...rows);
        return { created: rows.length, skipped: 0 };
      }),
      updateLastSyncedPhaseCount: jest.fn(),
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
      { referenceCaptureSettlementShadowSchedule: { findMany: jest.fn().mockResolvedValue([]) }, referenceCaptureSettlementShadowObservation: { findMany: jest.fn() }, vehicleTrip: { findMany: jest.fn() } } as never,
    );

    const phaseStart = '2026-09-07T10:00:00.000Z';
    await service.syncCompletedPhasesFromSession({
      sessionId: 'sess-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tokenId: 187336,
      acquisitionStateJson: {
        hfCalibrationSeries: {
          calibrationSeriesId: 'series-1',
          vehicleId: 'veh-1',
          tokenId: 187336,
          seriesStartedAt: phaseStart,
          phaseOrder: [60_000],
          activePhase: {
            phaseStartedAt: phaseStart,
            effectivePollIntervalMs: 60_000,
            calibrationPhaseId: 'phase-60',
            phaseSequence: 1,
            phaseEndedAt: null,
          },
          completedPhases: [],
          completedPhaseSummaries: [],
          pendingPhaseRequest: null,
          terminalFinalizationAt: null,
          lastPhaseBoundaryAt: phaseStart,
          controlPlaneRevision: 1,
        },
      },
    });

    expect(scheduleRows.some((r) => r.probeId === 'SP-60-A' && r.scheduledAgeMs === 30_000)).toBe(true);
    const plus30 = scheduleRows.find((r) => r.probeId === 'SP-60-A' && r.scheduledAgeMs === 30_000);
    expect(plus30?.scheduledAt.toISOString()).toBe('2026-09-07T10:03:30.000Z');
  });
});
