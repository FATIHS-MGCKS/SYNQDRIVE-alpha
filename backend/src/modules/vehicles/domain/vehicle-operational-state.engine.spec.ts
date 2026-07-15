import { VehicleStatus } from '@prisma/client';
import {
  assertEngineTimezone,
  buildVehicleOperationalStateFromEngineInput,
  buildVehicleStateEngineInput,
  mapRawStatusToBlockingState,
  mapRawStatusToMaintenanceState,
} from './vehicle-operational-state.builder';
import type { VehicleStateEngineInput } from './vehicle-operational-state.engine.types';
import { EMPTY_BOOKING_CONTEXT } from './vehicle-operational-state.types';

const BASE_CONTEXT = {
  now: new Date('2026-07-15T12:00:00.000Z'),
  organizationTimezone: 'Europe/Berlin',
};

function fullEngineInput(
  overrides: Partial<VehicleStateEngineInput> = {},
): VehicleStateEngineInput {
  return {
    vehicle: {
      id: 'v-1',
      organizationId: 'org-1',
      rawStatus: VehicleStatus.AVAILABLE,
      licensePlate: 'AB-CD-1',
      tankCapacityLiters: 50,
      persistedAt: '2026-07-01T08:00:00.000Z',
      ...overrides.vehicle,
    },
    bookingState: {
      activeBooking: null,
      reservationWindowBooking: null,
      nextBooking: null,
      futureBookingCount: 0,
      dataQualityState: 'RELIABLE',
      dataQualityReasons: [],
      ...overrides.bookingState,
    },
    maintenanceState: {
      isMaintenance: false,
      reasonCodes: [],
      source: 'NONE',
      ...overrides.maintenanceState,
    },
    blockingState: {
      isBlocked: false,
      level: 'none',
      reasonCodes: [],
      source: 'NONE',
      ...overrides.blockingState,
    },
    context: {
      ...BASE_CONTEXT,
      ...overrides.context,
    },
    telemetry: overrides.telemetry ?? null,
    pickupOdoByBooking: overrides.pickupOdoByBooking ?? new Map(),
  };
}

