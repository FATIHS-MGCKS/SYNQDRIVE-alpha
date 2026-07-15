import { toDomainBookingRef, serializeFleetBookingRef } from './vehicle-booking-ref.serializer';
import {
  EMPTY_HANDOVER_SIGNALS,
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
  it('uses BK display number, not raw UUID', () => {
    const ref = toDomainBookingRef(
      row({ id: 'booking-abc123def456' }),
      'future',
      new Date('2026-07-15T12:00:00.000Z'),
    );

    expect(ref.bookingNumber).toBe('BK-DEF456');
    expect(ref.bookingNumber).not.toContain('booking-abc');
  });

  it('serializes planned pickup/return instants for future phase', () => {
    const ref = toDomainBookingRef(
      row({ id: 'b-future-1' }),
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
        row({ id: 'b-serialize-99' }),
        'future',
        new Date('2026-07-15T12:00:00.000Z'),
      ),
    );

    expect(dto).toMatchObject({
      id: 'b-serialize-99',
      bookingNumber: 'BK-IZE-99',
      status: 'CONFIRMED',
      pickupAt: '2026-08-01T08:00:00.000Z',
      returnAt: '2026-08-06T18:00:00.000Z',
      customerLabel: 'Jane Doe · ACME',
      vehicleId: 'vehicle-a',
      phase: 'future',
    });
  });
});
