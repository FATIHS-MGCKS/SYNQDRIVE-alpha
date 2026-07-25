import {
  buildCursorFilter,
  buildListOrderBy,
  encodeListCursor,
  normalizeSortField,
  type CursorRow,
} from './data-authorization-list-cursor.util';

function row(overrides: Partial<CursorRow> = {}): CursorRow {
  return {
    id: 'auth-2',
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    updatedAt: new Date('2026-07-20T08:30:00.000Z'),
    title: 'DIMO Telemetry Authorization',
    expiresAt: null,
    status: 'ACTIVE',
    isSystemGenerated: false,
    ...overrides,
  };
}

describe('normalizeSortField', () => {
  it.each(['createdAt', 'updatedAt', 'title', 'expiresAt', 'status'])(
    'keeps supported field %s',
    (field) => {
      expect(normalizeSortField(field)).toBe(field);
    },
  );

  it.each([undefined, '', 'nextReviewDate', 'DROP TABLE'])(
    'falls back to createdAt for %s',
    (field) => {
      expect(normalizeSortField(field)).toBe('createdAt');
    },
  );
});

describe('buildListOrderBy', () => {
  it('pins system-generated authorizations on top when sorting by createdAt', () => {
    expect(buildListOrderBy('createdAt', 'desc')).toEqual([
      { isSystemGenerated: 'desc' },
      { createdAt: 'desc' },
      { id: 'asc' },
    ]);
  });

  it('orders by the requested column with a stable id tie-breaker', () => {
    expect(buildListOrderBy('updatedAt', 'desc')).toEqual([
      { updatedAt: 'desc' },
      { id: 'asc' },
    ]);
    expect(buildListOrderBy('title', 'asc')).toEqual([{ title: 'asc' }, { id: 'asc' }]);
    expect(buildListOrderBy('status', 'desc')).toEqual([{ status: 'desc' }, { id: 'asc' }]);
  });
});

describe('buildCursorFilter', () => {
  it('pages forward on the sorted column for updatedAt', () => {
    const cursor = encodeListCursor(row(), 'updatedAt', 'desc');

    expect(buildCursorFilter(cursor, 'updatedAt', 'desc')).toEqual({
      OR: [
        { updatedAt: { lt: new Date('2026-07-20T08:30:00.000Z') } },
        { updatedAt: new Date('2026-07-20T08:30:00.000Z'), id: { gt: 'auth-2' } },
      ],
    });
  });

  it('inverts the comparison for ascending order', () => {
    const cursor = encodeListCursor(row(), 'title', 'asc');

    expect(buildCursorFilter(cursor, 'title', 'asc')).toEqual({
      OR: [
        { title: { gt: 'DIMO Telemetry Authorization' } },
        { title: 'DIMO Telemetry Authorization', id: { gt: 'auth-2' } },
      ],
    });
  });

  it('steps over the leading isSystemGenerated key when sorting by createdAt', () => {
    const cursor = encodeListCursor(
      row({ isSystemGenerated: true }),
      'createdAt',
      'desc',
    );

    expect(buildCursorFilter(cursor, 'createdAt', 'desc')).toEqual({
      OR: [
        { isSystemGenerated: false },
        {
          isSystemGenerated: true,
          createdAt: { lt: new Date('2026-07-01T10:00:00.000Z') },
        },
        {
          isSystemGenerated: true,
          createdAt: new Date('2026-07-01T10:00:00.000Z'),
          id: { gt: 'auth-2' },
        },
      ],
    });
  });

  it('does not re-admit system rows once the cursor sits on a non-system row', () => {
    const cursor = encodeListCursor(
      row({ isSystemGenerated: false }),
      'createdAt',
      'desc',
    );
    const filter = buildCursorFilter(cursor, 'createdAt', 'desc') as {
      OR: Array<Record<string, unknown>>;
    };

    expect(filter.OR).toHaveLength(2);
    expect(filter.OR.every((clause) => clause.isSystemGenerated === false)).toBe(true);
  });

  it('rejects a cursor issued for a different sort or direction', () => {
    const cursor = encodeListCursor(row(), 'updatedAt', 'desc');

    expect(buildCursorFilter(cursor, 'createdAt', 'desc')).toBeNull();
    expect(buildCursorFilter(cursor, 'updatedAt', 'asc')).toBeNull();
  });

  it('rejects malformed cursors instead of throwing', () => {
    expect(buildCursorFilter('not-base64url-json', 'createdAt', 'desc')).toBeNull();
    expect(
      buildCursorFilter(Buffer.from('{}', 'utf8').toString('base64url'), 'createdAt', 'desc'),
    ).toBeNull();
  });

  it('still honours legacy v1 cursors that only carried id and createdAt', () => {
    const legacy = Buffer.from(
      JSON.stringify({ id: 'auth-2', createdAt: '2026-07-01T10:00:00.000Z' }),
      'utf8',
    ).toString('base64url');

    expect(buildCursorFilter(legacy, 'createdAt', 'desc')).toEqual({
      OR: [
        { createdAt: { lt: new Date('2026-07-01T10:00:00.000Z') } },
        { createdAt: new Date('2026-07-01T10:00:00.000Z'), id: { gt: 'auth-2' } },
      ],
    });
  });

  it('falls back to the id tie-breaker when a nullable sort column is null', () => {
    const cursor = encodeListCursor(row({ expiresAt: null }), 'expiresAt', 'desc');

    expect(buildCursorFilter(cursor, 'expiresAt', 'desc')).toEqual({
      id: { gt: 'auth-2' },
    });
  });
});
