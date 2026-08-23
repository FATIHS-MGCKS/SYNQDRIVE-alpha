import { createHash } from 'crypto';
import { CommunicationReplyContentType } from '@prisma/client';
import { normalizeTemplateVariables } from './communication-template-variables.util';

export interface ReplyPayloadIdentity {
  contentType: CommunicationReplyContentType;
  text: string;
  attachmentId: string | null;
  templateId: string | null;
  templateVariables: Record<string, string>;
  payloadHash: string;
}

export interface StoredReplyCommandIdentity {
  contentType: CommunicationReplyContentType;
  text: string;
  attachmentId: string | null;
  templateId?: string | null;
  templateVariables?: Record<string, string> | null | unknown;
  payloadHash: string | null;
}

function stableTemplateVariables(variables: Record<string, string>): Record<string, string> {
  const normalized = normalizeTemplateVariables(variables);
  return Object.fromEntries(Object.keys(normalized).sort().map((key) => [key, normalized[key]!]));
}

/** Canonical runtime authority — sole serializer for reply idempotency fingerprints. */
export function buildReplyPayloadHash(input: {
  contentType: CommunicationReplyContentType;
  text: string;
  attachmentId?: string | null;
  templateId?: string | null;
  templateVariables?: Record<string, string>;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        contentType: input.contentType,
        text: input.text,
        attachmentId: input.attachmentId ?? null,
        templateId: input.templateId ?? null,
        templateVariables:
          input.contentType === CommunicationReplyContentType.TEMPLATE
            ? stableTemplateVariables(input.templateVariables ?? {})
            : null,
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

  if (
    existing.contentType === CommunicationReplyContentType.TEXT
    && requested.contentType === CommunicationReplyContentType.TEXT
    && existing.attachmentId == null
    && requested.attachmentId == null
    && existing.text === requested.text
  ) {
    return true;
  }

  if (
    existing.contentType === CommunicationReplyContentType.TEMPLATE
    && requested.contentType === CommunicationReplyContentType.TEMPLATE
    && existing.templateId === requested.templateId
  ) {
    const existingVars =
      existing.templateVariables
      && typeof existing.templateVariables === 'object'
      && !Array.isArray(existing.templateVariables)
        ? (existing.templateVariables as Record<string, string>)
        : {};
    const requestedVars = stableTemplateVariables(requested.templateVariables);
    return JSON.stringify(existingVars) === JSON.stringify(requestedVars);
  }

  return false;
}

export function shouldBackfillLegacyPayloadHash(
  existing: StoredReplyCommandIdentity,
  requested: ReplyPayloadIdentity,
): boolean {
  return existing.payloadHash == null && matchesReplyCommandPayload(existing, requested);
}
