import { createHash } from 'crypto';
import { CommunicationReplyContentType } from '@prisma/client';

export function buildReplyPayloadHash(input: {
  contentType: CommunicationReplyContentType;
  text: string;
  attachmentId?: string | null;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        contentType: input.contentType,
        text: input.text,
        attachmentId: input.attachmentId ?? null,
      }),
    )
    .digest('hex');
}
