import { ActivityWindowProducerService } from './activity-window-producer.service';
import type { ClickHouseAnalyticsService } from '@modules/clickhouse/clickhouse-analytics.service';
import type { ClickHouseActivityWindowsService } from '@modules/clickhouse/clickhouse-activity-windows.service';

describe('ActivityWindowProducerService', () => {
  const baseParams = {
    orgId: 'org-1',
    vehicleId: 'veh-1',
    tripId: 'trip-1',
    windowStart: new Date('2026-06-25T09:00:00.000Z'),
    windowEnd: new Date('2026-06-25T10:00:00.000Z'),
  };

  function makeDeps() {
    const chAnalytics = {
      findIgnitionSegments: jest.fn().mockResolvedValue([
        {
          segmentStart: new Date('2026-06-25T09:05:00.000Z'),
          segmentEnd: new Date('2026-06-25T09:55:00.000Z'),
          durationMs: 3_000_000,
          confidence: 'HIGH' as const,
        },
      ]),
      findMotionSegments: jest.fn().mockResolvedValue([
        {
          segmentStart: new Date('2026-06-25T09:10:00.000Z'),
          segmentEnd: new Date('2026-06-25T09:50:00.000Z'),
          durationMs: 2_400_000,
          confidence: 'MEDIUM' as const,
        },
      ]),
      summarizeActivityWindow: jest.fn().mockResolvedValue({
        pointCount: 10,
        maxSpeedKmh: 55,
        odometerDeltaKm: 8.2,
      }),
      fetchSnapshotsInWindow: jest.fn().mockResolvedValue([]),
    } as unknown as ClickHouseAnalyticsService;

    const clickHouseActivityWindows = {
      insertActivityWindows: jest.fn().mockResolvedValue(undefined),
    } as unknown as ClickHouseActivityWindowsService;

    return { chAnalytics, clickHouseActivityWindows };
  }

  const ORIGINAL_FLAG = process.env.ACTIVITY_WINDOW_MIRROR_ENABLED;
  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) {
      delete process.env.ACTIVITY_WINDOW_MIRROR_ENABLED;
    } else {
      process.env.ACTIVITY_WINDOW_MIRROR_ENABLED = ORIGINAL_FLAG;
    }
  });

  it('is disabled by default', async () => {
    delete process.env.ACTIVITY_WINDOW_MIRROR_ENABLED;
    const { chAnalytics, clickHouseActivityWindows } = makeDeps();
    const svc = new ActivityWindowProducerService(
      clickHouseActivityWindows,
      chAnalytics,
    );
    const res = await svc.produceForTrip(baseParams);
    expect(res.reason).toBe('disabled');
    expect(clickHouseActivityWindows.insertActivityWindows).not.toHaveBeenCalled();
  });

  it('produces ignition, motion, and summary windows when enabled', async () => {
    process.env.ACTIVITY_WINDOW_MIRROR_ENABLED = 'true';
    const { chAnalytics, clickHouseActivityWindows } = makeDeps();
    const svc = new ActivityWindowProducerService(
      clickHouseActivityWindows,
      chAnalytics,
    );
    const res = await svc.produceForTrip(baseParams);
    expect(res.produced).toBe(true);
    expect(res.windowsInserted).toBeGreaterThanOrEqual(3);
    const windows = (clickHouseActivityWindows.insertActivityWindows as jest.Mock)
      .mock.calls[0][0];
    const types = windows.map((w: { activityType: string }) => w.activityType);
    expect(types).toEqual(
      expect.arrayContaining(['ignition_on', 'moving', 'trip_summary']),
    );
  });
});
