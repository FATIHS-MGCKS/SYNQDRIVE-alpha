import {
  CommunicationConversationStatus,
  Prisma,
} from '@prisma/client';

export const COMMUNICATION_ATTENTION_PREVIEW_DEFAULT_LIMIT = 5;
export const COMMUNICATION_ATTENTION_PREVIEW_MAX_LIMIT = 10;

const TERMINAL_STATUSES: CommunicationConversationStatus[] = [
  CommunicationConversationStatus.RESOLVED,
  CommunicationConversationStatus.FAILED,
];

export type CommunicationAttentionPreviewTier = 1 | 2 | 3 | 4;

export function buildCommunicationAttentionPreviewTierWhere(
  tier: CommunicationAttentionPreviewTier,
): Prisma.CommunicationConversationWhereInput {
  switch (tier) {
    case 1:
      return { status: CommunicationConversationStatus.HUMAN_REQUIRED };
    case 2:
      return {
        unreadCount: { gt: 0 },
        assignedUserId: null,
      };
    case 3:
      return { unreadCount: { gt: 0 } };
    case 4:
      return {
        unreadCount: 0,
        assignedUserId: null,
        status: {
          notIn: [
            CommunicationConversationStatus.HUMAN_REQUIRED,
            ...TERMINAL_STATUSES,
          ],
        },
      };
    default: {
      const _exhaustive: never = tier;
      return _exhaustive;
    }
  }
}

export const COMMUNICATION_ATTENTION_PREVIEW_TIERS: CommunicationAttentionPreviewTier[] = [
  1, 2, 3, 4,
];

export function resolveCommunicationAttentionPreviewLimit(limit?: number): number {
  if (limit == null || Number.isNaN(limit)) {
    return COMMUNICATION_ATTENTION_PREVIEW_DEFAULT_LIMIT;
  }
  return Math.min(
    COMMUNICATION_ATTENTION_PREVIEW_MAX_LIMIT,
    Math.max(1, Math.floor(limit)),
  );
}
