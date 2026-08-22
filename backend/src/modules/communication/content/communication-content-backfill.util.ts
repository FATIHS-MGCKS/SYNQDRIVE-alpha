import { CommunicationEventType } from '@prisma/client';
import type { Prisma } from '@prisma/client';

export const BACKFILL_BATCH_SIZE_MIN = 1;
export const BACKFILL_BATCH_SIZE_MAX = 500;
export const BACKFILL_BATCH_SIZE_DEFAULT = 100;

export function validateBackfillBatchSize(batchSize: number | undefined): number {
  if (batchSize === undefined) {
    return BACKFILL_BATCH_SIZE_DEFAULT;
  }
  if (!Number.isFinite(batchSize) || !Number.isInteger(batchSize)) {
    throw new Error('batchSize must be a finite integer');
  }
  if (batchSize < BACKFILL_BATCH_SIZE_MIN || batchSize > BACKFILL_BATCH_SIZE_MAX) {
    throw new Error(`batchSize must be between ${BACKFILL_BATCH_SIZE_MIN} and ${BACKFILL_BATCH_SIZE_MAX}`);
  }
  return batchSize;
}

type BackfillChannel = 'WHATSAPP' | 'SMS';

/**
 * Deterministic canonical event matching per C2/C3/C5 adapter contracts.
 * No timestamp or text matching.
 */
export function buildBackfillEventMatchOr(
  input: {
    channel: BackfillChannel;
    eventType: CommunicationEventType;
    nativeMessageId: string;
    providerMessageId: string | null;
  },
): Prisma.CommunicationEventWhereInput[] {
  const clauses: Prisma.CommunicationEventWhereInput[] = [];

  if (input.providerMessageId?.trim()) {
    clauses.push({ providerMessageId: input.providerMessageId.trim() });
  }

  if (input.channel === 'WHATSAPP') {
    if (input.eventType === CommunicationEventType.MESSAGE_RECEIVED) {
      clauses.push({ providerEventId: `wa-msg:${input.nativeMessageId}` });
    } else if (input.eventType === CommunicationEventType.MESSAGE_SENT) {
      clauses.push({ providerEventId: `wa-sent:${input.nativeMessageId}` });
    }
  } else if (input.channel === 'SMS') {
    if (input.eventType === CommunicationEventType.MESSAGE_SENT) {
      clauses.push({ providerEventId: `sms-sent:${input.nativeMessageId}` });
    }
  }

  return clauses;
}
