import { describe, expect, it } from 'vitest';
import {
  filterOperatorOperationalTodayRows,
  inferTodayHandoverKind,
  mapBookingListRowToTodayRow,
  resolveTodayCustomerName,
  resolveTodayStationLabel,
  resolveTodayVehicleDisplay,
} from './today-booking-contract';

describe('today-booking-contract', () => {
  it('filters terminal booking statuses from operational today lists', () => {
    const rows = filterOperatorOperationalTodayRows([
      { id: '1', status: 'Confirmed', statusEnum: 'CONFIRMED' },
      { id: '2', status: 'Cancelled', statusEnum: 'CANCELLED' },
      { id: '3', status: 'No Show', statusEnum: 'NO_SHOW' },
      { id: '4', status: 'Completed', statusEnum: 'COMPLETED' },
      { id: '5', status: 'Active', statusEnum: 'ACTIVE' },
    ]);
    expect(rows.map((r) => r.id)).toEqual(['1', '5']);
  });

  it('never uses UUID as visible vehicle label', () => {
    const uuid = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';
    expect(
      resolveTodayVehicleDisplay({
        vehicleName: uuid,
        vehicleLicense: 'KS-AB 123',
      }),
    ).toEqual({
      vehicleName: 'KS-AB 123',
      plate: 'KS-AB 123',
    });
  });

  it('drops UUID-like customer names', () => {
    expect(
      resolveTodayCustomerName({
        customerName: 'a1b2c3d4-e5f6-4789-a012-3456789abcde',
      }),
    ).toBe('');
    expect(resolveTodayCustomerName({ customerName: 'Max Mustermann' })).toBe('Max Mustermann');
  });

  it('infers return kind from active booking with pickup protocol', () => {
    expect(
      inferTodayHandoverKind({
        id: 'b1',
        statusEnum: 'ACTIVE',
        startDate: '2026-07-25T08:00:00.000Z',
        endDate: '2026-07-27T08:00:00.000Z',
        pickupProtocol: { id: 'p1' },
      }),
    ).toBe('RETURN');
  });

  it('infers pickup kind for confirmed booking without pickup protocol', () => {
    expect(
      inferTodayHandoverKind({
        id: 'b1',
        statusEnum: 'CONFIRMED',
        startDate: '2026-07-25T18:00:00.000Z',
        endDate: '2026-07-27T08:00:00.000Z',
      }),
    ).toBe('PICKUP');
  });

  it('maps list row to today row with canonical id and statusEnum', () => {
    const row = mapBookingListRowToTodayRow({
      id: 'booking-1',
      vehicleId: 'veh-1',
      vehicleLicense: 'KS-XY 1',
      vehicleName: 'Tesla Model 3',
      customerName: 'Anna Test',
      status: 'Confirmed',
      statusEnum: 'CONFIRMED',
      startDate: '2026-07-25T10:00:00.000Z',
      endDate: '2026-07-26T10:00:00.000Z',
      pickupStationName: 'Kassel',
    });
    expect(row?.id).toBe('booking-1');
    expect(row?.statusEnum).toBe('CONFIRMED');
    expect(resolveTodayStationLabel(row!, 'PICKUP')).toBe('Kassel');
  });
});
