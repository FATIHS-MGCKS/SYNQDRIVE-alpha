import { VehicleStatus } from '@prisma/client';
import {
  buildDiagnosticBookingContext,
} from '../diagnostic/vehicle-booking-handover-diagnostic.util';
import { VehiclesService } from '../vehicles.service';
import {
  EMPTY_BOOKING,
  makeBookingRow,
  makeOperationalPrismaMocks,
  makeOperationalVehiclesService,
} from './vehicle-operational-state-v2.test-helpers';

const NOW = new Date('2026-07-10T12:00:00.000Z');

describe('Vehicle Operational State V2 — active rental lifecycle', () => {
  it('surfaces Active Rented for consistent ACTIVE booking + pickup truth', () => {
    const service = makeOperationalVehiclesService();
    const ctx = buildDiagnosticBookingContext(
      [
        {
          id: 'bk-active',
          organizationId: 'org-1',
          vehicleId: 'veh-1',
          status: 'ACTIVE',
          startDate: new Date('2026-07-10T08:00:00.000Z'),
          endDate: new Date('2026-07-12T08:00:00.000Z'),
          completedAt: null,
          cancelledAt: null,
          createdAt: new Date('2026-06-01T08:00:00.000Z'),
        },
      ],
      NOW,
    );
    const result = service.deriveFleetStatusContext({
      vehicle: { id: 'veh-1', status: VehicleStatus.RENTED },
      state: { odometerKm: 15000 },
      bookingCtx: ctx,
      pickupOdoByBooking: new Map([['bk-active', 14000]]),
    });
    expect(result.status).toBe('Active Rented');
    expect(result.liveKmDriven).toBe(1000);
  });

  it('derives Active Rented from ACTIVE booking even when raw vehicle is AVAILABLE', () => {
    const service = makeOperationalVehiclesService();
    const result = service.deriveFleetStatusContext({
      vehicle: { id: 'veh-1', status: VehicleStatus.AVAILABLE },
      state: null,
      bookingCtx: {
        ...EMPTY_BOOKING,
        activeBookingId: 'bk-active',
        activeCustomerName: 'Renter',
      },
      pickupOdoByBooking: new Map(),
    });
    expect(result.status).toBe('Active Rented');
  });

  it('does not treat raw RENTED without ACTIVE booking as Active Rented', () => {
    const service = makeOperationalVehiclesService();
    const result = service.deriveFleetStatusContext({
      vehicle: { id: 'veh-1', status: VehicleStatus.RENTED },
      state: null,
      bookingCtx: null,
      pickupOdoByBooking: new Map(),
    });
    expect(result.status).toBe('Available');
  });

  it('omits COMPLETED bookings from active rental context map', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);

    const bookingFindMany = jest.fn().mockResolvedValue([]);
    const service = makeOperationalVehiclesService({
      prisma: makeOperationalPrismaMocks({
        booking: { findMany: bookingFindMany },
      }),
    });
    const { map } = await (service as any).buildBookingContextMap('org-1', ['veh-1']);
    expect(map.get('veh-1')).toBeUndefined();
    expect(bookingFindMany.mock.calls[0][0].where.OR).toEqual(
      expect.arrayContaining([
        { status: 'ACTIVE' },
        expect.objectContaining({ status: { in: ['PENDING', 'CONFIRMED'] } }),
      ]),
    );
    jest.useRealTimers();
  });

  it('keeps earliest ACTIVE when multiple ACTIVE rows exist (unexpected data)', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);

    const bookingFindMany = jest.fn().mockResolvedValue([
      makeBookingRow({
        id: 'bk-active-1',
        status: 'ACTIVE',
        startDate: new Date('2026-07-09T08:00:00.000Z'),
        endDate: new Date('2026-07-11T08:00:00.000Z'),
      }),
      makeBookingRow({
        id: 'bk-active-2',
        status: 'ACTIVE',
        startDate: new Date('2026-07-10T08:00:00.000Z'),
        endDate: new Date('2026-07-12T08:00:00.000Z'),
      }),
    ]);
    const service = makeOperationalVehiclesService({
      prisma: makeOperationalPrismaMocks({
        booking: { findMany: bookingFindMany },
        station: { findMany: jest.fn().mockResolvedValue([{ id: 'st-1', name: 'Kassel' }]) },
      }),
    });
    const { map } = await (service as any).buildBookingContextMap('org-1', ['veh-1']);
    expect(map.get('veh-1')?.activeBookingId).toBe('bk-active-1');
    jest.useRealTimers();
  });
});
