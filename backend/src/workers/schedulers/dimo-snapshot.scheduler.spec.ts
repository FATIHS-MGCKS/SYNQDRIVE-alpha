import { TripDetectionState } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';

import { QUEUE_NAMES } from '../queues/queue-names';
import { DimoSnapshotScheduler } from './dimo-snapshot.scheduler';
import { PrismaService } from '@shared/database/prisma.service';
import { TripReconciliationService } from '@modules/vehicle-intelligence/trips/reconciliation/trip-reconciliation.service';
import * as queueProducer from '@shared/queue/queue-producer.util';
import { TELEMETRY_STANDBY_THRESHOLD_MS } from '@modules/vehicles/vehicle-state-interpreter';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { SnapshotWakeCoordinatorService } from '../snapshot-wake/snapshot-wake-coordinator.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';

describe('DimoSnapshotScheduler (activity-tier)', () => {
  const NOW = Date.parse('2026-08-29T12:00:00.000Z');

  let scheduler: DimoSnapshotScheduler;
  let queueAdd: jest.Mock;
  let queueGetJob: jest.Mock;
  let findMany: jest.Mock;
  let requestSnapshot: jest.Mock;
  let setSnapshotPollingTierOccupancy: jest.Mock;

  beforeEach(async () => {
    queueAdd = jest.fn().mockResolvedValue(undefined);
    queueGetJob = jest.fn().mockResolvedValue(null);
    findMany = jest.fn();
    requestSnapshot = jest.fn().mockResolvedValue('ENQUEUED');
    setSnapshotPollingTierOccupancy = jest.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [
        DimoSnapshotScheduler,
        {
          provide: getQueueToken(QUEUE_NAMES.DIMO_SNAPSHOT),
          useValue: {
            add: queueAdd,
            getJob: queueGetJob,
            clean: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: { vehicle: { findMany } },
        },
        {
          provide: TripReconciliationService,
          useValue: { triggerManualReconciliation: jest.fn() },
        },
        {
          provide: SchedulerLeaderGuardService,
          useValue: { shouldRun: jest.fn().mockReturnValue(true) },
        },
        {
          provide: SnapshotWakeCoordinatorService,
          useValue: { requestSnapshot },
        },
        {
          provide: TripMetricsService,
          useValue: { setSnapshotPollingTierOccupancy },
        },
      ],
    }).compile();

    scheduler = moduleRef.get(DimoSnapshotScheduler);
    jest.spyOn(queueProducer, 'canEnqueueQueue').mockReturnValue(true);
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete process.env.WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE;
    delete process.env.WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED;
  });

  function vehicleRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'veh-1',
      organizationId: 'org-1',
      dimoVehicle: { tokenId: 99, connectionStatus: 'CONNECTED' },
      latestState: {
        sourceTimestamp: new Date(NOW - 5 * 60_000),
        lastSeenAt: new Date(NOW - 5 * 60_000),
        providerFetchedAt: null,
        speedKmh: 0,
        isIgnitionOn: false,
      },
      tripDetectionState: {
        state: TripDetectionState.RESTING,
        lastActivityAt: null,
      },
      ...overrides,
    };
  }

  it('queries CONNECTED cohort only — DISCONNECTED vehicles never reach enqueue', async () => {
    findMany.mockResolvedValue([vehicleRow()]);

    await scheduler.enqueueSnapshotJobs();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dimoVehicle: expect.objectContaining({
            connectionStatus: 'CONNECTED',
            tokenId: { not: null },
          }),
        }),
      }),
    );
  });

  it('legacy fixed cadence enqueues all matched vehicles every tick', async () => {
    process.env.WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE = 'true';
    const legacyRequestSnapshot = jest.fn().mockResolvedValue('ENQUEUED');
    const freshScheduler = (
      await Test.createTestingModule({
        providers: [
          DimoSnapshotScheduler,
          {
            provide: getQueueToken(QUEUE_NAMES.DIMO_SNAPSHOT),
            useValue: { add: queueAdd, getJob: queueGetJob, clean: jest.fn() },
          },
          { provide: PrismaService, useValue: { vehicle: { findMany } } },
          {
            provide: TripReconciliationService,
            useValue: { triggerManualReconciliation: jest.fn() },
          },
          {
            provide: SchedulerLeaderGuardService,
            useValue: { shouldRun: jest.fn().mockReturnValue(true) },
          },
          {
            provide: SnapshotWakeCoordinatorService,
            useValue: { requestSnapshot: legacyRequestSnapshot },
          },
        ],
      }).compile()
    ).get(DimoSnapshotScheduler);

    findMany.mockResolvedValue([
      vehicleRow({ id: 'v1' }),
      vehicleRow({ id: 'v2', organizationId: 'org-2' }),
    ]);

    await freshScheduler.enqueueSnapshotJobs();

    expect(legacyRequestSnapshot).toHaveBeenCalledTimes(2);
  });

  it('activity tiers skip vehicles not yet due', async () => {
    findMany.mockResolvedValue([
      vehicleRow({
        id: 'active',
        tripDetectionState: { state: TripDetectionState.ACTIVE_TRIP, lastActivityAt: new Date(NOW) },
        latestState: {
          sourceTimestamp: new Date(NOW - 1000),
          lastSeenAt: new Date(NOW - 1000),
          providerFetchedAt: new Date(NOW - 35_000),
          speedKmh: 40,
          isIgnitionOn: true,
        },
      }),
      vehicleRow({
        id: 'idle',
        latestState: {
          sourceTimestamp: new Date(NOW - TELEMETRY_STANDBY_THRESHOLD_MS + 60_000),
          lastSeenAt: new Date(NOW - TELEMETRY_STANDBY_THRESHOLD_MS + 60_000),
          providerFetchedAt: new Date(NOW - 60_000),
          speedKmh: 0,
          isIgnitionOn: false,
        },
      }),
    ]);

    await scheduler.enqueueSnapshotJobs();

    expect(requestSnapshot).toHaveBeenCalledTimes(1);
    expect(requestSnapshot.mock.calls[0][0]).toEqual(
      expect.objectContaining({ vehicleId: 'active', origin: 'SCHEDULED' }),
    );
  });

  it('promotes LONG_IDLE -> ACTIVE_TRIP immediately despite recent providerFetchedAt', async () => {
    findMany.mockResolvedValue([
      vehicleRow({
        id: 'promoted',
        tripDetectionState: {
          state: TripDetectionState.ACTIVE_TRIP,
          lastActivityAt: new Date(NOW),
        },
        latestState: {
          sourceTimestamp: new Date(NOW - 7 * 24 * 3600_000),
          lastSeenAt: new Date(NOW - 7 * 24 * 3600_000),
          providerFetchedAt: new Date(NOW - 45_000),
          speedKmh: 30,
          isIgnitionOn: true,
        },
      }),
    ]);

    await scheduler.enqueueSnapshotJobs();

    expect(requestSnapshot).toHaveBeenCalledTimes(1);
    expect(requestSnapshot.mock.calls[0][0].vehicleId).toBe('promoted');
  });

  it('promotes LONG_IDLE -> fresh external activity on tier transition (not every tick)', async () => {
    findMany.mockResolvedValue([
      vehicleRow({
        id: 'activity',
        latestState: {
          sourceTimestamp: new Date(NOW - 7 * 24 * 3600_000),
          lastSeenAt: new Date(NOW - 7 * 24 * 3600_000),
          providerFetchedAt: new Date(NOW),
          speedKmh: 0,
          isIgnitionOn: false,
        },
      }),
    ]);
    await scheduler.enqueueSnapshotJobs();
    requestSnapshot.mockClear();

    const promotedAt = NOW + 30_000;
    jest.setSystemTime(promotedAt);
    findMany.mockResolvedValue([
      vehicleRow({
        id: 'activity',
        tripDetectionState: {
          state: TripDetectionState.RESTING,
          lastActivityAt: new Date(promotedAt - 20_000),
        },
        latestState: {
          sourceTimestamp: new Date(promotedAt - 7 * 24 * 3600_000),
          lastSeenAt: new Date(promotedAt - 7 * 24 * 3600_000),
          providerFetchedAt: new Date(NOW),
          speedKmh: 0,
          isIgnitionOn: false,
        },
      }),
    ]);

    await scheduler.enqueueSnapshotJobs();

    expect(requestSnapshot).toHaveBeenCalledTimes(1);
    expect(requestSnapshot.mock.calls[0][0].vehicleId).toBe('activity');
  });

  it('prunes polling memory for vehicles no longer in cohort', async () => {
    findMany.mockResolvedValue([vehicleRow({ id: 'only-one' })]);

    await scheduler.enqueueSnapshotJobs();
    findMany.mockResolvedValue([]);
    await scheduler.enqueueSnapshotJobs();

    findMany.mockResolvedValue([vehicleRow({ id: 'only-one' })]);
    await scheduler.enqueueSnapshotJobs();

    expect(requestSnapshot).toHaveBeenCalled();
  });

  it('counts coalesced scheduler enqueue as skipped inflight', async () => {
    findMany.mockResolvedValue([vehicleRow()]);
    requestSnapshot.mockResolvedValueOnce('COALESCED');

    await scheduler.enqueueSnapshotJobs();

    expect(requestSnapshot).toHaveBeenCalledTimes(1);
  });

  it('interleaves organizations when multiple vehicles are due', async () => {
    findMany.mockResolvedValue([
      vehicleRow({ id: 'a1', organizationId: 'org-a' }),
      vehicleRow({ id: 'b1', organizationId: 'org-b' }),
      vehicleRow({ id: 'a2', organizationId: 'org-a' }),
    ]);

    await scheduler.enqueueSnapshotJobs();

    const vehicleIds = requestSnapshot.mock.calls.map((c) => c[0].vehicleId);
    expect(vehicleIds).toEqual(['a1', 'b1', 'a2']);
  });

  it('counts hysteresis-held LONG_IDLE vehicles under effective RECENTLY_ACTIVE tier', async () => {
    findMany.mockResolvedValue([
      vehicleRow({
        id: 'held',
        latestState: {
          sourceTimestamp: new Date(NOW - 7 * 24 * 3600_000),
          lastSeenAt: new Date(NOW - 7 * 24 * 3600_000),
          providerFetchedAt: new Date(NOW - 60_000),
          speedKmh: 0,
          isIgnitionOn: false,
        },
        tripDetectionState: {
          state: TripDetectionState.RESTING,
          lastActivityAt: new Date(NOW - 30_000),
        },
      }),
    ]);

    await scheduler.enqueueSnapshotJobs();
    await scheduler.enqueueSnapshotJobs();

    const lastCall = setSnapshotPollingTierOccupancy.mock.calls.at(-1)?.[0] as Map<string, number>;
    expect(lastCall.get('RECENTLY_ACTIVE')).toBe(1);
    expect(lastCall.get('LONG_IDLE') ?? 0).toBe(0);
  });

  it('resets tier occupancy and fast ratio when cohort is empty', async () => {
    findMany.mockResolvedValue([]);
    await scheduler.enqueueSnapshotJobs();
    expect(setSnapshotPollingTierOccupancy).toHaveBeenCalledWith(new Map());
  });

  it('does not enqueue when canEnqueueQueue is false', async () => {
    jest.spyOn(queueProducer, 'canEnqueueQueue').mockReturnValue(false);
    findMany.mockResolvedValue([vehicleRow()]);

    await scheduler.enqueueSnapshotJobs();

    expect(requestSnapshot).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });
});
