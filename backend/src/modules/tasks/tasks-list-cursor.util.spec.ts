import {
  buildTaskListCursorWhere,
  decodeTaskListCursor,
  encodeTaskListCursor,
  encodeTaskListCursorFromRow,
  resolveTaskListLimit,
  resolveTaskListSortVariant,
} from './tasks-list-cursor.util';

describe('tasks-list-cursor.util', () => {
  it('resolveTaskListLimit clamps to defaults', () => {
    expect(resolveTaskListLimit()).toBe(50);
    expect(resolveTaskListLimit(10)).toBe(10);
    expect(resolveTaskListLimit(500)).toBe(100);
    expect(resolveTaskListLimit(0)).toBe(1);
  });

  it('resolveTaskListSortVariant maps buckets', () => {
    expect(resolveTaskListSortVariant('OVERDUE')).toBe('DEFAULT');
    expect(resolveTaskListSortVariant('TODAY')).toBe('TODAY');
    expect(resolveTaskListSortVariant('COMPLETED')).toBe('COMPLETED');
  });

  it('round-trips cursor encode/decode', () => {
    const payload = {
      v: 'DEFAULT' as const,
      id: 'task-1',
      priority: 'HIGH' as const,
      dueDate: '2026-07-21T10:00:00.000Z',
      createdAt: '2026-07-20T08:00:00.000Z',
    };
    const encoded = encodeTaskListCursor(payload);
    expect(decodeTaskListCursor(encoded)).toEqual(payload);
  });

  it('encodeTaskListCursorFromRow produces decodable cursor', () => {
    const encoded = encodeTaskListCursorFromRow(
      {
        id: 'task-2',
        priority: 'CRITICAL',
        dueDate: new Date('2026-07-22T00:00:00.000Z'),
        createdAt: new Date('2026-07-21T00:00:00.000Z'),
        updatedAt: new Date('2026-07-21T01:00:00.000Z'),
      },
      'DEFAULT',
    );
    const decoded = decodeTaskListCursor(encoded);
    expect(decoded.id).toBe('task-2');
    expect(decoded.v).toBe('DEFAULT');
  });

  it('buildTaskListCursorWhere returns OR branch for default variant', () => {
    const where = buildTaskListCursorWhere({
      v: 'DEFAULT',
      id: 'task-3',
      priority: 'HIGH',
      dueDate: '2026-07-21T12:00:00.000Z',
      createdAt: '2026-07-21T08:00:00.000Z',
    });
    expect(where).toHaveProperty('OR');
  });
});
