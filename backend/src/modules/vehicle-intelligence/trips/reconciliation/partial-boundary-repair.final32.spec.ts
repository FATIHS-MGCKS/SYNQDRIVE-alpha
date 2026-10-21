import { BoundaryRefreshLifecycleService } from '../boundary-refresh-lifecycle.service';
import {
  buildBoundaryRefreshRecord,
  buildBoundaryRepairGeneration,
  isBoundaryRefreshRetryable,
  isEnqueuedStale,
  readBoundaryRefreshRecord,
  BOUNDARY_REFRESH_ENQUEUED_STALE_MS,
} from '../boundary-repair.state.util';
import { BOUNDARY_REFRESH_STATE } from './reconciliation.types';

const GENERATION = buildBoundaryRepairGeneration({
  auditId: 'audit-final32',
  providerSegmentId: 'seg-full',
  newStartTime: new Date('2026-08-29T12:01:00.000Z'),
  newEndTime: new Date('2026-08-29T12:50:00.000Z'),
});

function makeTripStore() {
  const store = new Map<string, Record<string, unknown>>();
  const prisma = {
    vehicleTrip: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => store.get(where.id) ?? null),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const rows = [...store.values()];
        if (where.rawDetectionMeta) {
          const path = (where.rawDetectionMeta as { path: string[]; equals: string }).path;
          const equals = (where.rawDetectionMeta as { path: string[]; equals: string }).equals;
          if (path[0] === 'boundaryRefresh' && path[1] === 'state') {
            return rows.filter(
              (r) => readBoundaryRefreshRecord(r.rawDetectionMeta)?.state === equals,
            );
          }
        }
        return rows;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const merged = { ...(store.get(where.id) ?? {}), ...data };
        store.set(where.id, merged);
        return merged;
      }),
    },
    tripRepair: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => null),
      update: jest.fn(async () => undefined),
    },
  };
  return { prisma, store };
}

