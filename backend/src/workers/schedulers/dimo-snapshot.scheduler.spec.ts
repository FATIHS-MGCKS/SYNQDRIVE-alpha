import { TripDetectionState } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';

import { QUEUE_NAMES } from '../queues/queue-names';
import { DimoSnapshotScheduler } from './dimo-snapshot.scheduler';
import { PrismaService } from '@shared/database/prisma.service';
import { TripReconciliationService } from '@modules/vehicle-intelligence/trips/reconciliation/trip-reconciliation.service';
import * as queueProducer from '@shared/queue/queue-producer.util';
import { TELEMETRY_STANDBY_THRESHOLD_MS } from '@modules/vehicles/vehicle-state-interpreter';

describe('DimoSnapshotScheduler (activity-tier)', () => {
  const NOW = Date.parse('2026-08-29T12:00:00.000Z');

  let scheduler: DimoSnapshotScheduler;
  let queueAdd: jest.Mock;
  let queueGetJob: jest.Mock;
  let findMany: jest.Mock;

  beforeEach(async () => {
    queueAdd = jest.fn().mockResolvedValue(undefined);
    queueGetJob = jest.fn().mockResolvedValue(null);
    findMany = jest.fn();

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
        ],
      }).compile()
    ).get(DimoSnapshotScheduler);

    findMany.mockResolvedValue([
      vehicleRow({ id: 'v1' }),
      vehicleRow({ id: 'v2', organizationId: 'org-2' }),
    ]);

    await freshScheduler.enqueueSnapshotJobs();

    expect(queueAdd).toHaveBeenCalledTimes(2);
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

    expect(queueAdd).toHaveBeenCalledTimes(1);
    expect(queueAdd.mock.calls[0][2].jobId).toBe('snapshot-active');
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

    expect(queueAdd).toHaveBeenCalledTimes(1);
    expect(queueAdd.mock.calls[0][2].jobId).toBe('snapshot-promoted');
  });

  it('promotes LONG_IDLE -> fresh external activity immediately', async () => {
    findMany.mockResolvedValue([
      vehicleRow({
        id: 'activity',
        tripDetectionState: {
          state: TripDetectionState.RESTING,
          lastActivityAt: new Date(NOW - 20_000),
        },
        latestState: {
          sourceTimestamp: new Date(NOW - 7 * 24 * 3600_000),
          lastSeenAt: new Date(NOW - 7 * 24 * 3600_000),
          providerFetchedAt: new Date(NOW - 45_000),
          speedKmh: 0,
          isIgnitionOn: false,
        },
      }),
    ]);

    await scheduler.enqueueSnapshotJobs();

    expect(queueAdd).toHaveBeenCalledTimes(1);
    expect(queueAdd.mock.calls[0][2].jobId).toBe('snapshot-activity');
  });

  it('prunes polling memory for vehicles no longer in cohort', async () => {
    findMany.mockResolvedValue([vehicleRow({ id: 'only-one' })]);

    await scheduler.enqueueSnapshotJobs();
    findMany.mockResolvedValue([]);
    await scheduler.enqueueSnapshotJobs();

    findMany.mockResolvedValue([vehicleRow({ id: 'only-one' })]);
    await scheduler.enqueueSnapshotJobs();

    expect(queueAdd).toHaveBeenCalled();
  });

  it('skips enqueue when Redis duplicate indicates in-flight job', async () => {
    findMany.mockResolvedValue([vehicleRow()]);
    queueAdd.mockRejectedValueOnce(new Error('Job already exists duplicate'));

    await scheduler.enqueueSnapshotJobs();

    expect(queueAdd).toHaveBeenCalledTimes(1);
  });

  it('interleaves organizations when multiple vehicles are due', async () => {
    findMany.mockResolvedValue([
      vehicleRow({ id: 'a1', organizationId: 'org-a' }),
      vehicleRow({ id: 'b1', organizationId: 'org-b' }),
      vehicleRow({ id: 'a2', organizationId: 'org-a' }),
    ]);

    await scheduler.enqueueSnapshotJobs();

    const jobIds = queueAdd.mock.calls.map((c) => c[2].jobId);
    expect(jobIds).toEqual(['snapshot-a1', 'snapshot-b1', 'snapshot-a2']);
  });

  it('does not enqueue when canEnqueueQueue is false', async () => {
    jest.spyOn(queueProducer, 'canEnqueueQueue').mockReturnValue(false);
    findMany.mockResolvedValue([vehicleRow()]);

    await scheduler.enqueueSnapshotJobs();

    expect(queueAdd).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });
});
