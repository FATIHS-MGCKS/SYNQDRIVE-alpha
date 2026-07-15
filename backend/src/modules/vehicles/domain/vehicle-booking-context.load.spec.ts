import { Logger } from '@nestjs/common';
import {
  classifyBookingContextQueryError,
  degradeMapForHandoverQueryFailure,
  degradeMapForStationQueryFailure,
  finalizeBookingContextMap,
  logBookingContextQueryFailure,
  reliableEmptyBookingContext,
  resolveBookingStateForVehicle,
  unavailableBookingContextForVehicle,
} from './vehicle-booking-context.load';
import { assembleVehicleBookingContext } from './vehicle-booking-context.assembler';
import { EMPTY_HANDOVER_SIGNALS } from './vehicle-booking-context.types';
import type { VehicleBookingQueryRow } from './vehicle-booking-context.types';
import { buildVehicleOperationalStateFromEngineInput } from './vehicle-operational-state.builder';
import { buildVehicleStateEngineInput } from './vehicle-operational-state.input-mapper';
import { VehicleStatus } from '@prisma/client';

const ORG = 'org-a';
const TZ = 'Europe/Berlin';
const EVAL = new Date('2026-07-15T12:00:00.000Z');
const V1 = 'vehicle-1';
const V2 = 'vehicle-2';

function bookingRow(
  overrides: Partial<VehicleBookingQueryRow> & {
    id: string;
    vehicleId?: string;
    status: VehicleBookingQueryRow['status'];
    startDate: Date;
    endDate: Date;
  },
): VehicleBookingQueryRow {
  return {
    vehicleId: V1,
    organizationId: ORG,
    kmIncluded: null,
    kmDriven: null,
    pickupStationId: null,
    returnStationId: null,
    notes: null,
    customerLabel: 'Customer',
    pickupStationName: null,
    returnStationName: null,
    handover: { ...EMPTY_HANDOVER_SIGNALS },
    ...overrides,
  };
}