describe('FINAL-3.2 boundary refresh completion lifecycle', () => {
  it('does not mark COMPLETED immediately after enqueue', async () => {
    const { prisma, store } = makeTripStore();
    store.set('trip-1', {
      id: 'trip-1',
      rawDetectionMeta: {
        boundaryRepair: {
          auditId: 'audit-final32',
          providerSegmentId: 'seg-full',
          newStartTime: '2026-08-29T12:01:00.000Z',
          newEndTime: '2026-08-29T12:50:00.000Z',
        },
        boundaryRefresh: buildBoundaryRefreshRecord('ENQUEUED', null, undefined, {
          generation: GENERATION,
        }),
      },
    });

    const lifecycle = new BoundaryRefreshLifecycleService(prisma as never);
    expect(await lifecycle.tryMarkCompleted('trip-1')).toBe(false);
    expect(readBoundaryRefreshRecord(store.get('trip-1')?.rawDetectionMeta)?.state).toBe(
      BOUNDARY_REFRESH_STATE.ENQUEUED,
    );
  });

  it('marks COMPLETED after route + behavior + drivingImpact stages', async () => {
    const { prisma, store } = makeTripStore();
    store.set('trip-1', {
      id: 'trip-1',
      analysisStagesJson: {
        behavior: 'pending',
        route: 'pending',
        misuse: 'pending',
        drivingImpact: 'pending',
      },
      rawDetectionMeta: {
        boundaryRepair: {
          auditId: 'audit-final32',
          providerSegmentId: 'seg-full',
          newStartTime: '2026-08-29T12:01:00.000Z',
          newEndTime: '2026-08-29T12:50:00.000Z',
        },
        boundaryRefresh: buildBoundaryRefreshRecord('ENQUEUED', null, undefined, {
          generation: GENERATION,
        }),
      },
    });

    const lifecycle = new BoundaryRefreshLifecycleService(prisma as never);
    await lifecycle.markBoundaryStageProgress('trip-1', 'route', 'done');
    await lifecycle.markBoundaryStageProgress('trip-1', 'behavior', 'done');
    await lifecycle.markBoundaryStageProgress('trip-1', 'drivingImpact', 'done');

    expect(readBoundaryRefreshRecord(store.get('trip-1')?.rawDetectionMeta)?.state).toBe(
      BOUNDARY_REFRESH_STATE.COMPLETED,
    );
  });

  it('stale generation completion does not complete newer repair', async () => {
    const { prisma, store } = makeTripStore();
    const oldGeneration = buildBoundaryRepairGeneration({
      auditId: 'audit-old',
      providerSegmentId: 'seg-full',
      newStartTime: new Date('2026-08-29T12:10:00.000Z'),
      newEndTime: new Date('2026-08-29T12:50:00.000Z'),
    });
    store.set('trip-1', {
      id: 'trip-1',
      rawDetectionMeta: {
        boundaryRepair: {
          auditId: 'audit-new',
          providerSegmentId: 'seg-full',
          newStartTime: '2026-08-29T12:01:00.000Z',
          newEndTime: '2026-08-29T12:50:00.000Z',
        },
        boundaryRefresh: buildBoundaryRefreshRecord('ENQUEUED', null, undefined, {
          generation: oldGeneration,
        }),
      },
    });

    const lifecycle = new BoundaryRefreshLifecycleService(prisma as never);
    await lifecycle.markBoundaryStageProgress('trip-1', 'route', 'done');
    await lifecycle.markBoundaryStageProgress('trip-1', 'behavior', 'done');
    await lifecycle.markBoundaryStageProgress('trip-1', 'drivingImpact', 'done');

    expect(readBoundaryRefreshRecord(store.get('trip-1')?.rawDetectionMeta)?.state).toBe(
      BOUNDARY_REFRESH_STATE.ENQUEUED,
    );
  });

  it('10x post-completion reconciliation recovery finds zero recoverable trips', async () => {
    const { prisma, store } = makeTripStore();
    store.set('trip-1', {
      id: 'trip-1',
      vehicleId: 'veh-1',
      tripStatus: 'COMPLETED',
      rawDetectionMeta: {
        boundaryRepair: {
          auditId: 'audit-final32',
          providerSegmentId: 'seg-full',
          newStartTime: '2026-08-29T12:01:00.000Z',
          newEndTime: '2026-08-29T12:50:00.000Z',
        },
        boundaryRefresh: buildBoundaryRefreshRecord('COMPLETED', null, undefined, {
          generation: GENERATION,
        }),
      },
    });

    const lifecycle = new BoundaryRefreshLifecycleService(prisma as never);
    for (let i = 0; i < 10; i++) {
      const recoverable = await lifecycle.findRecoverableTrips('veh-1');
      expect(recoverable).toHaveLength(0);
    }
  });

  it('crash-mid-refresh: stale ENQUEUED re-enqueues then COMPLETED stops retries', async () => {
    const { prisma, store } = makeTripStore();
    const enqueuedAt = new Date('2026-08-29T10:00:00.000Z');
    const staleRecord = buildBoundaryRefreshRecord('ENQUEUED', null, undefined, {
      generation: GENERATION,
      now: enqueuedAt,
    });
    staleRecord.leaseUntil = new Date(
      enqueuedAt.getTime() - 60_000,
    ).toISOString();

    store.set('trip-1', {
      id: 'trip-1',
      vehicleId: 'veh-1',
      tripStatus: 'COMPLETED',
      rawDetectionMeta: {
        boundaryRepair: {
          auditId: 'audit-final32',
          providerSegmentId: 'seg-full',
          newStartTime: '2026-08-29T12:01:00.000Z',
          newEndTime: '2026-08-29T12:50:00.000Z',
        },
        boundaryRefresh: staleRecord,
      },
    });

    const lifecycle = new BoundaryRefreshLifecycleService(prisma as never);
    const nowMs = enqueuedAt.getTime() + BOUNDARY_REFRESH_ENQUEUED_STALE_MS + 1_000;
    jest.spyOn(Date, 'now').mockReturnValue(nowMs);

    const refresh = readBoundaryRefreshRecord(store.get('trip-1')?.rawDetectionMeta);
    expect(isEnqueuedStale(refresh!)).toBe(true);
    expect(isBoundaryRefreshRetryable(refresh)).toBe(true);

    const recoverable = await lifecycle.findRecoverableTrips('veh-1');
    expect(recoverable).toHaveLength(1);

    await lifecycle.markBoundaryStageProgress('trip-1', 'route', 'done');
    await lifecycle.markBoundaryStageProgress('trip-1', 'behavior', 'done');
    await lifecycle.markBoundaryStageProgress('trip-1', 'drivingImpact', 'done');

    expect(readBoundaryRefreshRecord(store.get('trip-1')?.rawDetectionMeta)?.state).toBe(
      BOUNDARY_REFRESH_STATE.COMPLETED,
    );

    for (let i = 0; i < 10; i++) {
      expect(await lifecycle.findRecoverableTrips('veh-1')).toHaveLength(0);
    }

    jest.spyOn(Date, 'now').mockRestore();
  });
});
