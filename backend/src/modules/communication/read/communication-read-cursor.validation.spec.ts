import { BadRequestException } from '@nestjs/common';
import {
  decodeCommunicationInboxCursor,
  encodeCommunicationInboxCursor,
} from './communication-read.cursor.util';
import { COMMUNICATION_CURSOR_MAX_LENGTH } from './communication-read-cursor.validation';

const VALID_UUID = '11111111-1111-4111-8111-111111111111';
const VALID_TS = '2026-08-21T12:00:00.000Z';

describe('communication-read cursor hardening', () => {
  it('rejects oversized cursor', () => {
    expect(() => decodeCommunicationInboxCursor('x'.repeat(COMMUNICATION_CURSOR_MAX_LENGTH + 1))).toThrow(
      BadRequestException,
    );
  });

  it('rejects invalid UUID in cursor payload', () => {
    const cursor = encodeCommunicationInboxCursor({
      v: 'inbox-v1',
      id: 'not-a-uuid',
      lastActivityAt: VALID_TS,
    });
    expect(() => decodeCommunicationInboxCursor(cursor)).toThrow(BadRequestException);
  });

  it('rejects non-strict ISO timestamp', () => {
    const cursor = encodeCommunicationInboxCursor({
      v: 'inbox-v1',
      id: VALID_UUID,
      lastActivityAt: '2026-08-21T12:00:00Z',
    });
    expect(() => decodeCommunicationInboxCursor(cursor)).toThrow(BadRequestException);
  });

  it('accepts valid cursor', () => {
    const cursor = encodeCommunicationInboxCursor({
      v: 'inbox-v1',
      id: VALID_UUID,
      lastActivityAt: VALID_TS,
    });
    expect(decodeCommunicationInboxCursor(cursor).id).toBe(VALID_UUID);
  });
});
