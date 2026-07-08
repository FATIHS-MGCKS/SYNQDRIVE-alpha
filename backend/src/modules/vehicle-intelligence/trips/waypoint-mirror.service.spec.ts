import { WaypointMirrorService } from './waypoint-mirror.service';
import type { ClickHouseWaypointsService } from '@modules/clickhouse/clickhouse-waypoints.service';
import type { PrismaService } from '@shared/database/prisma.service';

describe('WaypointMirrorService', () => {
  const baseParams = {
    orgId: 'org-1',
    vehicleId: 'veh-1',
    tokenId: 42,
    tripId: 'trip-1',
  };

  function makeDeps(over: {
    waypoints?: Array<{
      latitude: number;
      longitude: number;
      speedKmh: number | null;
      recordedAt: Date;
    }>;
    alreadyMirrored?: boolean;
    insertError?: boolean;
  } = {}) {
    const prisma = {
      vehicleTripWaypoint: {
        findMany: jest.fn().mockResolvedValue(over.waypoints ?? []),
      },
    } as unknown as PrismaService;

    const clickHouseWaypoints = {
      hasTripWaypoints: jest
        .fn()
        .mockResolvedValue(over.alreadyMirrored ?? false),
      insertWaypoints: over.insertError
        ? jest.fn().mockRejectedValue(new Error('clickhouse down'))
        : jest.fn().mockResolvedValue(undefined),
    } as unknown as ClickHouseWaypointsService;

    return { prisma, clickHouseWaypoints };
  }

  const ORIGINAL_FLAG = process.env.WAYPOINT_MIRROR_ENABLED;
  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.WAYPOINT_MIRROR_ENABLED;
    else process.env.WAYPOINT_MIRROR_ENABLED = ORIGINAL_FLAG;
  });

  it('is a no-op when disabled', async () => {
    delete process.env.WAYPOINT_MIRROR_ENABLED;
    const { prisma, clickHouseWaypoints } = makeDeps();
    const svc = new WaypointMirrorService(prisma, clickHouseWaypoints);
    const res = await svc.mirrorTripWaypoints(baseParams);
    expect(res.reason).toBe('disabled');
    expect(clickHouseWaypoints.insertWaypoints).not.toHaveBeenCalled();
  });

  it('mirrors PG waypoints when enabled', async () => {
    process.env.WAYPOINT_MIRROR_ENABLED = 'true';
    const { prisma, clickHouseWaypoints } = makeDeps({
      waypoints: [
        {
          latitude: 52.1,
          longitude: 13.4,
          speedKmh: 30,
          recordedAt: new Date('2026-06-25T10:00:00.000Z'),
        },
      ],
    });
    const svc = new WaypointMirrorService(prisma, clickHouseWaypoints);
    const res = await svc.mirrorTripWaypoints(baseParams);
    expect(res.mirrored).toBe(true);
    expect(res.pointsInserted).toBe(1);
    expect(clickHouseWaypoints.insertWaypoints).toHaveBeenCalledTimes(1);
  });

  it('does not error when trip has no GPS waypoints', async () => {
    process.env.WAYPOINT_MIRROR_ENABLED = 'true';
    const { prisma, clickHouseWaypoints } = makeDeps({ waypoints: [] });
    const svc = new WaypointMirrorService(prisma, clickHouseWaypoints);
    const res = await svc.mirrorTripWaypoints(baseParams);
    expect(res.reason).toBe('no_waypoints');
    expect(clickHouseWaypoints.insertWaypoints).not.toHaveBeenCalled();
  });

  it('skips duplicate mirror for the same trip', async () => {
    process.env.WAYPOINT_MIRROR_ENABLED = 'true';
    const { prisma, clickHouseWaypoints } = makeDeps({
      waypoints: [
        {
          latitude: 52.1,
          longitude: 13.4,
          speedKmh: 30,
          recordedAt: new Date('2026-06-25T10:00:00.000Z'),
        },
      ],
      alreadyMirrored: true,
    });
    const svc = new WaypointMirrorService(prisma, clickHouseWaypoints);
    const res = await svc.mirrorTripWaypoints(baseParams);
    expect(res.reason).toBe('already_mirrored');
    expect(clickHouseWaypoints.insertWaypoints).not.toHaveBeenCalled();
  });

  it('never throws when ClickHouse insert fails', async () => {
    process.env.WAYPOINT_MIRROR_ENABLED = 'true';
    const { prisma, clickHouseWaypoints } = makeDeps({
      waypoints: [
        {
          latitude: 52.1,
          longitude: 13.4,
          speedKmh: 30,
          recordedAt: new Date('2026-06-25T10:00:00.000Z'),
        },
      ],
      insertError: true,
    });
    const svc = new WaypointMirrorService(prisma, clickHouseWaypoints);
    const res = await svc.mirrorTripWaypoints(baseParams);
    expect(res.reason).toBe('error');
  });
});
