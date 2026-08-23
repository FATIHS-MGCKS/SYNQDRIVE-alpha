import { BadRequestException } from '@nestjs/common';
import {
  buildCommunicationAiActivityCursorWhere,
  decodeCommunicationAiActivityCursor,
  encodeCommunicationAiActivityCursor,
} from './communication-ai-activity.cursor.util';
import { COMMUNICATION_AI_ACTIVITY_CURSOR_VERSION } from './communication-ai-activity.constants';

describe('communication-ai-activity.cursor.util', () => {
  it('paginates deterministically with occurredAt + id tie-breaker', () => {
    const occurredAt = '2026-08-23T10:00:00.000Z';
    const cursorA = encodeCommunicationAiActivityCursor({
      v: COMMUNICATION_AI_ACTIVITY_CURSOR_VERSION,
      occurredAt,
      id: '00000000-0000-4000-8000-000000000002',
    });
    const cursorB = encodeCommunicationAiActivityCursor({
      v: COMMUNICATION_AI_ACTIVITY_CURSOR_VERSION,
      occurredAt,
      id: '00000000-0000-4000-8000-000000000001',
    });

    const whereA = buildCommunicationAiActivityCursorWhere(decodeCommunicationAiActivityCursor(cursorA));
    const whereB = buildCommunicationAiActivityCursorWhere(decodeCommunicationAiActivityCursor(cursorB));

    expect(whereA).not.toEqual(whereB);
    expect(whereA.OR?.[1]).toEqual({
      AND: [
        { occurredAt: new Date(occurredAt) },
        { id: { lt: '00000000-0000-4000-8000-000000000002' } },
      ],
    });
  });

  it('rejects malformed cursor payloads', () => {
    expect(() => decodeCommunicationAiActivityCursor('not-a-cursor')).toThrow(BadRequestException);
  });
});
