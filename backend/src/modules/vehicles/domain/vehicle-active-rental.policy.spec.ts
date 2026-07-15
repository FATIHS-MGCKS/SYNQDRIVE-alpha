import type { BookingStatus } from '@prisma/client';
import {
  hasBelievablePickupEvidence,
  hasCompletedReturnEvidence,
  resolveActiveRentalForVehicle,
} from './vehicle-active-rental.policy';
import {
  EMPTY_HANDOVER_SIGNALS,
  type VehicleBookingQueryRow,
} from './vehicle-booking-context.types';

const ORG = 'org-a';
const VEHICLE = 'vehicle-a';

function bookingRow(
  overrides: Partial<VehicleBookingQueryRow> & {
    id: string;
    status: BookingStatus;
    startDate: Date;
    endDate: Date;
  },
): VehicleBookingQueryRow {
  return {
    vehicleId: VEHICLE,
    organizationId: ORG,
    kmIncluded: null,
    kmDriven: null,
    pickupStationId: null,
    returnStationId: null,
    notes: null,
    customerLabel: 'Customer',
    pickupStationName: null,
    returnStationName: null,
    ...overrides,
    handover: { ...EMPTY_HANDOVER_SIGNALS, ...overrides.handover },
  };
}

const PICKUP_AT = new Date('2026-07-10T08:00:00.000Z');
const RETURN_AT = new Date('2026-07-20T18:00:00.000Z');

