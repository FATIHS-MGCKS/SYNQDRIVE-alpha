import {
  mapBookingDetailToVoiceRead,
  mapBookingListRowToVoiceRead,
} from './voice-booking-read.mapper';

describe('voice-booking-read.mapper — Voice MCP parity', () => {
  const listRow = {
    id: 'b1',
    vehicleId: 'v1',
    status: 'Confirmed',
    statusEnum: 'CONFIRMED',
    customerName: 'Ada Lovelace',
    vehicleName: 'Golf',
    vehicleLicense: 'B-XY 1',
    pickupStationName: null,
    returnStationName: 'Hamburg',
    station: 'Berlin',
    startDate: '2026-04-01T10:00:00.000Z',
    endDate: '2026-04-07T10:00:00.000Z',
  };

  it('uses pickupStationName with station fallback', () => {
    const read = mapBookingListRowToVoiceRead(listRow);
    expect(read.pickupStationName).toBe('Berlin');
    expect(read.station).toBe('Berlin');
    expect(read.returnStationName).toBe('Hamburg');
    expect(read.statusEnum).toBe('CONFIRMED');
    expect(read.startDate).toBe('2026-04-01T10:00:00.000Z');
  });

  it('maps detail customerId and preserves vehicleId', () => {
    const read = mapBookingDetailToVoiceRead({ ...listRow, customerId: 'c1' });
    expect(read.customerId).toBe('c1');
    expect(read.vehicleId).toBe('v1');
  });

  it('prefers explicit pickupStationName over station alias', () => {
    const read = mapBookingListRowToVoiceRead({
      ...listRow,
      pickupStationName: 'Munich',
      station: 'Berlin',
    });
    expect(read.pickupStationName).toBe('Munich');
    expect(read.station).toBe('Munich');
  });
});