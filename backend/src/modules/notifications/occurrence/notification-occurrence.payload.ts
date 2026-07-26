import { Prisma } from '@prisma/client';
import { NOTIFICATION_DB_LIMITS } from '../integrity/notification-db-integrity.constants';
import { sanitizeCandidateMetadata } from '../notification-candidate.contract';
import type { NotificationCandidate } from '../notification.types';

export class NotificationOccurrencePayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotificationOccurrencePayloadError';
  }
}

/** Controlled, PII-scrubbed metadata for occurrence rows — never raw producer blobs. */
export function buildOccurrencePayload(
  candidate: NotificationCandidate,
): Prisma.InputJsonValue | undefined {
  const sanitized = sanitizeCandidateMetadata(candidate.metadata);
  if (!sanitized) return undefined;

  const bytes = Buffer.byteLength(JSON.stringify(sanitized), 'utf8');
  if (bytes > NOTIFICATION_DB_LIMITS.occurrencePayloadMaxBytes) {
    throw new NotificationOccurrencePayloadError(
      `Occurrence metadata exceeds ${NOTIFICATION_DB_LIMITS.occurrencePayloadMaxBytes} bytes`,
    );
  }

  return sanitized as Prisma.InputJsonValue;
}
