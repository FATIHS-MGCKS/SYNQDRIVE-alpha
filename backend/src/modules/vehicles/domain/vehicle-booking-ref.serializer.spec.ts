import { toDomainBookingRef, serializeFleetBookingRef } from './vehicle-booking-ref.serializer';
import {
  EMPTY_HANDOVER_SIGNALS,
  NEUTRAL_BOOKING_DISPLAY_LABEL,
  type VehicleBookingQueryRow,
} from './vehicle-booking-context.types';

function row(
  overrides: Partial<VehicleBookingQueryRow> & { id: string },
): VehicleBookingQueryRow {
  return {
    vehicleId: 'vehicle-a',
    organizationId: 'org-a',
    status: 'CONFIRMED',
    startDate: new Date('2026-08-01T08:00:00.000Z'),
    endDate: new Date('2026-08-06T18:00:00.000Z'),
    kmIncluded: null,
    kmDriven: null,
    pickupStationId: null,
    returnStationId: null,
    notes: null,
    customerLabel: 'Jane Doe · ACME',
    pickupStationName: null,
    returnStationName: null,
    handover: { ...EMPTY_HANDOVER_SIGNALS },
    ...overrides,
  };
}

describe('vehicle-booking-ref.serializer', () => {
  it('uses persisted displayRef when provided', () => {
    const ref = toDomainBookingRef(
      row({ id: 'booking-abc123def456', displayRef: 'BK-000142' }),
      'future',
      new Date('2026-07-15T12:00:00.000Z'),
    );

    expect(ref.bookingNumber).toBe('BK-000142');
    expect(ref.bookingNumberDiagnostic).toBeNull();
    expect(ref.bookingNumber).not.toContain('booking-abc');
  });

  it('falls back to neutral label with diagnostic when displayRef missing', () => {
    const ref = toDomainBookingRef(
      row({ id: 'b-future-1' }),
      'future',
      new Date('2026-07-15T12:00:00.000Z'),
    );

    expect(ref.bookingNumber).toBe(NEUTRAL_BOOKING_DISPLAY_LABEL);
    expect(ref.bookingNumberDiagnostic).toBe('MISSING_DISPLAY_REF');
    expect(ref.bookingNumber).not.toMatch(/def456/i);
  });

  it('serializes planned pickup/return instants for future phase', () => {
    const ref = toDomainBookingRef(
      row({ id: 'b-future-1', displayRef: 'BK-000201' }),
      'future',
      new Date('2026-07-15T12:00:00.000Z'),
    );

    expect(ref.pickupAt).toBe('2026-08-01T08:00:00.000Z');
    expect(ref.returnAt).toBe('2026-08-06T18:00:00.000Z');
    expect(ref.phase).toBe('future');
  });

  it('projects compact fleet DTO with required fields', () => {
    const dto = serializeFleetBookingRef(
      toDomainBookingRef(
        row({ id: 'b-serialize-99', displayRef: 'BK-000099' }),
        'future',
        new Date('2026-07-15T12:00:00.000Z'),
      ),
    );

    expect(dto).toMatchObject({
      id: 'b-serialize-99',
      bookingNumber: 'BK-000099',
      status: 'CONFIRMED',
      pickupAt: '2026-08-01T08:00:00.000Z',
      returnAt: '2026-08-06T18:00:00.000Z',
      customerLabel: 'Jane Doe · ACME',
      vehicleId: 'vehicle-a',
      phase: 'future',
    });
  });
});
