import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const COMMUNICATION_INBOX_DEFAULT_LIMIT = 25;
export const COMMUNICATION_INBOX_MAX_LIMIT = 100;
export const COMMUNICATION_TIMELINE_DEFAULT_LIMIT = 50;
export const COMMUNICATION_TIMELINE_MAX_LIMIT = 100;

export const COMMUNICATION_INBOX_CURSOR_VERSION = 'inbox-v1' as const;
export const COMMUNICATION_TIMELINE_CURSOR_VERSION = 'timeline-v1' as const;

export interface CommunicationInboxCursorPayload {
  v: typeof COMMUNICATION_INBOX_CURSOR_VERSION;
  lastActivityAt: string;
  id: string;
}

export interface CommunicationTimelineCursorPayload {
  v: typeof COMMUNICATION_TIMELINE_CURSOR_VERSION;
  occurredAt: string;
  id: string;
}

export interface CommunicationCursorPageMeta {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CommunicationCursorPageResult<T> {
  items: T[];
  meta: CommunicationCursorPageMeta;
}

export function resolveCommunicationListLimit(
  limit: number | undefined,
  defaults: { defaultLimit: number; maxLimit: number },
): number {
  const requested = limit ?? defaults.defaultLimit;
  return Math.min(Math.max(1, Math.floor(requested)), defaults.maxLimit);
}

export function encodeCommunicationInboxCursor(payload: CommunicationInboxCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCommunicationInboxCursor(cursor: string): CommunicationInboxCursorPayload {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as CommunicationInboxCursorPayload;
    if (
      !parsed
      || typeof parsed !== 'object'
      || parsed.v !== COMMUNICATION_INBOX_CURSOR_VERSION
      || typeof parsed.id !== 'string'
      || typeof parsed.lastActivityAt !== 'string'
      || Number.isNaN(Date.parse(parsed.lastActivityAt))
    ) {
      throw new Error('invalid inbox cursor');
    }
    return parsed;
  } catch {
    throw new BadRequestException({
      message: 'Invalid communication inbox cursor.',
      code: 'COMMUNICATION_INBOX_INVALID_CURSOR',
    });
  }
}

export function encodeCommunicationTimelineCursor(
  payload: CommunicationTimelineCursorPayload,
): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCommunicationTimelineCursor(cursor: string): CommunicationTimelineCursorPayload {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as CommunicationTimelineCursorPayload;
    if (
      !parsed
      || typeof parsed !== 'object'
      || parsed.v !== COMMUNICATION_TIMELINE_CURSOR_VERSION
      || typeof parsed.id !== 'string'
      || typeof parsed.occurredAt !== 'string'
      || Number.isNaN(Date.parse(parsed.occurredAt))
    ) {
      throw new Error('invalid timeline cursor');
    }
    return parsed;
  } catch {
    throw new BadRequestException({
      message: 'Invalid communication timeline cursor.',
      code: 'COMMUNICATION_TIMELINE_INVALID_CURSOR',
    });
  }
}

export function buildCommunicationInboxCursorWhere(
  payload: CommunicationInboxCursorPayload,
): Prisma.CommunicationConversationWhereInput {
  const lastActivityAt = new Date(payload.lastActivityAt);
  const id = payload.id;
  return {
    OR: [
      { lastActivityAt: { lt: lastActivityAt } },
      {
        AND: [{ lastActivityAt }, { id: { lt: id } }],
      },
    ],
  };
}

export function buildCommunicationTimelineCursorWhere(
  payload: CommunicationTimelineCursorPayload,
): Prisma.CommunicationEventWhereInput {
  const occurredAt = new Date(payload.occurredAt);
  const id = payload.id;
  return {
    OR: [
      { occurredAt: { lt: occurredAt } },
      {
        AND: [{ occurredAt }, { id: { lt: id } }],
      },
    ],
  };
}

export function encodeCommunicationInboxCursorFromRow(row: {
  id: string;
  lastActivityAt: Date;
}): string {
  return encodeCommunicationInboxCursor({
    v: COMMUNICATION_INBOX_CURSOR_VERSION,
    id: row.id,
    lastActivityAt: row.lastActivityAt.toISOString(),
  });
}

export function encodeCommunicationTimelineCursorFromRow(row: {
  id: string;
  occurredAt: Date;
}): string {
  return encodeCommunicationTimelineCursor({
    v: COMMUNICATION_TIMELINE_CURSOR_VERSION,
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
  });
}
