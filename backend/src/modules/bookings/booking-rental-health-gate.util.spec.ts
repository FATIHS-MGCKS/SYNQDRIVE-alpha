import { ConflictException } from '@nestjs/common';
import type { RentalHealthGateResult } from '@modules/rental-health/rental-health.service';
import {
  bookingRentalHealthGateAllowsCreate,
  enforceBookingRentalHealthGate,
} from './booking-rental-health-gate.util';

const VEHICLE_ID = 'veh-1';

function gate(overrides: Partial<RentalHealthGateResult> = {}): RentalHealthGateResult {
  return {
    blocked: false,
    reasons: [],
    healthGateStatus: 'OK',
    healthGateWarning: null,
    manualReviewRequired: false,
    ...overrides,
  };
}

function expectGateThrows(
  rentalGate: RentalHealthGateResult,
  code: 'VEHICLE_RENTAL_BLOCKED' | 'VEHICLE_HEALTH_GATE_UNAVAILABLE',
): void {
  try {
    enforceBookingRentalHealthGate(rentalGate, VEHICLE_ID);
    throw new Error('expected ConflictException');
  } catch (error) {
    expect(error).toBeInstanceOf(ConflictException);
    const response = (error as ConflictException).getResponse() as Record<string, unknown>;
    expect(response.code).toBe(code);
    expect(response.vehicleId).toBe(VEHICLE_ID);
  }
}

describe('booking-rental-health-gate.util', () => {
  describe('enforceBookingRentalHealthGate', () => {
    it('allows booking create when rental health is good', () => {
      expect(() =>
        enforceBookingRentalHealthGate(
          gate({
            healthGateStatus: 'OK',
            blocked: false,
            reasons: [],
          }),
          VEHICLE_ID,
        ),
      ).not.toThrow();
    });

    it('blocks booking create when rental health is blocked', () => {
      expectGateThrows(
        gate({
          healthGateStatus: 'BLOCKED',
          blocked: true,
          reasons: ['Reifen kritisch', 'DTC aktiv'],
        }),
        'VEHICLE_RENTAL_BLOCKED',
      );
    });

    it('fails closed when health gate is unavailable', () => {
      expectGateThrows(
        gate({
          healthGateStatus: 'UNAVAILABLE',
          blocked: false,
          healthGateWarning: 'Rental-Health-Aggregation fehlgeschlagen',
          manualReviewRequired: true,
          reasons: ['aggregation_failed'],
        }),
        'VEHICLE_HEALTH_GATE_UNAVAILABLE',
      );
    });

    it('fails closed when health gate status is unknown', () => {
      expectGateThrows(
        gate({
          healthGateStatus: 'UNKNOWN',
          blocked: false,
          manualReviewRequired: true,
          reasons: ['health_unknown'],
        }),
        'VEHICLE_HEALTH_GATE_UNAVAILABLE',
      );
    });

    it('does not consult service cases or tasks — health good passes even when runtime would block operationally', () => {
      // Booking gate is health-only. A blocking service case affects runtime UI,
      // but must not block booking create unless rental health blocks.
      expect(() =>
        enforceBookingRentalHealthGate(
          gate({
            healthGateStatus: 'OK',
            blocked: false,
            reasons: [],
          }),
          VEHICLE_ID,
        ),
      ).not.toThrow();

      expect(
        bookingRentalHealthGateAllowsCreate(
          gate({
            healthGateStatus: 'OK',
            blocked: false,
            reasons: [],
          }),
        ),
      ).toBe(true);
    });

    it('surfaces blocking reasons on genuine health block', () => {
      try {
        enforceBookingRentalHealthGate(
          gate({
            healthGateStatus: 'BLOCKED',
            blocked: true,
            reasons: ['TÜV überfällig'],
          }),
          VEHICLE_ID,
        );
        throw new Error('expected ConflictException');
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictException);
        const response = (error as ConflictException).getResponse() as Record<string, unknown>;
        expect(response.blockingReasons).toEqual(['TÜV überfällig']);
        expect(response.code).toBe('VEHICLE_RENTAL_BLOCKED');
      }
    });
  });

  describe('bookingRentalHealthGateAllowsCreate', () => {
    it('returns true only for a clean OK gate', () => {
      expect(
        bookingRentalHealthGateAllowsCreate(
          gate({
            healthGateStatus: 'OK',
            blocked: false,
            manualReviewRequired: false,
          }),
        ),
      ).toBe(true);
    });

    it('returns false when health is blocked', () => {
      expect(
        bookingRentalHealthGateAllowsCreate(
          gate({
            healthGateStatus: 'BLOCKED',
            blocked: true,
            reasons: ['Bremsen kritisch'],
          }),
        ),
      ).toBe(false);
    });

    it('returns false when manual review is required', () => {
      expect(
        bookingRentalHealthGateAllowsCreate(
          gate({
            healthGateStatus: 'OK',
            blocked: false,
            manualReviewRequired: true,
          }),
        ),
      ).toBe(false);
    });

    it('returns false when gate is unavailable or unknown', () => {
      expect(
        bookingRentalHealthGateAllowsCreate(
          gate({ healthGateStatus: 'UNAVAILABLE', manualReviewRequired: true }),
        ),
      ).toBe(false);
      expect(
        bookingRentalHealthGateAllowsCreate(
          gate({ healthGateStatus: 'UNKNOWN', manualReviewRequired: true }),
        ),
      ).toBe(false);
    });
  });
});
