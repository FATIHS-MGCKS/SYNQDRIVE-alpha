import { VehicleStatus } from '@prisma/client';
import {
  appendRepairNote,
  buildRepairAuditNote,
  canActivateBookingAfterPickup,
  canClearStaleRentedAfterReturn,
  canClearStaleReserved,
  canCompleteBookingAfterReturn,
} from './vehicle-booking-handover-repair.util';

const NOW = new Date('2026-06-24T10:00:00.000Z');

function vehicle(status: VehicleStatus = VehicleStatus.RESERVED) {
  return {
    id: 'veh-1',
    organizationId: 'org-1',
    licensePlate: 'KS-FS 123',
    status,
  };
}

function booking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bk-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    status: 'CONFIRMED',
    startDate: new Date('2026-06-20T08:00:00.000Z'),
    endDate: new Date('2026-06-26T08:00:00.000Z'),
    completedAt: null as Date | null,
    notes: null as string | null,
    ...overrides,
  };
}

describe('vehicle-booking-handover-repair.util', () => {
  it('canClearStaleReserved allows RESERVED without window', () => {
    expect(canClearStaleReserved(vehicle(), [], NOW)).toEqual({ ok: true });
  });

  it('canClearStaleReserved rejects when ACTIVE booking exists', () => {
    const result = canClearStaleReserved(
      vehicle(),
      [booking({ status: 'ACTIVE' })],
      NOW,
    );
    expect(result.ok).toBe(false);
  });

  it('canClearStaleRentedAfterReturn requires completed return case', () => {
    const handoversByBooking = new Map([
      [
        'bk-1',
        [
          {
            id: 'hp-1',
            organizationId: 'org-1',
            bookingId: 'bk-1',
            vehicleId: 'veh-1',
            kind: 'PICKUP' as const,
            performedAt: NOW,
            odometerKm: 1000,
          },
          {
            id: 'hp-2',
            organizationId: 'org-1',
            bookingId: 'bk-1',
            vehicleId: 'veh-1',
            kind: 'RETURN' as const,
            performedAt: NOW,
            odometerKm: 1200,
          },
        ],
      ],
    ]);

    const result = canClearStaleRentedAfterReturn(
      vehicle(VehicleStatus.RENTED),
      [booking({ status: 'COMPLETED', completedAt: NOW })],
      handoversByBooking,
    );
    expect(result).toEqual({ ok: true, bookingId: 'bk-1' });
  });

  it('canCompleteBookingAfterReturn requires pickup and return protocols', () => {
    const handovers = [
      {
        id: 'hp-1',
        organizationId: 'org-1',
        bookingId: 'bk-1',
        vehicleId: 'veh-1',
        kind: 'PICKUP' as const,
        performedAt: NOW,
        odometerKm: 1000,
      },
      {
        id: 'hp-2',
        organizationId: 'org-1',
        bookingId: 'bk-1',
        vehicleId: 'veh-1',
        kind: 'RETURN' as const,
        performedAt: NOW,
        odometerKm: 1200,
      },
    ];
    expect(canCompleteBookingAfterReturn(booking({ status: 'ACTIVE' }), handovers).ok).toBe(true);
  });

  it('canActivateBookingAfterPickup only accepts CONFIRMED with pickup only', () => {
    const handovers = [
      {
        id: 'hp-1',
        organizationId: 'org-1',
        bookingId: 'bk-1',
        vehicleId: 'veh-1',
        kind: 'PICKUP' as const,
        performedAt: NOW,
        odometerKm: 1000,
      },
    ];
    expect(canActivateBookingAfterPickup(booking({ status: 'CONFIRMED' }), handovers).ok).toBe(true);
    expect(canActivateBookingAfterPickup(booking({ status: 'PENDING' }), handovers).ok).toBe(false);
  });

  it('appendRepairNote preserves existing notes', () => {
    const note = buildRepairAuditNote('test_rule', { a: 1 }, { a: 2 });
    expect(appendRepairNote('existing', note)).toContain('existing');
    expect(appendRepairNote('existing', note)).toContain('VBH-REPAIR');
  });
});
