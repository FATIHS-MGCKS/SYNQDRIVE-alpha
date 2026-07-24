import { VehicleStatus } from '@prisma/client';
import { VehiclesService } from '../vehicles.service';
import { mapRawVehicleStatusToFleetLabel } from '../diagnostic/vehicle-booking-handover-diagnostic.util';
import {
  EMPTY_BOOKING,
  makeOperationalVehiclesService,
} from './vehicle-operational-state-v2.test-helpers';

describe('Vehicle Operational State V2 — state engine (deriveFleetStatusContext)', () => {
  let service: VehiclesService;

  beforeEach(() => {
    service = makeOperationalVehiclesService();
  });

  const activeCtx = {
    ...EMPTY_BOOKING,
    activeBookingId: 'bk-active',
    activeCustomerName: 'Jane Doe',
    activeReturnAt: '2026-07-12T12:00:00.000Z',
  };

  const reservedCtx = {
    ...EMPTY_BOOKING,
    reservedBookingId: 'bk-reserved',
    reservedCustomerName: 'John Doe',
    reservedPickupAt: '2026-07-10T09:00:00.000Z',
  };

  it.each([
    ['Available', VehicleStatus.AVAILABLE, null, 'Available'],
    ['Reserved', VehicleStatus.AVAILABLE, reservedCtx, 'Reserved'],
    ['Active Rented', VehicleStatus.AVAILABLE, activeCtx, 'Active Rented'],
    ['Maintenance IN_SERVICE', VehicleStatus.IN_SERVICE, activeCtx, 'Maintenance'],
    ['Blocked OUT_OF_SERVICE', VehicleStatus.OUT_OF_SERVICE, null, 'Blocked'],
  ] as const)(
    'maps %s',
    (_label, dbStatus, bookingCtx, expected) => {
      const result = service.deriveFleetStatusContext({
        vehicle: { id: 'veh-1', status: dbStatus },
        state: null,
        bookingCtx,
        pickupOdoByBooking: new Map(),
      });
      expect(result.status).toBe(expected);
    },
  );

  it('maps master-admin Blocked label separately from rental Maintenance', () => {
    expect(mapRawVehicleStatusToFleetLabel(VehicleStatus.OUT_OF_SERVICE)).toBe(
      'Blocked',
    );
    expect(
      service.deriveFleetStatusContext({
        vehicle: { id: 'veh-1', status: VehicleStatus.OUT_OF_SERVICE },
        state: null,
        bookingCtx: null,
        pickupOdoByBooking: new Map(),
      }).status,
    ).toBe('Blocked');
    expect(
      service.deriveFleetStatusContext({
        vehicle: { id: 'veh-1', status: VehicleStatus.OUT_OF_SERVICE },
        state: null,
        bookingCtx: null,
        pickupOdoByBooking: new Map(),
      }).maintenanceCtx.maintenanceReasonCode,
    ).toBe('OPERATIONAL_BLOCK');
  });

  it('never surfaces Unknown from derivation — ghost raw states demote to Available', () => {
    const result = service.deriveFleetStatusContext({
      vehicle: { id: 'veh-ghost', status: VehicleStatus.RENTED },
      state: null,
      bookingCtx: null,
      pickupOdoByBooking: new Map(),
    });
    expect(result.status).not.toBe('Unknown');
    expect(result.status).toBe('Available');
  });

  it('drops booking card fields on Maintenance even when ACTIVE booking exists', () => {
    const result = service.deriveFleetStatusContext({
      vehicle: { id: 'veh-1', status: VehicleStatus.IN_SERVICE },
      state: null,
      bookingCtx: activeCtx,
      pickupOdoByBooking: new Map(),
    });
    expect(result.status).toBe('Maintenance');
    expect(result.bookingDto.activeBookingId).toBeNull();
    expect(result.bookingDto.reservedBookingId).toBeNull();
  });

  it('prefers Active Rented over Reserved when both booking slots are populated', () => {
    const result = service.deriveFleetStatusContext({
      vehicle: { id: 'veh-1', status: VehicleStatus.AVAILABLE },
      state: null,
      bookingCtx: { ...reservedCtx, ...activeCtx },
      pickupOdoByBooking: new Map(),
    });
    expect(result.status).toBe('Active Rented');
  });
});
