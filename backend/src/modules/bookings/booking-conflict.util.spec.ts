import { assertValidBookingWindow, buildOverlapWhere } from './booking-conflict.util';

describe('booking-conflict.util', () => {
  it('rejects end before start', () => {
    expect(() =>
      assertValidBookingWindow(new Date('2026-06-10'), new Date('2026-06-09')),
    ).toThrow('END_BEFORE_START');
  });

  it('buildOverlapWhere excludes booking id on update', () => {
    const where = buildOverlapWhere({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      startDate: new Date('2026-06-10'),
      endDate: new Date('2026-06-12'),
      excludeBookingId: 'book-self',
    });
    expect(where.id).toEqual({ not: 'book-self' });
    expect(where.vehicleId).toBe('veh-1');
  });

  it('buildOverlapWhere scopes org, vehicle and blocking statuses only', () => {
    const where = buildOverlapWhere({
      organizationId: 'org-42',
      vehicleId: 'veh-9',
      startDate: new Date('2026-06-01'),
      endDate: new Date('2026-06-05'),
    });
    expect(where.organizationId).toBe('org-42');
    expect(where.status).toEqual({ in: ['PENDING', 'CONFIRMED', 'ACTIVE'] });
    expect(where.startDate).toEqual({ lt: new Date('2026-06-05') });
    expect(where.endDate).toEqual({ gt: new Date('2026-06-01') });
    expect(where.id).toBeUndefined();
  });

  it('accepts valid booking window', () => {
    expect(() =>
      assertValidBookingWindow(new Date('2026-06-10'), new Date('2026-06-11')),
    ).not.toThrow();
  });
});
