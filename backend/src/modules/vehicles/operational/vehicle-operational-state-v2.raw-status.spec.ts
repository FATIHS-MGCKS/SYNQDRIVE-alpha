import { VehicleStatus } from '@prisma/client';
import { VehiclesService } from '../vehicles.service';
import {
  EMPTY_BOOKING,
  makeOperationalVehiclesService,
} from './vehicle-operational-state-v2.test-helpers';

describe('Vehicle Operational State V2 — raw status reconciliation', () => {
  let service: VehiclesService;

  beforeEach(() => {
    service = makeOperationalVehiclesService();
  });

  it('demotes RESERVED without booking context to Available (ghost guard)', () => {
    const warnSpy = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => undefined);

    const result = service.deriveFleetStatusContext({
      vehicle: { id: 'veh-1', status: VehicleStatus.RESERVED },
      state: null,
      bookingCtx: null,
      pickupOdoByBooking: new Map(),
    });

    expect(result.status).toBe('Available');
    expect(result.bookingDto).toEqual(EMPTY_BOOKING);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Ghost Reserved'));
    warnSpy.mockRestore();
  });

  it('demotes RENTED without booking context to Available (ghost guard)', () => {
    const result = service.deriveFleetStatusContext({
      vehicle: { id: 'veh-1', status: VehicleStatus.RENTED },
      state: null,
      bookingCtx: null,
      pickupOdoByBooking: new Map(),
    });
    expect(result.status).toBe('Available');
    expect(result.bookingDto.activeBookingId).toBeNull();
  });

  it('promotes AVAILABLE with ACTIVE booking truth to Active Rented', () => {
    const result = service.deriveFleetStatusContext({
      vehicle: { id: 'veh-1', status: VehicleStatus.AVAILABLE },
      state: null,
      bookingCtx: {
        ...EMPTY_BOOKING,
        activeBookingId: 'bk-1',
        activeCustomerName: 'Customer',
        activeReturnAt: '2026-07-12T10:00:00.000Z',
      },
      pickupOdoByBooking: new Map(),
    });
    expect(result.status).toBe('Active Rented');
    expect(result.bookingDto.activeBookingId).toBe('bk-1');
  });

  it('keeps legitimate RENTED when ACTIVE booking backs the raw column', () => {
    const result = service.deriveFleetStatusContext({
      vehicle: { id: 'veh-1', status: VehicleStatus.RENTED },
      state: null,
      bookingCtx: {
        ...EMPTY_BOOKING,
        activeBookingId: 'bk-1',
        activeCustomerName: 'Customer',
      },
      pickupOdoByBooking: new Map(),
    });
    expect(result.status).toBe('Active Rented');
  });
});
