import { VehicleStatus } from '@prisma/client';
import {
  FLEET_STATUS_FIELDS,
  makeBookingRow,
  makeOperationalPrismaMocks,
  makeOperationalVehiclesService,
  makeVehicleRow,
} from './vehicle-operational-state-v2.test-helpers';

describe('Vehicle Operational State V2 — API consistency (fleet-map / list / detail)', () => {
  const orgId = 'org-tenant-a';
  const NOW = new Date('2026-07-10T10:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function makeFleetService(bookingRows: ReturnType<typeof makeBookingRow>[]) {
    const vehicle = makeVehicleRow({ status: VehicleStatus.AVAILABLE });
    return {
      service: makeOperationalVehiclesService({
        prisma: makeOperationalPrismaMocks({
          vehicle: {
            findMany: jest.fn().mockResolvedValue([vehicle]),
            findFirst: jest.fn().mockResolvedValue(vehicle),
            count: jest.fn().mockResolvedValue(1),
          },
          booking: { findMany: jest.fn().mockResolvedValue(bookingRows) },
          station: {
            findMany: jest.fn().mockResolvedValue([{ id: 'st-1', name: 'Kassel' }]),
          },
        }),
        redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn() },
      }),
      vehicle,
    };
  }

  it('returns identical fleet-status fields from fleet-map and vehicle detail', async () => {
    const bookingRows = [
      makeBookingRow({
        id: 'bk-active',
        status: 'ACTIVE',
        startDate: new Date('2026-07-10T08:00:00.000Z'),
        endDate: new Date('2026-07-12T08:00:00.000Z'),
      }),
    ];
    const { service } = makeFleetService(bookingRows);

    const fleetMap = await service.getFleetMapData(orgId);
    const detail = await service.findOne(orgId, 'veh-1');

    expect(detail).not.toBeNull();
    for (const field of FLEET_STATUS_FIELDS) {
      expect((fleetMap[0] as unknown as Record<string, unknown>)[field]).toEqual(
        (detail as unknown as Record<string, unknown>)[field],
      );
    }
    expect(fleetMap[0].status).toBe('Active Rented');
    expect(detail?.status).toBe('Active Rented');
  });

  it('returns identical status from paginated list mapping and fleet-map', async () => {
    const bookingRows = [
      makeBookingRow({
        id: 'bk-reserved',
        status: 'CONFIRMED',
        startDate: new Date('2026-07-10T08:00:00.000Z'),
        endDate: new Date('2026-07-12T08:00:00.000Z'),
      }),
    ];
    const { service } = makeFleetService(bookingRows);

    const fleetMap = await service.getFleetMapData(orgId);
    const list = await service.findByOrganization(orgId, { page: 1, limit: 10 });

    expect(list.data[0].status).toBe(fleetMap[0].status);
    expect(list.data[0].reservedBookingId).toBe(fleetMap[0].reservedBookingId);
  });

  it('scopes fleet-map and detail queries to the same organization', async () => {
    const { service } = makeFleetService([]);
    await service.getFleetMapData(orgId);
    await service.findOne(orgId, 'veh-1');

    const fleetWhere = (service as any).prisma.vehicle.findMany.mock.calls[0][0].where;
    const detailWhere = (service as any).prisma.vehicle.findFirst.mock.calls[0][0].where;
    expect(fleetWhere.organizationId).toBe(orgId);
    expect(detailWhere.organizationId).toBe(orgId);
  });
});
