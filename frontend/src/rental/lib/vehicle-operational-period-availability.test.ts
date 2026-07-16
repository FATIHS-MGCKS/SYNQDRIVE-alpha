import { describe, expect, it } from 'vitest';
import { findOverlappingBookingIds } from './vehicle-booking-risk.utils';
import type { VehicleAgendaBooking } from './vehicle-booking-agenda.utils';
import { VEHICLE_OPERATIONAL_STATUS } from './vehicle-operational-state';
import { resolveFleetCommandTabForVehicle } from './fleet-command-filters';
import type { VehicleData } from '../data/vehicles';

function agendaRow(
  id: string,
  status: VehicleAgendaBooking['status'],
  start: string,
  end: string,
): VehicleAgendaBooking {
  return {
    id,
    customerName: 'Kunde',
    status,
    startDate: new Date(start),
    endDate: new Date(end),
    pickupLocation: 'Kassel',
    returnLocation: 'Kassel',
    totalPriceCents: null,
    days: 3,
    hasPickup: false,
    hasReturn: false,
    isOverdue: false,
    needsPickup: false,
    needsReturn: false,
  };
}

describe('Vehicle Operational State V2 — period availability vs operational status', () => {
  it('vehicle currently Available still blocks overlapping future CONFIRMED window', () => {
    const vehicle = {
      id: 'veh-1',
      status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
      operationalState: {
        status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
        reason: null,
        source: null,
        effectiveFrom: null,
        effectiveUntil: null,
        derivedAt: null,
        dataQualityState: 'RELIABLE',
        dataQualityReasons: [],
        isReliable: true,
      },
      bookingContext: {
        activeBooking: null,
        reservedBooking: null,
        nextBooking: {
          bookingId: 'bk-future',
          customerName: 'Future',
          pickupAt: '2026-08-01T08:00:00.000Z',
          returnAt: '2026-08-05T08:00:00.000Z',
          pickupStationName: null,
          returnStationName: null,
          isOverdue: false,
        },
        futureBookingCount: 1,
      },
    } as VehicleData;

    expect(resolveFleetCommandTabForVehicle(vehicle)).toBe('Available');

    const bookings = [
      agendaRow('bk-future', 'confirmed', '2026-08-01T08:00:00.000Z', '2026-08-05T08:00:00.000Z'),
    ];
    const proposedStart = new Date('2026-08-02T08:00:00.000Z');
    const proposedEnd = new Date('2026-08-04T08:00:00.000Z');

    const overlaps = findOverlappingBookingIds(
      [
        ...bookings,
        agendaRow('proposed', 'pending', proposedStart.toISOString(), proposedEnd.toISOString()),
      ],
    );
    expect(overlaps.has('bk-future')).toBe(true);
    expect(overlaps.has('proposed')).toBe(true);
  });

  it('non-overlapping future period remains bookable while vehicle shows Available', () => {
    const bookings = [
      agendaRow('bk-future', 'confirmed', '2026-08-01T08:00:00.000Z', '2026-08-05T08:00:00.000Z'),
      agendaRow('proposed', 'pending', '2026-08-20T08:00:00.000Z', '2026-08-22T08:00:00.000Z'),
    ];
    const overlaps = findOverlappingBookingIds(bookings);
    expect(overlaps.size).toBe(0);
  });
});
