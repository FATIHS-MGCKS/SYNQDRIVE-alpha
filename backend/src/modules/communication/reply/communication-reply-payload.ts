import { createHash } from 'crypto';
import { CommunicationReplyContentType } from '@prisma/client';

export interface ReplyPayloadIdentity {
  contentType: CommunicationReplyContentType;
  text: string;
  attachmentId: string | null;
  payloadHash: string;
}

export interface StoredReplyCommandIdentity {
  contentType: CommunicationReplyContentType;
  text: string;
  attachmentId: string | null;
  payloadHash: string | null;
}

/** Canonical runtime authority — sole serializer for reply idempotency fingerprints. */
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

/**
 * Compares a stored command with a requested payload.
 * Legacy C11.2 rows may have payloadHash=null (TEXT-only, no attachment).
 */
export function matchesReplyCommandPayload(
  existing: StoredReplyCommandIdentity,
  requested: ReplyPayloadIdentity,
): boolean {
  if (existing.payloadHash != null) {
    return existing.payloadHash === requested.payloadHash;
  }

  return (
    existing.contentType === CommunicationReplyContentType.TEXT
    && requested.contentType === CommunicationReplyContentType.TEXT
    && existing.attachmentId == null
    && requested.attachmentId == null
    && existing.text === requested.text
  );
}

export function shouldBackfillLegacyPayloadHash(
  existing: StoredReplyCommandIdentity,
  requested: ReplyPayloadIdentity,
): boolean {
  return existing.payloadHash == null && matchesReplyCommandPayload(existing, requested);
}
