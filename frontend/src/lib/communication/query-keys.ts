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
    intent: filters.intent ?? null,
    callDirection: filters.callDirection ?? null,
    callOutcome: filters.callOutcome ?? null,
    callHasTranscript: filters.callHasTranscript ?? false,
    callEscalatedOnly: filters.callEscalatedOnly ?? false,
    dateFrom: filters.dateFrom ?? null,
    dateTo: filters.dateTo ?? null,
    limit: filters.limit ?? null,
  });
}

export function communicationConversationSignature(
  orgId: string | null | undefined,
  conversationId: string | null | undefined,
): string {
  return JSON.stringify({
    orgId: orgId ?? '',
    conversationId: conversationId ?? '',
  });
}

export function communicationTimelineSignature(
  orgId: string | null | undefined,
  conversationId: string | null | undefined,
  cursor: string | null,
): string {
  return JSON.stringify({
    orgId: orgId ?? '',
    conversationId: conversationId ?? '',
    cursor: cursor ?? '',
  });
}

export const communicationQueryKeys = {
  list(orgId: string, filters: CommunicationConversationListQuery) {
    return ['communication', 'conversations', orgId, communicationInboxQuerySignature(orgId, filters)] as const;
  },
  summary(orgId: string, filters: CommunicationConversationListQuery) {
    return ['communication', 'conversations', 'summary', orgId, communicationInboxQuerySignature(orgId, filters)] as const;
  },
  detail(orgId: string, conversationId: string) {
    return ['communication', 'conversation', orgId, conversationId] as const;
  },
  timeline(orgId: string, conversationId: string, cursor: string | null) {
    return ['communication', 'timeline', orgId, conversationId, cursor ?? ''] as const;
  },
};