describe('vehicle-active-rental.policy', () => {
  describe('hasBelievablePickupEvidence', () => {
    it('accepts PICKUP protocol performedAt', () => {
      expect(
        hasBelievablePickupEvidence({
          ...EMPTY_HANDOVER_SIGNALS,
          pickupPerformedAt: PICKUP_AT,
        }),
      ).toBe(true);
    });

    it('accepts actualPickupStationId from handover path', () => {
      expect(
        hasBelievablePickupEvidence({
          ...EMPTY_HANDOVER_SIGNALS,
          actualPickupStationId: 'station-1',
        }),
      ).toBe(true);
    });
  });

  describe('resolveActiveRentalForVehicle', () => {
    it('returns consistent active rental when ACTIVE with pickup and open return', () => {
      const result = resolveActiveRentalForVehicle({
        vehicleId: VEHICLE,
        organizationId: ORG,
        bookings: [
          bookingRow({
            id: 'b-active',
            status: 'ACTIVE',
            startDate: PICKUP_AT,
            endDate: RETURN_AT,
            handover: {
              ...EMPTY_HANDOVER_SIGNALS,
              pickupPerformedAt: PICKUP_AT,
            },
          }),
        ],
      });

      expect(result.isReliable).toBe(true);
      expect(result.activeRow?.id).toBe('b-active');
      expect(result.dataQualityReasons).toEqual([]);
    });

    it('case A: ACTIVE without pickup evidence is not reliable', () => {
      const result = resolveActiveRentalForVehicle({
        vehicleId: VEHICLE,
        organizationId: ORG,
        bookings: [
          bookingRow({
            id: 'b-active-no-pickup',
            status: 'ACTIVE',
            startDate: PICKUP_AT,
            endDate: RETURN_AT,
          }),
        ],
      });

      expect(result.isReliable).toBe(false);
      expect(result.activeRow).toBeNull();
      expect(result.diagnostics).toContain('ACTIVE_WITHOUT_PICKUP');
      expect(result.dataQualityReasons).toContain(
        'ACTIVE_WITHOUT_PICKUP_PROTOCOL',
      );
    });

    it('case B: pickup completed but booking not ACTIVE', () => {
      const result = resolveActiveRentalForVehicle({
        vehicleId: VEHICLE,
        organizationId: ORG,
        bookings: [
          bookingRow({
            id: 'b-confirmed-with-pickup',
            status: 'CONFIRMED',
            startDate: PICKUP_AT,
            endDate: RETURN_AT,
            handover: {
              ...EMPTY_HANDOVER_SIGNALS,
              pickupPerformedAt: PICKUP_AT,
            },
          }),
        ],
      });

      expect(result.isReliable).toBe(false);
      expect(result.activeRow).toBeNull();
      expect(result.diagnostics).toContain('PICKUP_WITHOUT_ACTIVE');
      expect(result.dataQualityReasons).toContain(
        'PICKUP_WITHOUT_ACTIVE_BOOKING',
      );
    });

    it('case C: return completed while booking still ACTIVE', () => {
      const result = resolveActiveRentalForVehicle({
        vehicleId: VEHICLE,
        organizationId: ORG,
        bookings: [
          bookingRow({
            id: 'b-stale-active',
            status: 'ACTIVE',
            startDate: PICKUP_AT,
            endDate: RETURN_AT,
            handover: {
              ...EMPTY_HANDOVER_SIGNALS,
              pickupPerformedAt: PICKUP_AT,
              returnPerformedAt: new Date('2026-07-18T10:00:00.000Z'),
            },
          }),
        ],
      });

      expect(result.isReliable).toBe(false);
      expect(result.activeRow).toBeNull();
      expect(result.diagnostics).toContain('RETURN_COMPLETE_BUT_ACTIVE');
      expect(result.dataQualityReasons).toContain(
        'RETURN_COMPLETED_WHILE_ACTIVE',
      );
    });

    it('case D: multiple ACTIVE bookings for same vehicle', () => {
      const result = resolveActiveRentalForVehicle({
        vehicleId: VEHICLE,
        organizationId: ORG,
        bookings: [
          bookingRow({
            id: 'b-active-1',
            status: 'ACTIVE',
            startDate: PICKUP_AT,
            endDate: RETURN_AT,
            handover: {
              ...EMPTY_HANDOVER_SIGNALS,
              pickupPerformedAt: PICKUP_AT,
            },
          }),
          bookingRow({
            id: 'b-active-2',
            status: 'ACTIVE',
            startDate: new Date('2026-07-12T08:00:00.000Z'),
            endDate: new Date('2026-07-22T18:00:00.000Z'),
            handover: {
              ...EMPTY_HANDOVER_SIGNALS,
              pickupPerformedAt: new Date('2026-07-12T08:00:00.000Z'),
            },
          }),
        ],
      });

      expect(result.isReliable).toBe(false);
      expect(result.activeRow).toBeNull();
      expect(result.diagnostics).toContain('MULTIPLE_ACTIVE_BOOKINGS');
      expect(result.dataQualityReasons).toContain('MULTIPLE_ACTIVE_BOOKINGS');
    });

    it('tenant separation: mismatched organizationId is not reliable', () => {
      const result = resolveActiveRentalForVehicle({
        vehicleId: VEHICLE,
        organizationId: ORG,
        bookings: [
          bookingRow({
            id: 'b-cross-tenant',
            status: 'ACTIVE',
            startDate: PICKUP_AT,
            endDate: RETURN_AT,
            organizationId: 'org-other',
            handover: {
              ...EMPTY_HANDOVER_SIGNALS,
              pickupPerformedAt: PICKUP_AT,
            },
          }),
        ],
      });

      expect(result.isReliable).toBe(false);
      expect(result.activeRow).toBeNull();
      expect(result.diagnostics).toContain('TENANT_VEHICLE_MISMATCH');
      expect(result.dataQualityReasons).toContain(
        'BOOKING_TENANT_SCOPE_VIOLATION',
      );
    });
  });

  describe('hasCompletedReturnEvidence', () => {
    it('detects RETURN protocol', () => {
      expect(
        hasCompletedReturnEvidence(
          {
            ...EMPTY_HANDOVER_SIGNALS,
            returnPerformedAt: new Date('2026-07-18T10:00:00.000Z'),
          },
          'ACTIVE',
        ),
      ).toBe(true);
    });

    it('detects completedAt on booking', () => {
      expect(
        hasCompletedReturnEvidence(
          {
            ...EMPTY_HANDOVER_SIGNALS,
            completedAt: new Date('2026-07-18T10:00:00.000Z'),
          },
          'ACTIVE',
        ),
      ).toBe(true);
    });
  });
});
