import { BadRequestException } from '@nestjs/common';
import {
  buildCommunicationInboxCursorWhere,
  buildCommunicationTimelineCursorWhere,
  decodeCommunicationInboxCursor,
  decodeCommunicationTimelineCursor,
  encodeCommunicationInboxCursor,
  encodeCommunicationTimelineCursor,
  resolveCommunicationListLimit,
} from './communication-read.cursor.util';

describe('communication-read.cursor.util', () => {
  it('encodes and decodes inbox cursor', () => {
    const encoded = encodeCommunicationInboxCursor({
      v: 'inbox-v1',
      id: 'conv-1',
      lastActivityAt: '2026-08-21T12:00:00.000Z',
    });
    const decoded = decodeCommunicationInboxCursor(encoded);
    expect(decoded.id).toBe('conv-1');
  });

  it('rejects malformed inbox cursor', () => {
    expect(() => decodeCommunicationInboxCursor('not-valid')).toThrow(BadRequestException);
  });

  it('builds stable inbox keyset predicate', () => {
    const where = buildCommunicationInboxCursorWhere({
      v: 'inbox-v1',
      id: 'b',
      lastActivityAt: '2026-08-21T12:00:00.000Z',
    });
    expect(where.OR).toHaveLength(2);
  });

  it('encodes and decodes timeline cursor', () => {
    const encoded = encodeCommunicationTimelineCursor({
      v: 'timeline-v1',
      id: 'evt-1',
      occurredAt: '2026-08-21T12:00:00.000Z',
    });
    expect(decodeCommunicationTimelineCursor(encoded).id).toBe('evt-1');
  });

  it('builds timeline keyset predicate', () => {
    const where = buildCommunicationTimelineCursorWhere({
      v: 'timeline-v1',
      id: 'evt-2',
      occurredAt: '2026-08-21T12:00:00.000Z',
    });
    expect(where.OR).toHaveLength(2);
  });

  it('enforces max page size', () => {
    expect(resolveCommunicationListLimit(500, { defaultLimit: 25, maxLimit: 100 })).toBe(100);
    expect(resolveCommunicationListLimit(undefined, { defaultLimit: 25, maxLimit: 100 })).toBe(25);
  });
});
