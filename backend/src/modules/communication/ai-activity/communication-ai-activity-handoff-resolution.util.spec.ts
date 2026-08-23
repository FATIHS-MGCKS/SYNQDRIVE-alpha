import { CommunicationEventType } from '@prisma/client';
import { buildHandoffResolutionMap } from './communication-ai-activity-handoff-resolution.util';

describe('communication-ai-activity-handoff-resolution.util', () => {
  const baseTime = new Date('2026-08-23T10:00:00.000Z');

  it('marks older handoff resolved when takeover occurs later', () => {
    const map = buildHandoffResolutionMap(
      [
        {
          id: 'handoff-a',
          conversationId: 'conv-1',
          occurredAt: baseTime,
        },
        {
          id: 'handoff-b',
          conversationId: 'conv-1',
          occurredAt: new Date('2026-08-23T11:00:00.000Z'),
        },
      ],
      [
        {
          id: 'takeover-1',
          conversationId: 'conv-1',
          occurredAt: new Date('2026-08-23T10:30:00.000Z'),
        },
      ],
    );

    expect(map.get('handoff-a')).toBe(true);
    expect(map.get('handoff-b')).toBe(false);
  });

  it('uses id tie-breaker for identical occurredAt timestamps', () => {
    const map = buildHandoffResolutionMap(
      [
        {
          id: 'evt-a',
          conversationId: 'conv-1',
          occurredAt: baseTime,
        },
      ],
      [
        {
          id: 'evt-b',
          conversationId: 'conv-1',
          occurredAt: baseTime,
        },
      ],
    );

    expect(map.get('evt-a')).toBe(true);
  });
});
