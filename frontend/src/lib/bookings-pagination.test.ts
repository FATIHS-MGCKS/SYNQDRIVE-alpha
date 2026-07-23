import { describe, expect, it, vi } from 'vitest';
import { statusFilterToApiStatuses } from '../rental/components/bookings/bookingQueryMappers';
import { fetchAllBookingsInRange, unwrapBookingListPage } from './bookings-pagination';
import { api } from './api';

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

  it('fetchAllBookingsInRange aborts between pages when signal is aborted', async () => {
    const listSpy = vi.spyOn(api.bookings, 'list').mockResolvedValue({
      data: [{ id: 'b1' }],
      meta: {
        total: 200,
        page: 1,
        limit: 100,
        totalPages: 2,
        hasNextPage: true,
        nextCursor: null,
      },
    });

    const controller = new AbortController();
    const promise = fetchAllBookingsInRange(
      'org-1',
      { from: '2026-07-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z', limit: 100 },
      { signal: controller.signal },
    );

    await Promise.resolve();
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(listSpy).toHaveBeenCalledTimes(1);
    listSpy.mockRestore();
  });
});