describe('VehicleStateEngine input/output model (Prompt 7)', () => {
  describe('context.timezone', () => {
    it('requires organizationTimezone', () => {
      expect(() =>
        assertEngineTimezone({ organizationTimezone: '' }),
      ).toThrow(/organizationTimezone is required/);
    });

    it('accepts explicit IANA timezone', () => {
      const input = fullEngineInput({
        context: { now: new Date(), organizationTimezone: 'America/New_York' },
      });
      expect(() =>
        buildVehicleOperationalStateFromEngineInput(input),
      ).not.toThrow();
    });
  });

  describe('full normalized input', () => {
    it('returns operationalState, bookingContext, rawVehicleStatus, diagnosticReasons', () => {
      const input = fullEngineInput({
        bookingState: {
          activeBooking: {
            id: 'b-active',
            bookingNumber: 'BK-000101',
            status: 'ACTIVE',
            pickupAt: '2026-07-15T08:00:00.000Z',
            returnAt: '2026-07-20T18:00:00.000Z',
            customerLabel: 'Jane Doe',
            vehicleId: 'v-1',
            phase: 'active_rental',
          },
          reservationWindowBooking: null,
          nextBooking: null,
          futureBookingCount: 0,
          dataQualityState: 'RELIABLE',
          dataQualityReasons: [],
        },
      });

      const output = buildVehicleOperationalStateFromEngineInput(input);

      expect(output.operationalState.status).toBe('ACTIVE_RENTED');
      expect(output.operationalState.reason).toBe('ACTIVE_BOOKING');
      expect(output.operationalState.dataQualityState).toBe('DEGRADED');
      expect(output.operationalState.isReliable).toBe(false);
      expect(output.bookingContext.activeBooking?.bookingNumber).toBe(
        'BK-000101',
      );
      expect(output.rawVehicleStatus.value).toBe(VehicleStatus.AVAILABLE);
      expect(output.diagnosticReasons).toContain('RAW_STATUS_INCONSISTENT');
      expect(output.legacy.status).toBe('Active Rented');
      expect(output.legacy.ghostStateWarning).toMatch(/Raw AVAILABLE mismatch/);
    });
  });

  describe('missing optional bookings vs explicit none', () => {
    it('distinguishes undefined booking slices in input assembly', () => {
      const partial: VehicleStateEngineInput = {
        ...fullEngineInput(),
        bookingState: {
          futureBookingCount: 0,
          dataQualityState: 'RELIABLE',
          dataQualityReasons: [],
        },
      };
      expect(partial.bookingState.activeBooking).toBeUndefined();
      expect(partial.bookingState.reservationWindowBooking).toBeUndefined();
    });

    it('maps explicit null bookings to empty legacy context', () => {
      const output = buildVehicleOperationalStateFromEngineInput(
        fullEngineInput({
          bookingState: {
            activeBooking: null,
            reservationWindowBooking: null,
            nextBooking: null,
            futureBookingCount: 0,
            dataQualityState: 'RELIABLE',
            dataQualityReasons: [],
          },
        }),
      );

      expect(output.legacy.status).toBe('Available');
      expect(output.legacy.bookingDto).toEqual(EMPTY_BOOKING_CONTEXT);
      expect(output.bookingContext.activeBooking).toBeNull();
    });
  });

  describe('DEGRADED booking state', () => {
    it('fails closed to UNKNOWN with degraded data quality', () => {
      const output = buildVehicleOperationalStateFromEngineInput(
        fullEngineInput({
          bookingState: {
            activeBooking: null,
            reservationWindowBooking: null,
            nextBooking: null,
            futureBookingCount: 0,
            dataQualityState: 'DEGRADED',
            dataQualityReasons: ['BOOKING_PARTIAL_RESULT'],
          },
        }),
      );

      expect(output.operationalState.dataQualityState).toBe('DEGRADED');
      expect(output.operationalState.isReliable).toBe(false);
      expect(output.operationalState.status).toBe('UNKNOWN');
      expect(output.operationalState.reason).toBe('BOOKING_STATE_INCONSISTENT');
      expect(output.diagnosticReasons).toContain('BOOKING_PARTIAL_RESULT');
    });
  });

  describe('maintenance and blocking inputs', () => {
    it('maps maintenance state while preserving V1 Maintenance label', () => {
      const output = buildVehicleOperationalStateFromEngineInput(
        fullEngineInput({
          vehicle: {
            id: 'v-maint',
            organizationId: 'org-1',
            rawStatus: VehicleStatus.IN_SERVICE,
          },
          maintenanceState: mapRawStatusToMaintenanceState(
            VehicleStatus.IN_SERVICE,
          ),
        }),
      );

      expect(output.operationalState.status).toBe('MAINTENANCE');
      expect(output.operationalState.reason).toBe('MAINTENANCE_ACTIVE');
      expect(output.diagnosticReasons).toContain('SCHEDULED_SERVICE');
      expect(output.legacy.status).toBe('Maintenance');
    });

    it('carries hard block input alongside legacy Maintenance fleet label', () => {
      const output = buildVehicleOperationalStateFromEngineInput(
        fullEngineInput({
          vehicle: {
            id: 'v-blocked',
            organizationId: 'org-1',
            rawStatus: VehicleStatus.OUT_OF_SERVICE,
          },
          blockingState: mapRawStatusToBlockingState(
            VehicleStatus.OUT_OF_SERVICE,
          ),
        }),
      );

      expect(output.operationalState.status).toBe('BLOCKED');
      expect(output.operationalState.reason).toBe('HARD_BLOCK_ACTIVE');
      expect(output.legacy.status).toBe('Maintenance');
      expect(output.diagnosticReasons).toContain('OPERATIONAL_BLOCK');
      expect(output.rawVehicleStatus.value).toBe(VehicleStatus.OUT_OF_SERVICE);
    });
  });

  describe('buildVehicleStateEngineInput from legacy fleet DTO', () => {
    it('assembles engine input with explicit timezone', () => {
      const input = buildVehicleStateEngineInput({
        vehicle: {
          id: 'v-2',
          organizationId: 'org-2',
          status: VehicleStatus.AVAILABLE,
        },
        bookingCtx: {
          ...EMPTY_BOOKING_CONTEXT,
          reservedBookingId: 'b-res',
          reservedCustomerName: 'John',
          reservedPickupAt: '2026-08-01T10:00:00.000Z',
          reservedReturnAt: '2026-08-06T18:00:00.000Z',
        },
        organizationTimezone: 'Europe/Berlin',
      });

      expect(input.context.organizationTimezone).toBe('Europe/Berlin');
      expect(input.bookingState.reservationWindowBooking?.phase).toBe(
        'pickup_window',
      );
      const output = buildVehicleOperationalStateFromEngineInput(input);
      expect(output.legacy.status).toBe('Reserved');
    });
  });
});
