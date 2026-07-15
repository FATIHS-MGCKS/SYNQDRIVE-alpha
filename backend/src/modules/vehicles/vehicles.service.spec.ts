import { VehicleStatus } from '@prisma/client';
import { VehiclesService } from './vehicles.service';
import { EMPTY_BOOKING_CONTEXT } from './domain/vehicle-operational-state.builder';

/**
 * Thin integration tests — domain characterization lives in
 * `domain/vehicle-operational-state.builder.spec.ts`.
 */

function makeService(): VehiclesService {
  const stub = (): any => ({});
  return new (VehiclesService as any)(
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
  );
}

const BOOKING_WITH_ACTIVE = {
  ...EMPTY_BOOKING_CONTEXT,
  activeBookingId: 'b-active-1',
  activeCustomerName: 'Jane Doe',
};

describe('VehiclesService.deriveFleetStatusContext (delegation)', () => {
  let service: VehiclesService;

  beforeEach(() => {
    service = makeService();
  });

  it('delegates to buildVehicleOperationalState and returns fleet context', () => {
    const result = service.deriveFleetStatusContext({
      vehicle: { id: 'v1', status: VehicleStatus.AVAILABLE },
      state: null,
      bookingCtx: BOOKING_WITH_ACTIVE,
      pickupOdoByBooking: new Map(),
    });

    expect(result.status).toBe('Active Rented');
    expect(result.bookingDto.activeBookingId).toBe('b-active-1');
  });

  it('logs ghost-state warning via service logger for raw RENTED inconsistency', () => {
    const warnSpy = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => undefined);

    const result = service.deriveFleetStatusContext({
      vehicle: { id: 'v-ghost', status: VehicleStatus.RENTED },
      state: null,
      bookingCtx: null,
      pickupOdoByBooking: new Map(),
    });

    expect(result.status).toBe('Unknown');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Ghost Active Rented'),
    );
    warnSpy.mockRestore();
  });

  it('exposes EMPTY_BOOKING_CONTEXT on the class for legacy callers', () => {
    expect(VehiclesService.EMPTY_BOOKING_CONTEXT).toEqual(EMPTY_BOOKING_CONTEXT);
  });
});
