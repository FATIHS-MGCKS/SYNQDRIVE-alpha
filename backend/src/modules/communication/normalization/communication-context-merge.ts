import type { CommunicationConversation } from '@prisma/client';
import type { ConversationContextPatch } from './communication-normalization.types';

const CONTEXT_FIELDS = [
  'customerId',
  'bookingId',
  'vehicleId',
  'stationId',
  'assignedUserId',
  'assignedAgentRef',
  'assignedAgentType',
] as const satisfies ReadonlyArray<keyof ConversationContextPatch>;

export type ConversationContextField = (typeof CONTEXT_FIELDS)[number];

/**
 * Merges conversation context patches left-to-right.
 * `undefined` = leave prior value unchanged.
 * `null` = explicit clear.
 */
export function mergeConversationContext(
  base: ConversationContextPatch,
  ...patches: Array<ConversationContextPatch | undefined>
): ConversationContextPatch {
  const merged: ConversationContextPatch = { ...base };
  for (const patch of patches) {
    if (!patch) continue;
    for (const field of CONTEXT_FIELDS) {
      if (patch[field] !== undefined) {
        merged[field] = patch[field];
      }
    }
  }
  return merged;
}

export function conversationToContextPatch(
  conversation: Pick<
    CommunicationConversation,
    ConversationContextField
  >,
): ConversationContextPatch {
  return {
    customerId: conversation.customerId,
    bookingId: conversation.bookingId,
    vehicleId: conversation.vehicleId,
    stationId: conversation.stationId,
    assignedUserId: conversation.assignedUserId,
    assignedAgentRef: conversation.assignedAgentRef,
    assignedAgentType: conversation.assignedAgentType,
  };
}

/** Returns only fields that differ from existing conversation values. */
export function diffConversationContextPatch(
  existing: Pick<CommunicationConversation, ConversationContextField>,
  effective: ConversationContextPatch,
): ConversationContextPatch | undefined {
  const patch: ConversationContextPatch = {};
  let changed = false;
  for (const field of CONTEXT_FIELDS) {
    const next = effective[field] ?? null;
    const current = existing[field] ?? null;
    if (next !== current) {
      patch[field] = effective[field];
      changed = true;
    }
  }
  return changed ? patch : undefined;
}

export function pickDefinedConversationContext(
  context: ConversationContextPatch | undefined,
): ConversationContextPatch {
  if (!context) return {};
  const picked: ConversationContextPatch = {};
  for (const field of CONTEXT_FIELDS) {
    if (context[field] !== undefined) {
      picked[field] = context[field];
    }
  }
  return picked;
}
