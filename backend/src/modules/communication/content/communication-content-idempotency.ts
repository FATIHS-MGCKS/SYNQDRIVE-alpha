import { createHash } from 'crypto';
import type { CommunicationChannel } from '@prisma/client';
import { CANONICAL_CONTENT_IDEMPOTENCY_VERSION } from './communication-content.constants';

export function buildCanonicalContentIdempotencyKey(input: {
  organizationId: string;
  channel: CommunicationChannel;
  nativeMessageId: string;
}): string {
  const payload = JSON.stringify({
    v: 1,
    organizationId: input.organizationId,
    channel: input.channel,
    nativeMessageId: input.nativeMessageId,
  });
  const digest = createHash('sha256').update(payload).digest('hex');
  return `${CANONICAL_CONTENT_IDEMPOTENCY_VERSION}:${digest}`;
}
