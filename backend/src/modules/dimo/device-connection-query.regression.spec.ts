/**
 * DeviceConnectionQueryService regressions — seven-day window (FC-P1-01)
 * and persisted-event integration path.
 */
import { DimoConnectionStatus, DimoDeviceConnectionEventType } from '@prisma/client';
import { DeviceConnectionQueryService } from './device-connection-query.service';

const ORG_ID = 'org-query-regression';
const VEHICLE_ID = 'veh-query-regression';

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

  describe('G — seven-day event window (FC-P1-01)', () => {
    it('CURRENT: open episode older than 7 days disappears from fleet API summary', async () => {
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
      const service = new DeviceConnectionQueryService(prisma as never);

      const fleetMap = await service.getFleetSummariesForVehicles(
        ORG_ID,
        [VEHICLE_ID],
        new Map([[VEHICLE_ID, 'LTE_R1']]),
        new Map([[VEHICLE_ID, true]]),
      );

      const summary = fleetMap.get(VEHICLE_ID)!;
      // TARGET (Prompt 3/4): episode remains visible until resolved, not window-expired
      expect(summary.openUnpluggedEpisode).toBe(false);
      expect(summary.lastDeviceUnpluggedAt).toBeNull();
      expect(prisma.dimoDeviceConnectionEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            observedAt: { gte: sevenDayCutoff },
          }),
        }),
      );
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
      const service = new DeviceConnectionQueryService(prisma as never);

      const fleetMap = await service.getFleetSummariesForVehicles(
        ORG_ID,
        [VEHICLE_ID],
        new Map([[VEHICLE_ID, 'LTE_R1']]),
        new Map([[VEHICLE_ID, true]]),
      );

      expect(fleetMap.get(VEHICLE_ID)?.openUnpluggedEpisode).toBe(true);
    });

    it('vehicle detail summary uses same 7d filter (contract)', async () => {
      const prisma = buildPrismaMock({
        events: [],
        sevenDayCutoff,
      });
      const service = new DeviceConnectionQueryService(prisma as never);

      const summary = await service.getVehicleSummary(ORG_ID, VEHICLE_ID);
      expect(summary.openUnpluggedEpisode).toBe(false);
      expect(prisma.dimoDeviceConnectionEvent.findMany).toHaveBeenCalled();
    });
  });
});
