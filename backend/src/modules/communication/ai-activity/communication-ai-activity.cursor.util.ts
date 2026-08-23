import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  assertCommunicationCursorIsoTimestamp,
  assertCommunicationCursorLength,
  assertCommunicationCursorUuid,
} from '../read/communication-read-cursor.validation';
import {
  COMMUNICATION_AI_ACTIVITY_CURSOR_VERSION,
} from './communication-ai-activity.constants';

export interface CommunicationAiActivityCursorPayload {
  v: typeof COMMUNICATION_AI_ACTIVITY_CURSOR_VERSION;
  occurredAt: string;
  id: string;
}

export function encodeCommunicationAiActivityCursor(
  payload: CommunicationAiActivityCursorPayload,
): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCommunicationAiActivityCursor(cursor: string): CommunicationAiActivityCursorPayload {
  assertCommunicationCursorLength(cursor);
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as CommunicationAiActivityCursorPayload;
    if (
      !parsed
      || typeof parsed !== 'object'
      || parsed.v !== COMMUNICATION_AI_ACTIVITY_CURSOR_VERSION
      || typeof parsed.id !== 'string'
      || typeof parsed.occurredAt !== 'string'
    ) {
      throw new Error('invalid ai activity cursor');
    }
    assertCommunicationCursorUuid(parsed.id);
    assertCommunicationCursorIsoTimestamp(parsed.occurredAt);
    return parsed;
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw new BadRequestException({
      message: 'Invalid communication AI activity cursor.',
      code: 'COMMUNICATION_AI_ACTIVITY_INVALID_CURSOR',
    });
  }
}

export function buildCommunicationAiActivityCursorWhere(
  cursor: CommunicationAiActivityCursorPayload,
): Prisma.CommunicationEventWhereInput {
  return {
    OR: [
      { occurredAt: { lt: new Date(cursor.occurredAt) } },
      {
        AND: [
          { occurredAt: new Date(cursor.occurredAt) },
          { id: { lt: cursor.id } },
        ],
      },
    ],
  };
}

export function encodeCommunicationAiActivityCursorFromRow(row: {
  id: string;
  occurredAt: Date;
}): string {
  return encodeCommunicationAiActivityCursor({
    v: COMMUNICATION_AI_ACTIVITY_CURSOR_VERSION,
    occurredAt: row.occurredAt.toISOString(),
    id: row.id,
  });
}
