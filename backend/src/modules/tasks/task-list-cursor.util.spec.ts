import { BadRequestException } from '@nestjs/common';
import {
  buildTaskListCursorWhere,
  decodeTaskListCursor,
  encodeTaskListCursor,
  encodeTaskListCursorFromTask,
  resolveTaskListLimit,
  resolveTaskListSortVariant,
  taskListSortSpecs,
} from './task-list-cursor.util';

describe('task-list-cursor.util', () => {
  it('caps requested limit to the safe maximum', () => {
    expect(resolveTaskListLimit()).toBe(50);
    expect(resolveTaskListLimit(10)).toBe(10);
    expect(resolveTaskListLimit(250)).toBe(100);
    expect(resolveTaskListLimit(0)).toBe(1);
  });

  it('round-trips cursor payloads with stable sort variant', () => {
    const encoded = encodeTaskListCursor({
      v: 'OVERDUE',
      id: 'task-2',
      priority: 'HIGH',
      dueDate: '2026-07-10T08:00:00.000Z',
      createdAt: '2026-07-01T08:00:00.000Z',
    });

    const decoded = decodeTaskListCursor(encoded);
    expect(decoded).toMatchObject({
      v: 'OVERDUE',
      id: 'task-2',
      priority: 'HIGH',
    });
  });

  it('rejects invalid cursors', () => {
    expect(() => decodeTaskListCursor('not-a-cursor')).toThrow(BadRequestException);
  });

  it('rejects cursor/sort variant mismatches', () => {
    const cursor = encodeTaskListCursor({
      v: 'TODAY',
      id: 'task-1',
      priority: 'NORMAL',
      dueDate: null,
      createdAt: '2026-07-01T08:00:00.000Z',
    });

    expect(() =>
      buildTaskListCursorWhere(decodeTaskListCursor(cursor), resolveTaskListSortVariant('OVERDUE')),
    ).toThrow(BadRequestException);
  });

  it('builds a lexicographic cursor where clause with id tie-breaker', () => {
    const cursor = encodeTaskListCursorFromTask(
      {
        id: 'task-9',
        priority: 'HIGH',
        dueDate: new Date('2026-07-10T08:00:00.000Z'),
        createdAt: new Date('2026-07-01T08:00:00.000Z'),
      },
      'DEFAULT',
    );

    const where = buildTaskListCursorWhere(decodeTaskListCursor(cursor), 'DEFAULT');
    expect(where).toEqual(
      expect.objectContaining({
        OR: expect.any(Array),
      }),
    );
    expect(taskListSortSpecs('DEFAULT').at(-1)).toEqual({ field: 'id', direction: 'asc' });
  });
});
