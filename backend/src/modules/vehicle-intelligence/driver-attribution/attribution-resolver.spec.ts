import {
  CustomerType,
  DriverAttributionType,
  DrivingAttributionConfidence,
  TripAssignmentStatus,
} from '@prisma/client';
import { resolveTripAttribution } from './attribution-resolver';
import type { AttributionResolverInput } from './attribution-resolver.types';

function baseInput(
  overrides: Partial<AttributionResolverInput> = {},
): AttributionResolverInput {
  return {
    isPrivateTrip: false,
    assignmentStatus: TripAssignmentStatus.ASSIGNED_DRIVER,
    assignmentSubjectType: 'DRIVER',
    assignmentSubjectId: 'driver-1',
    assignedBookingId: 'book-1',
    bookingLinkSource: 'EXPLICIT',
    tripBookingCustomerId: 'cust-1',
    tripAssignedDriverId: 'driver-1',
    tripActualDriverId: null,
    bookingCustomerId: 'cust-1',
    bookingAssignedDriverId: 'driver-1',
    bookingCustomerType: CustomerType.INDIVIDUAL,
    tripAttributionScope: 'BOOKING_ASSIGNED',
    tripAttributionConfidence: 'HIGH',
    ...overrides,
  };
}

describe('resolveTripAttribution (P55)', () => {
  it('prioritizes manual confirmed driver over assigned and time window', () => {
    const result = resolveTripAttribution(
      baseInput({
        manualOverride: {
          driverId: 'manual-driver',
          resolvedByUserId: 'user-1',
          resolvedAt: new Date(),
        },
        tripAttributionScope: 'BOOKING_TIME_WINDOW_MATCH',
        tripAttributionConfidence: 'MEDIUM',
      }),
    );

    expect(result.attributionType).toBe(DriverAttributionType.CONFIRMED_DRIVER);
    expect(result.driverId).toBe('manual-driver');
    expect(result.confidence).toBe(DrivingAttributionConfidence.HIGH);
    expect(result.source).toBe('MANUAL_RESOLUTION');
    expect(result.conflicts.some((c) => c.code === 'MANUAL_OVERRIDE_VS_PIPELINE')).toBe(true);
  });

  it('uses confirmed driver when explicit booking promotes assigned to actual', () => {
    const result = resolveTripAttribution(
      baseInput({
        tripActualDriverId: null,
        tripAttributionScope: 'BOOKING_ASSIGNED',
      }),
    );

    expect(result.attributionType).toBe(DriverAttributionType.CONFIRMED_DRIVER);
    expect(result.driverId).toBe('driver-1');
    expect(result.driverEligibility).toBe(true);
  });

  it('uses assigned driver tier when assignment exists without confirmation', () => {
    const result = resolveTripAttribution(
      baseInput({
        bookingLinkSource: null,
        tripActualDriverId: null,
        tripAttributionScope: 'UNASSIGNED',
        tripAttributionConfidence: 'LOW',
      }),
    );

    expect(result.attributionType).toBe(DriverAttributionType.ASSIGNED_DRIVER);
    expect(result.driverId).toBe('driver-1');
    expect(result.driverEligibility).toBe(true);
  });

  it('elevates digital handover proof above booking-customer-only hint', () => {
    const result = resolveTripAttribution(
      baseInput({
        tripAssignedDriverId: null,
        tripActualDriverId: null,
        bookingAssignedDriverId: null,
        assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
        assignmentSubjectType: 'BOOKING_CUSTOMER',
        assignmentSubjectId: 'cust-1',
        handoverProof: {
          protocolId: 'hp-1',
          bookingId: 'book-1',
          kind: 'PICKUP',
          performedAt: new Date('2026-07-16T08:00:00Z'),
          customerSignatureName: 'Max Mustermann',
          staffSignatureName: 'Staff',
        },
      }),
    );

    expect(result.attributionType).toBe(DriverAttributionType.CONFIRMED_DRIVER);
    expect(result.driverId).toBe('cust-1');
    expect(result.confidence).toBe(DrivingAttributionConfidence.MEDIUM);
    expect(result.reasons.some((r) => r.includes('Handover'))).toBe(true);
  });

  it('caps TIME_WINDOW_MATCH confidence — never HIGH alone', () => {
    const result = resolveTripAttribution(
      baseInput({
        bookingLinkSource: 'TIME_WINDOW',
        tripAttributionScope: 'BOOKING_TIME_WINDOW_MATCH',
        tripAttributionConfidence: 'HIGH',
        tripAssignedDriverId: null,
        tripActualDriverId: null,
        bookingAssignedDriverId: null,
        assignmentStatus: TripAssignmentStatus.UNKNOWN_ASSIGNMENT,
        assignmentSubjectId: null,
      }),
    );

    expect(result.attributionType).toBe(DriverAttributionType.TIME_WINDOW_MATCH);
    expect(result.confidence).not.toBe(DrivingAttributionConfidence.HIGH);
    expect(result.customerEligibility).toBe(false);
    expect(result.reasons.some((r) => r.includes('TIME_WINDOW_MATCH allein'))).toBe(true);
  });

  it('does not charge private trips to customer', () => {
    const result = resolveTripAttribution(
      baseInput({
        isPrivateTrip: true,
        assignmentStatus: TripAssignmentStatus.PRIVATE_UNASSIGNED,
        assignedBookingId: 'book-ghost',
        tripAttributionScope: 'PRIVATE',
      }),
    );

    expect(result.attributionType).toBe(DriverAttributionType.PRIVATE);
    expect(result.customerEligibility).toBe(false);
    expect(result.conflicts.some((c) => c.code === 'PRIVATE_VS_BOOKING_LINK')).toBe(true);
  });

  it('does not charge staff movement to customer', () => {
    const result = resolveTripAttribution(
      baseInput({
        assignedBookingId: null,
        bookingLinkSource: null,
        tripAttributionScope: 'UNASSIGNED',
        tripAttributionConfidence: 'LOW',
        assignmentStatus: TripAssignmentStatus.UNKNOWN_ASSIGNMENT,
        assignmentSubjectId: null,
        tripBookingCustomerId: null,
        tripAssignedDriverId: null,
        bookingCustomerId: null,
        bookingAssignedDriverId: null,
        staffMovementHint: true,
      }),
    );

    expect(result.attributionType).toBe(DriverAttributionType.STAFF_MOVEMENT);
    expect(result.customerEligibility).toBe(false);
    expect(result.reasons.some((r) => r.includes('Mitarbeiterfahrt'))).toBe(true);
  });

  it('surfaces corporate-without-driver conflict and blocks customer eligibility', () => {
    const result = resolveTripAttribution(
      baseInput({
        bookingCustomerType: CustomerType.CORPORATE,
        tripAssignedDriverId: null,
        tripActualDriverId: null,
        bookingAssignedDriverId: null,
        assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
        assignmentSubjectType: 'BOOKING_CUSTOMER',
        assignmentSubjectId: 'corp-cust',
        tripBookingCustomerId: 'corp-cust',
        bookingCustomerId: 'corp-cust',
        tripAttributionScope: 'BOOKING_ASSIGNED',
      }),
    );

    expect(result.customerEligibility).toBe(false);
    expect(result.conflicts.some((c) => c.code === 'CORPORATE_WITHOUT_DRIVER')).toBe(true);
  });

  it('falls back to vehicle-only then unknown', () => {
    const vehicleOnly = resolveTripAttribution(
      baseInput({
        assignedBookingId: null,
        bookingLinkSource: null,
        tripAttributionScope: 'UNASSIGNED',
        tripAttributionConfidence: 'LOW',
        assignmentStatus: TripAssignmentStatus.UNKNOWN_ASSIGNMENT,
        assignmentSubjectId: null,
        tripBookingCustomerId: null,
        tripAssignedDriverId: null,
        bookingCustomerId: null,
        bookingAssignedDriverId: null,
      }),
    );
    expect(vehicleOnly.attributionType).toBe(DriverAttributionType.VEHICLE_ONLY);

    const unknown = resolveTripAttribution(
      baseInput({
        assignedBookingId: null,
        bookingLinkSource: null,
        tripAttributionScope: 'BOOKING_ASSIGNED',
        tripAttributionConfidence: 'LOW',
        assignmentStatus: TripAssignmentStatus.UNKNOWN_ASSIGNMENT,
        assignmentSubjectId: null,
        tripBookingCustomerId: null,
        tripAssignedDriverId: null,
        bookingCustomerId: null,
        bookingAssignedDriverId: null,
        isPrivateTrip: false,
      }),
    );
    expect([DriverAttributionType.UNKNOWN, DriverAttributionType.VEHICLE_ONLY]).toContain(
      unknown.attributionType,
    );
  });

  it('detects staff movement vs customer time-window hint conflict', () => {
    const result = resolveTripAttribution(
      baseInput({
        staffMovementHint: true,
        assignedBookingId: null,
        bookingLinkSource: 'TIME_WINDOW',
        tripAttributionScope: 'BOOKING_TIME_WINDOW_MATCH',
        tripAttributionConfidence: 'MEDIUM',
        assignmentStatus: TripAssignmentStatus.UNKNOWN_ASSIGNMENT,
        assignmentSubjectId: null,
        tripAssignedDriverId: null,
        bookingAssignedDriverId: null,
        tripActualDriverId: null,
      }),
    );

    expect(result.attributionType).toBe(DriverAttributionType.STAFF_MOVEMENT);
    expect(result.conflicts.some((c) => c.code === 'STAFF_MOVEMENT_VS_CUSTOMER_HINT')).toBe(true);
  });
});
