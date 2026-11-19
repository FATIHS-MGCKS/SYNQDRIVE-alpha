import { CommunicationBookingSnapshotReadAdapter } from './communication-booking-snapshot-read.adapter';
import type { BookingsService } from '../bookings.service';

describe('CommunicationBookingSnapshotReadAdapter', () => {
  const findDetail = jest.fn();
  const bookingsService = { findDetail } as unknown as BookingsService;
  const adapter = new CommunicationBookingSnapshotReadAdapter(bookingsService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates to BookingsService.findDetail with org and booking id', async () => {
    findDetail.mockResolvedValue({
      core: { bookingNumber: 'B-42' },
      finance: { depositStatus: 'REQUESTED', paymentStatus: 'OPEN' },
    });

    const snapshot = await adapter.getSnapshot('org-a', 'book-1');

    expect(findDetail).toHaveBeenCalledWith('org-a', 'book-1');
    expect(snapshot).toEqual({
      bookingNumber: 'B-42',
      depositStatus: 'REQUESTED',
      paymentStatus: 'OPEN',
    });
  });

  it('returns null when findDetail returns null (missing or foreign org)', async () => {
    findDetail.mockResolvedValue(null);

    expect(await adapter.getSnapshot('org-a', 'book-foreign')).toBeNull();
  });

  it('maps nullable finance fields', async () => {
    findDetail.mockResolvedValue({
      core: { bookingNumber: 'B-9' },
      finance: { depositStatus: null, paymentStatus: null },
    });

    const snapshot = await adapter.getSnapshot('org-a', 'book-9');
    expect(snapshot?.depositStatus).toBeNull();
    expect(snapshot?.paymentStatus).toBeNull();
  });
});