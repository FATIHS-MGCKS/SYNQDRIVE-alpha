import {
  CommunicationConversationStatus,
} from '@prisma/client';
import {
  buildCommunicationAttentionPreviewTierWhere,
  resolveCommunicationAttentionPreviewLimit,
} from './communication-read.attention-preview';

describe('communication-read.attention-preview', () => {
  it('resolves preview limit within bounds', () => {
    expect(resolveCommunicationAttentionPreviewLimit(undefined)).toBe(5);
    expect(resolveCommunicationAttentionPreviewLimit(3)).toBe(3);
    expect(resolveCommunicationAttentionPreviewLimit(99)).toBe(10);
    expect(resolveCommunicationAttentionPreviewLimit(0)).toBe(1);
  });

  it('builds tier filters for canonical attention semantics', () => {
    expect(buildCommunicationAttentionPreviewTierWhere(1)).toEqual({
      status: CommunicationConversationStatus.HUMAN_REQUIRED,
    });
    expect(buildCommunicationAttentionPreviewTierWhere(2)).toEqual({
      unreadCount: { gt: 0 },
      assignedUserId: null,
    });
    expect(buildCommunicationAttentionPreviewTierWhere(4).status).toEqual({
      notIn: [
        CommunicationConversationStatus.HUMAN_REQUIRED,
        CommunicationConversationStatus.RESOLVED,
        CommunicationConversationStatus.FAILED,
      ],
    });
  });
});
