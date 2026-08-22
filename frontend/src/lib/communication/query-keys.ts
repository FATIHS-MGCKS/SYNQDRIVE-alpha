import type { CommunicationConversationListQuery } from './types';

export function communicationInboxQuerySignature(
  orgId: string | null | undefined,
  filters: CommunicationConversationListQuery,
): string {
  return JSON.stringify({
    orgId: orgId ?? '',
    channel: filters.channel ?? null,
    status: filters.status ?? null,
    unreadOnly: filters.unreadOnly ?? false,
    unassigned: filters.unassigned ?? false,
    search: filters.search?.trim() ?? '',
    limit: filters.limit ?? null,
  });
}

export const communicationQueryKeys = {
  list(orgId: string, filters: CommunicationConversationListQuery) {
    return ['communication', 'conversations', orgId, communicationInboxQuerySignature(orgId, filters)] as const;
  },
  summary(orgId: string, filters: CommunicationConversationListQuery) {
    return ['communication', 'conversations', 'summary', orgId, communicationInboxQuerySignature(orgId, filters)] as const;
  },
};
