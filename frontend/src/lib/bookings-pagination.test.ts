import { describe, expect, it } from 'vitest';
import { statusFilterToApiStatuses } from '../rental/components/bookings/bookingQueryMappers';
import { unwrapBookingListPage } from './bookings-pagination';

describe('bookings-pagination', () => {
  it('unwraps paginated booking list responses with hasNextPage', () => {
    const page = unwrapBookingListPage({
      data: [{ id: 'b1' }],
      meta: {
        total: 120,
        page: 1,
        limit: 50,
        totalPages: 3,
        hasNextPage: true,
        nextCursor: 'cursor-1',
      },
    });
    expect(page.data).toHaveLength(1);
    expect(page.meta.total).toBe(120);
    expect(page.meta.hasNextPage).toBe(true);
  });

  it('maps planner status filters to API enums', () => {
    expect(statusFilterToApiStatuses('confirmed')).toEqual(['CONFIRMED']);
    expect(statusFilterToApiStatuses('all')).toBeUndefined();
  });
});
