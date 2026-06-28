import { describe, expect, it } from 'vitest';
import { formatTaskTimelineTitle } from './task-timeline-display.utils';

const members = [{ id: 'u1', name: 'Max Mustermann' }];

describe('task-timeline-display.utils', () => {
  it('formats created events in German', () => {
    expect(
      formatTaskTimelineTitle({
        id: '1',
        type: 'CREATED',
        actorUserId: null,
        oldValue: null,
        newValue: 'OPEN',
        metadata: null,
        createdAt: '2026-06-01T10:00:00.000Z',
      }),
    ).toBe('Aufgabe erstellt: — → Offen');
  });

  it('formats assignment with member name', () => {
    expect(
      formatTaskTimelineTitle(
        {
          id: '2',
          type: 'ASSIGNED',
          actorUserId: 'u1',
          oldValue: null,
          newValue: 'u1',
          metadata: null,
          createdAt: '2026-06-01T11:00:00.000Z',
        },
        members,
      ),
    ).toBe('Zugewiesen: Max Mustermann');
  });

  it('formats comment added without raw codes', () => {
    expect(
      formatTaskTimelineTitle({
        id: '3',
        type: 'COMMENT_ADDED',
        actorUserId: 'u1',
        oldValue: null,
        newValue: null,
        metadata: null,
        createdAt: '2026-06-01T12:00:00.000Z',
      }),
    ).toBe('Notiz hinzugefügt');
  });
});
