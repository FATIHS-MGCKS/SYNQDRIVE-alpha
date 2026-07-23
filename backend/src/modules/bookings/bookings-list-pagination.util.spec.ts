import {
  buildBookingListCursorWhere,
  buildBookingListOrderBy,
  buildBookingListPageResult,
  buildBookingRangeOverlapWhere,
  decodeBookingListCursor,
  encodeBookingListCursor,
  encodeBookingListCursorFromRow,
  parseBookingStatusFilter,
  parseVehicleIdsFilter,
  resolveBookingListLimit,
} from './bookings-list-pagination.util';

describe('bookings-list-pagination.util', () => {
  it('resolves limit within bounds', () => {
    expect(resolveBookingListLimit()).toBe(50);
    expect(resolveBookingListLimit(10)).toBe(10);
    expect(resolveBookingListLimit(999)).toBe(200);
    expect(resolveBookingListLimit(0)).toBe(1);
  });

  it('parses status and vehicle id filters', () => {
    expect(parseBookingStatusFilter('CONFIRMED,active')).toEqual(['CONFIRMED', 'ACTIVE']);
    expect(parseVehicleIdsFilter('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('builds half-open range overlap clauses', () => {
    const from = new Date('2026-07-01T00:00:00.000Z');
    const to = new Date('2026-08-01T00:00:00.000Z');
    expect(buildBookingRangeOverlapWhere(from, to)).toEqual([
      { startDate: { lt: to } },
      { endDate: { gte: from } },
    ]);
  });

  it('uses stable sort order with id tie-breaker', () => {
    expect(buildBookingListOrderBy('startDate', 'desc')).toEqual([
      { startDate: 'desc' },
      { id: 'asc' },
    ]);
  });

  it('encodes and decodes cursor payloads', () => {
    const row = {
      id: 'booking-1',
      startDate: new Date('2026-07-10T10:00:00.000Z'),
      endDate: new Date('2026-07-12T10:00:00.000Z'),
      createdAt: new Date('2026-07-01T08:00:00.000Z'),
    };
    const cursor = encodeBookingListCursorFromRow(row, 'startDate', 'desc');
    const payload = decodeBookingListCursor(cursor);
    expect(payload.id).toBe('booking-1');
    expect(payload.sort).toBe('startDate');
    expect(payload.order).toBe('desc');
    expect(buildBookingListCursorWhere(payload)).toBeDefined();
  });

  it('builds page meta with hasNextPage and nextCursor', () => {
    const page = buildBookingListPageResult(['a'], 120, 1, 50, 'cursor-1');
    expect(page.meta.total).toBe(120);
    expect(page.meta.totalPages).toBe(3);
    expect(page.meta.hasNextPage).toBe(true);
    expect(page.meta.nextCursor).toBe('cursor-1');

    const last = buildBookingListPageResult(['a'], 1, 1, 50, 'cursor-1');
    expect(last.meta.hasNextPage).toBe(false);
    expect(last.meta.nextCursor).toBeNull();
  });

  it('rejects invalid cursor payloads', () => {
    expect(() => decodeBookingListCursor('not-valid')).toThrow();
    expect(() => decodeBookingListCursor(encodeBookingListCursor({ sort: 'startDate', order: 'desc', id: '' }))).not.toThrow();
  });
});
