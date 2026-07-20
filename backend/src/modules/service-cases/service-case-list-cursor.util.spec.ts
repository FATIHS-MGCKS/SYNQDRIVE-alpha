import { BadRequestException } from '@nestjs/common';
import {
  buildServiceCaseListCursorWhere,
  decodeServiceCaseListCursor,
  encodeServiceCaseListCursor,
  encodeServiceCaseListCursorFromRow,
  resolveServiceCaseListLimit,
  serviceCaseListSortSpecs,
} from './service-case-list-cursor.util';

describe('service-case-list-cursor.util', () => {
  it('caps requested limit to the safe maximum', () => {
    expect(resolveServiceCaseListLimit()).toBe(50);
    expect(resolveServiceCaseListLimit(10)).toBe(10);
    expect(resolveServiceCaseListLimit(250)).toBe(100);
    expect(resolveServiceCaseListLimit(0)).toBe(1);
  });

  it('round-trips cursor payloads', () => {
    const encoded = encodeServiceCaseListCursor({
      v: 'DEFAULT',
      id: 'sc-2',
      status: 'OPEN',
      openedAt: '2026-07-10T08:00:00.000Z',
    });

    const decoded = decodeServiceCaseListCursor(encoded);
    expect(decoded).toMatchObject({
      v: 'DEFAULT',
      id: 'sc-2',
      status: 'OPEN',
    });
  });

  it('rejects invalid cursors', () => {
    expect(() => decodeServiceCaseListCursor('not-a-cursor')).toThrow(BadRequestException);
  });

  it('rejects cursor/sort variant mismatches', () => {
    const cursor = encodeServiceCaseListCursor({
      v: 'OTHER' as 'DEFAULT',
      id: 'sc-1',
      status: 'OPEN',
      openedAt: '2026-07-01T08:00:00.000Z',
    });

    expect(() => buildServiceCaseListCursorWhere(decodeServiceCaseListCursor(cursor))).toThrow(
      BadRequestException,
    );
  });

  it('builds a lexicographic cursor where clause with id tie-breaker', () => {
    const cursor = encodeServiceCaseListCursorFromRow({
      id: 'sc-9',
      status: 'IN_PROGRESS',
      openedAt: new Date('2026-07-10T08:00:00.000Z'),
    });

    const where = buildServiceCaseListCursorWhere(decodeServiceCaseListCursor(cursor));
    expect(where).toEqual(
      expect.objectContaining({
        OR: expect.any(Array),
      }),
    );
    expect(serviceCaseListSortSpecs().at(-1)).toEqual({ field: 'id', direction: 'asc' });
  });
});