describe('vehicle-booking-context.load', () => {
  describe('classifyBookingContextQueryError', () => {
    it('classifies Prisma timeout codes', () => {
      expect(classifyBookingContextQueryError({ code: 'P1008' })).toBe(
        'TIMEOUT',
      );
      expect(classifyBookingContextQueryError({ code: 'P2024' })).toBe(
        'TIMEOUT',
      );
    });

    it('classifies other Prisma errors as DATABASE', () => {
      expect(classifyBookingContextQueryError({ code: 'P2002' })).toBe(
        'DATABASE',
      );
    });

    it('classifies unknown errors', () => {
      expect(classifyBookingContextQueryError(new Error('boom'))).toBe(
        'UNKNOWN',
      );
    });
  });

  describe('resolveBookingStateForVehicle', () => {
    it('returns UNAVAILABLE when map is undefined (fail-closed)', () => {
      const state = resolveBookingStateForVehicle(undefined, V1);
      expect(state.dataQualityState).toBe('UNAVAILABLE');
      expect(state.dataQualityReasons).toContain('BOOKING_QUERY_FAILED');
    });

    it('returns RELIABLE empty when map loaded but vehicle has no rows', () => {
      const map = finalizeBookingContextMap({
        organizationId: ORG,
        vehicleIds: [V1, V2],
        organizationTimezone: TZ,
        evaluationAt: EVAL,
        bookingRows: [],
        bookingQueryFailed: false,
        handoverQueryFailed: false,
        stationQueryFailed: false,
      });

      const state = resolveBookingStateForVehicle(map, V2);
      expect(state.dataQualityState).toBe('RELIABLE');
      expect(state.activeBooking).toBeNull();
      expect(state.nextBooking).toBeNull();
    });
  });

  describe('finalizeBookingContextMap', () => {
    it('marks all vehicles UNAVAILABLE on booking query failure', () => {
      const map = finalizeBookingContextMap({
        organizationId: ORG,
        vehicleIds: [V1, V2],
        organizationTimezone: TZ,
        evaluationAt: EVAL,
        bookingRows: [],
        bookingQueryFailed: true,
        handoverQueryFailed: false,
        stationQueryFailed: false,
      });

      expect(map.size).toBe(2);
      for (const state of map.values()) {
        expect(state.dataQualityState).toBe('UNAVAILABLE');
        expect(state.dataQualityReasons).toContain('BOOKING_QUERY_FAILED');
        expect(state.nextBooking).toBeNull();
      }
    });

    it('returns RELIABLE context on successful query with bookings', () => {
      const map = finalizeBookingContextMap({
        organizationId: ORG,
        vehicleIds: [V1],
        organizationTimezone: TZ,
        evaluationAt: EVAL,
        bookingRows: [
          bookingRow({
            id: 'b-future',
            status: 'CONFIRMED',
            startDate: new Date('2026-08-01T08:00:00.000Z'),
            endDate: new Date('2026-08-06T18:00:00.000Z'),
          }),
        ],
        bookingQueryFailed: false,
        handoverQueryFailed: false,
        stationQueryFailed: false,
      });

      const state = map.get(V1)!;
      expect(state.dataQualityState).toBe('RELIABLE');
      expect(state.nextBooking?.id).toBe('b-future');
    });

    it('degrades on handover partial failure without pretending no bookings', () => {
      const map = finalizeBookingContextMap({
        organizationId: ORG,
        vehicleIds: [V1],
        organizationTimezone: TZ,
        evaluationAt: EVAL,
        bookingRows: [
          bookingRow({
            id: 'b-active',
            status: 'ACTIVE',
            startDate: new Date('2026-07-10T08:00:00.000Z'),
            endDate: new Date('2026-07-20T18:00:00.000Z'),
            handover: {
              ...EMPTY_HANDOVER_SIGNALS,
              pickupPerformedAt: new Date('2026-07-10T08:00:00.000Z'),
            },
          }),
        ],
        bookingQueryFailed: false,
        handoverQueryFailed: true,
        stationQueryFailed: false,
      });

      const state = map.get(V1)!;
      expect(state.dataQualityState).toBe('DEGRADED');
      expect(state.dataQualityReasons).toContain('HANDOVER_QUERY_FAILED');
      expect(state.activeBooking).toBeNull();
      expect(state.reservationWindowBooking).toBeNull();
    });

    it('degrades on station partial failure with BOOKING_PARTIAL_RESULT', () => {
      const base = assembleVehicleBookingContext({
        vehicleId: V1,
        organizationId: ORG,
        bookings: [
          bookingRow({
            id: 'b-future',
            status: 'CONFIRMED',
            startDate: new Date('2026-08-01T08:00:00.000Z'),
            endDate: new Date('2026-08-06T18:00:00.000Z'),
          }),
        ],
        evaluationAt: EVAL,
        organizationTimezone: TZ,
      });
      const map = new Map([[V1, base]]);
      degradeMapForStationQueryFailure(map, [V1]);

      expect(map.get(V1)?.dataQualityState).toBe('DEGRADED');
      expect(map.get(V1)?.dataQualityReasons).toContain(
        'BOOKING_PARTIAL_RESULT',
      );
      expect(map.get(V1)?.nextBooking?.id).toBe('b-future');
    });
  });

  describe('state engine integration', () => {
    it('UNAVAILABLE booking context yields UNKNOWN legacy status', () => {
      const output = buildVehicleOperationalStateFromEngineInput(
        buildVehicleStateEngineInput({
          vehicle: {
            id: V1,
            organizationId: ORG,
            status: VehicleStatus.AVAILABLE,
          },
          bookingState: unavailableBookingContextForVehicle(),
          organizationTimezone: TZ,
        }),
      );

      expect(output.operationalState.status).toBe('UNKNOWN');
      expect(output.operationalState.reason).toBe('BOOKING_DATA_UNAVAILABLE');
      expect(output.legacy.status).toBe('Unknown');
      expect(output.bookingContext.nextBooking).toBeNull();
    });

    it('never yields AVAILABLE when booking query failed', () => {
      const output = buildVehicleOperationalStateFromEngineInput(
        buildVehicleStateEngineInput({
          vehicle: {
            id: V1,
            organizationId: ORG,
            status: VehicleStatus.RENTED,
          },
          bookingState: unavailableBookingContextForVehicle(),
          organizationTimezone: TZ,
        }),
      );

      expect(output.legacy.status).not.toBe('Available');
      expect(output.legacy.status).toBe('Unknown');
    });

    it('RELIABLE empty context still allows AVAILABLE', () => {
      const output = buildVehicleOperationalStateFromEngineInput(
        buildVehicleStateEngineInput({
          vehicle: {
            id: V1,
            organizationId: ORG,
            status: VehicleStatus.AVAILABLE,
          },
          bookingState: reliableEmptyBookingContext(),
          organizationTimezone: TZ,
        }),
      );

      expect(output.operationalState.status).toBe('AVAILABLE');
      expect(output.legacy.status).toBe('Available');
    });
  });

  describe('logBookingContextQueryFailure', () => {
    it('logs structured fields without rethrowing', () => {
      const logger = new Logger('test');
      const spy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);

      logBookingContextQueryFailure(logger, {
        msg: 'fleet booking context primary query failed',
        organizationId: ORG,
        vehicleScope: { count: 3 },
        queryLayer: 'BOOKING',
        errorClass: 'DATABASE',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG,
          vehicleScope: { count: 3 },
          queryLayer: 'BOOKING',
          errorClass: 'DATABASE',
        }),
      );
      spy.mockRestore();
    });
  });
});

describe('degradeMapForHandoverQueryFailure', () => {
  it('withholds reservation and active slots on handover failure', () => {
    const assembled = assembleVehicleBookingContext({
      vehicleId: V1,
      organizationId: ORG,
      bookings: [
        bookingRow({
          id: 'b-window',
          status: 'CONFIRMED',
          startDate: new Date('2026-07-15T08:00:00.000Z'),
          endDate: new Date('2026-07-20T18:00:00.000Z'),
        }),
      ],
      evaluationAt: EVAL,
      organizationTimezone: TZ,
    });
    expect(assembled.reservationWindowBooking).not.toBeNull();

    const map = new Map([[V1, assembled]]);
    degradeMapForHandoverQueryFailure(map, [V1]);

    expect(map.get(V1)?.reservationWindowBooking).toBeNull();
    expect(map.get(V1)?.dataQualityState).toBe('DEGRADED');
  });
});
