import { VoiceBookingReadAdapter } from './voice-booking-read.adapter';
import type { BookingsService } from '../bookings.service';

describe('VoiceBookingReadAdapter', () => {
  const findAll = jest.fn();
  const findById = jest.fn();
  const bookingsService = { findAll, findById } as unknown as BookingsService;
  const adapter = new VoiceBookingReadAdapter(bookingsService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('searchBookings forwards organizationId and query', async () => {
    findAll.mockResolvedValue({
      data: [
        {
          id: 'b1',
          vehicleId: 'v1',
          status: 'Confirmed',
          statusEnum: 'CONFIRMED',
          customerName: 'Ada',
          vehicleName: 'Golf',
          vehicleLicense: 'B-XY 1',
          pickupStationName: 'Berlin',
          returnStationName: null,
          station: 'Berlin',
          startDate: '2026-01-01',
          endDate: '2026-01-05',
        },
      ],
      total: 1,
    });

    const result = await adapter.searchBookings('org-a', {
      search: 'B-XY',
      page: 1,
      limit: 5,
    });

    expect(findAll).toHaveBeenCalledWith('org-a', {
      search: 'B-XY',
      page: 1,
      limit: 5,
    });
    expect(result.data[0].vehicleLicense).toBe('B-XY 1');
    expect(result.data[0].station).toBe('Berlin');
  });

  it('getBookingById returns null when findById returns null', async () => {
    findById.mockResolvedValue(null);
    await expect(adapter.getBookingById('org-a', 'foreign')).resolves.toBeNull();
    expect(findById).toHaveBeenCalledWith('org-a', 'foreign');
  });

  it('getBookingById maps customerId for write-tool resolution', async () => {
    findById.mockResolvedValue({
      id: 'b1',
      vehicleId: 'v1',
      customerId: 'c1',
      status: 'Active',
      statusEnum: 'ACTIVE',
      customerName: 'Ada',
      vehicleName: 'Golf',
      vehicleLicense: 'B-XY 1',
      pickupStationName: 'Berlin',
      returnStationName: 'Hamburg',
      station: 'Berlin',
      startDate: '2026-01-01',
      endDate: '2026-01-05',
    });

    const read = await adapter.getBookingById('org-a', 'b1');
    expect(read?.customerId).toBe('c1');
    expect(read?.returnStationName).toBe('Hamburg');
  });
});