/**
 * DeviceConnectionQueryService regressions — episode-backed current state (FC-P1-01)
 * vs time-bounded display history.
 */
import { DimoConnectionStatus, DimoDeviceConnectionEventType } from '@prisma/client';
import { DeviceConnectionQueryService } from './device-connection-query.service';

const ORG_ID = 'org-query-regression';
const VEHICLE_ID = 'veh-query-regression';

function buildEpisodeServiceMock(
  openByVehicle: Record<
    string,
    { id: string; openedAt: Date; deviceBindingId: string | null } | null
  >,
) {
  return {
    findOpenEpisodeForVehicle: jest.fn().mockImplementation(async (_org: string, vehicleId: string) => {
      return openByVehicle[vehicleId] ?? null;
    }),
    findOpenEpisodesForVehicles: jest
      .fn()
      .mockImplementation(async (_org: string, vehicleIds: string[]) => {
        return vehicleIds.flatMap((vehicleId) => {
          const episode = openByVehicle[vehicleId];
          if (!episode) return [];
          return [{ ...episode, vehicleId, provider: 'DIMO', status: 'OPEN' }];
        });
      }),
  };
}

function buildPrismaMock(opts: {
  events: Array<{
    id: string;
    vehicleId: string;
    eventType: DimoDeviceConnectionEventType;
    observedAt: Date;
  }>;
  sevenDayCutoff: Date;
}) {
  const { events, sevenDayCutoff } = opts;

  return {
    dimoDeviceConnectionEvent: {
      findMany: jest.fn().mockImplementation(async (args: { where: { observedAt?: { gte: Date } } }) => {
        const since = args.where.observedAt?.gte;
        if (since && since.getTime() >= sevenDayCutoff.getTime()) {
          return events.filter((e) => e.observedAt.getTime() >= since.getTime());
        }
        return events;
      }),
    },
    booking: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    vehicleTrip: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    vehicle: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: VEHICLE_ID,
          dimoVehicle: { connectionStatus: DimoConnectionStatus.CONNECTED },
          latestState: {
            rawPayloadJson: { obdIsPluggedIn: { value: true } },
          },
        },
      ]),
      findFirst: jest.fn().mockResolvedValue({
        id: VEHICLE_ID,
        hardwareType: 'LTE_R1',
        dimoVehicleId: 'dimo-1',
        dimoVehicle: { connectionStatus: DimoConnectionStatus.CONNECTED },
        latestState: {
          rawPayloadJson: { obdIsPluggedIn: { value: true } },
        },
      }),
    },
  };
}

describe('DeviceConnectionQueryService regressions', () => {
  const auditNow = new Date('2026-07-18T12:00:00.000Z').getTime();
  const unplugAt = new Date('2026-07-08T17:21:19.000Z');
  const sevenDayCutoff = new Date(auditNow - 7 * 24 * 60 * 60 * 1000);

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(auditNow);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('G — episode-backed current state vs 7d display window (FC-P1-01)', () => {
    it('persisted open episode remains visible when unplug event is outside 7d window', async () => {
      const persistedUnplug = {
        id: 'ep-open-10d',
        vehicleId: VEHICLE_ID,
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
        observedAt: unplugAt,
      };

      const prisma = buildPrismaMock({
        events: [persistedUnplug],
        sevenDayCutoff,
      });
      const episodeService = buildEpisodeServiceMock({
        [VEHICLE_ID]: {
          id: 'ep-open-10d',
          openedAt: unplugAt,
          deviceBindingId: 'binding-1',
        },
      });
      const service = new DeviceConnectionQueryService(
        prisma as never,
        episodeService as never,
      );

      const fleetMap = await service.getFleetSummariesForVehicles(
        ORG_ID,
        [VEHICLE_ID],
        new Map([[VEHICLE_ID, 'LTE_R1']]),
        new Map([[VEHICLE_ID, true]]),
      );

      const summary = fleetMap.get(VEHICLE_ID)!;
      expect(summary.openUnpluggedEpisode).toBe(true);
      expect(summary.lastDeviceUnpluggedAt).toBe(unplugAt.toISOString());
      expect(summary.unpluggedCount7d).toBe(0);
      expect(prisma.dimoDeviceConnectionEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            observedAt: { gte: sevenDayCutoff },
          }),
        }),
      );
    });

    it('without persisted episode, events outside 7d window do not imply open state', async () => {
      const persistedUnplug = {
        id: 'ep-open-10d',
        vehicleId: VEHICLE_ID,
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
        observedAt: unplugAt,
      };

      const prisma = buildPrismaMock({
        events: [persistedUnplug],
        sevenDayCutoff,
      });
      const episodeService = buildEpisodeServiceMock({
        [VEHICLE_ID]: null,
      });
      const service = new DeviceConnectionQueryService(
        prisma as never,
        episodeService as never,
      );

      const fleetMap = await service.getFleetSummariesForVehicles(
        ORG_ID,
        [VEHICLE_ID],
        new Map([[VEHICLE_ID, 'LTE_R1']]),
        new Map([[VEHICLE_ID, true]]),
      );

      expect(fleetMap.get(VEHICLE_ID)?.openUnpluggedEpisode).toBe(false);
    });

    it('integration: persisted unplug within 7d window remains visible', async () => {
      const recentUnplug = {
        id: 'ep-open-2d',
        vehicleId: VEHICLE_ID,
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
        observedAt: new Date('2026-07-16T10:00:00.000Z'),
      };

      const prisma = buildPrismaMock({
        events: [recentUnplug],
        sevenDayCutoff,
      });
      const episodeService = buildEpisodeServiceMock({
        [VEHICLE_ID]: {
          id: 'ep-open-2d',
          openedAt: recentUnplug.observedAt,
          deviceBindingId: 'binding-1',
        },
      });
      const service = new DeviceConnectionQueryService(
        prisma as never,
        episodeService as never,
      );

      const fleetMap = await service.getFleetSummariesForVehicles(
        ORG_ID,
        [VEHICLE_ID],
        new Map([[VEHICLE_ID, 'LTE_R1']]),
        new Map([[VEHICLE_ID, true]]),
      );

      expect(fleetMap.get(VEHICLE_ID)?.openUnpluggedEpisode).toBe(true);
      expect(fleetMap.get(VEHICLE_ID)?.unpluggedCount7d).toBe(1);
    });

    it('vehicle detail summary uses episode for current state and 7d filter for history', async () => {
      const prisma = buildPrismaMock({
        events: [],
        sevenDayCutoff,
      });
      const episodeService = buildEpisodeServiceMock({
        [VEHICLE_ID]: {
          id: 'ep-open-detail',
          openedAt: unplugAt,
          deviceBindingId: 'binding-1',
        },
      });
      const service = new DeviceConnectionQueryService(
        prisma as never,
        episodeService as never,
      );

      const summary = await service.getVehicleSummary(ORG_ID, VEHICLE_ID);
      expect(summary.openUnpluggedEpisode).toBe(true);
      expect(summary.lastDeviceUnpluggedAt).toBe(unplugAt.toISOString());
      expect(prisma.dimoDeviceConnectionEvent.findMany).toHaveBeenCalled();
      expect(episodeService.findOpenEpisodeForVehicle).toHaveBeenCalledWith(
        ORG_ID,
        VEHICLE_ID,
      );
    });
  });
});
