import type {
  CommunicationApiChannel,
  CommunicationApiStatus,
  CommunicationConversationListQuery,
} from './types';

function normalizeEnumValue<T extends string>(value: T | T[] | undefined): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return [...value].sort().join(',');
  }
  return value;
}

export function communicationInboxQuerySignature(
  orgId: string | null | undefined,
  filters: CommunicationConversationListQuery,
): string {
  return JSON.stringify({
    orgId: orgId ?? '',
    channel: normalizeEnumValue<CommunicationApiChannel>(filters.channel),
    status: normalizeEnumValue<CommunicationApiStatus>(filters.status),
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
