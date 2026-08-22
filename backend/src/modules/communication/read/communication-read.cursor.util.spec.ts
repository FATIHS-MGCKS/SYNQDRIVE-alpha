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

const VALID_UUID = '11111111-1111-4111-8111-111111111111';
const VALID_TS = '2026-08-21T12:00:00.000Z';

describe('communication-read.cursor.util', () => {
  it('encodes and decodes inbox cursor', () => {
    const encoded = encodeCommunicationInboxCursor({
      v: 'inbox-v1',
      id: VALID_UUID,
      lastActivityAt: VALID_TS,
    });
    const decoded = decodeCommunicationInboxCursor(encoded);
    expect(decoded.id).toBe(VALID_UUID);
  });

  it('rejects malformed inbox cursor', () => {
    expect(() => decodeCommunicationInboxCursor('not-valid')).toThrow(BadRequestException);
  });

  it('builds stable inbox keyset predicate', () => {
    const where = buildCommunicationInboxCursorWhere({
      v: 'inbox-v1',
      id: VALID_UUID,
      lastActivityAt: VALID_TS,
    });
    expect(where.OR).toHaveLength(2);
  });

  it('encodes and decodes timeline cursor', () => {
    const encoded = encodeCommunicationTimelineCursor({
      v: 'timeline-v1',
      id: VALID_UUID,
      occurredAt: VALID_TS,
    });
    expect(decodeCommunicationTimelineCursor(encoded).id).toBe(VALID_UUID);
  });

  it('builds timeline keyset predicate', () => {
    const where = buildCommunicationTimelineCursorWhere({
      v: 'timeline-v1',
      id: VALID_UUID,
      occurredAt: VALID_TS,
    });
    expect(where.OR).toHaveLength(2);
  });

  it('enforces max page size', () => {
    expect(resolveCommunicationListLimit(500, { defaultLimit: 25, maxLimit: 100 })).toBe(100);
    expect(resolveCommunicationListLimit(undefined, { defaultLimit: 25, maxLimit: 100 })).toBe(25);
  });
});
