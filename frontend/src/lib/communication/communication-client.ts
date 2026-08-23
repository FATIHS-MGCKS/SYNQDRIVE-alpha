import { api } from '../api';
import type {
  CommunicationConversationDetail,
  CommunicationConversationListQuery,
  CommunicationConversationListResponse,
  CommunicationConversationSummary,
  CommunicationEventListQuery,
  CommunicationEventListResponse,
} from './types';

export type CommunicationClientErrorCode =
  | 'network'
  | 'invalid_query'
  | 'permission_denied'
  | 'already_claimed'
  | 'stale_state'
  | 'unknown';

export class CommunicationClientError extends Error {
  readonly code: CommunicationClientErrorCode;
  readonly status?: number;

  constructor(code: CommunicationClientErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'CommunicationClientError';
    this.code = code;
    this.status = status;
  }
}

function mapRequestError(err: unknown): CommunicationClientError {
  const message = err instanceof Error ? err.message : 'Communication request failed';
  const statusFromObj = (err as { status?: number })?.status;
  const statusMatch = message.match(/API error (\d{3})/);
  const status = statusFromObj ?? (statusMatch ? Number(statusMatch[1]) : undefined);
  if (status === 403 || status === 401) {
    return new CommunicationClientError('permission_denied', message, status);
  }
  if (status === 400) {
    return new CommunicationClientError('invalid_query', message, status);
  }
  if (status === 409 && message.includes('STALE_STATE')) {
    return new CommunicationClientError('stale_state', message, status);
  }
  if (status === 409 || message.includes('ALREADY_CLAIMED')) {
    return new CommunicationClientError('already_claimed', message, status);
  }
  if (status != null && status >= 400) {
    return new CommunicationClientError('unknown', message, status);
  }
  return new CommunicationClientError('network', message, status);
}

async function wrap<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw mapRequestError(err);
  }
}

export const communicationClient = {
  listConversations(
    orgId: string,
    query?: CommunicationConversationListQuery,
  ): Promise<CommunicationConversationListResponse> {
    return wrap(() => api.communication.listConversations(orgId, query));
  },

  getConversationSummary(
    orgId: string,
    query?: CommunicationConversationListQuery,
  ): Promise<CommunicationConversationSummary> {
    return wrap(() => api.communication.getConversationSummary(orgId, query));
  },

  getConversation(orgId: string, conversationId: string): Promise<CommunicationConversationDetail> {
    return wrap(() => api.communication.getConversation(orgId, conversationId));
  },

  listConversationEvents(
    orgId: string,
    conversationId: string,
    query?: CommunicationEventListQuery,
  ): Promise<CommunicationEventListResponse> {
    return wrap(() => api.communication.listConversationEvents(orgId, conversationId, query));
  },

  listAiActivity(
    orgId: string,
    query?: import('./types').CommunicationAiActivityListQuery,
  ): Promise<import('./types').CommunicationAiActivityListResponse> {
    return wrap(() => api.communication.listAiActivity(orgId, query));
  },

  claimConversation(orgId: string, conversationId: string) {
    return wrap(() => api.communication.claimConversation(orgId, conversationId));
  },

  assignConversation(orgId: string, conversationId: string, assignedUserId: string | null) {
    return wrap(() => api.communication.assignConversation(orgId, conversationId, assignedUserId));
  },

  resolveConversation(orgId: string, conversationId: string) {
    return wrap(() => api.communication.resolveConversation(orgId, conversationId));
  },

  reopenConversation(orgId: string, conversationId: string) {
    return wrap(() => api.communication.reopenConversation(orgId, conversationId));
  },

  markConversationRead(orgId: string, conversationId: string) {
    return wrap(() => api.communication.markConversationRead(orgId, conversationId));
  },

  replyConversation(
    orgId: string,
    conversationId: string,
    body: {
      text?: string;
      attachmentId?: string;
      contentType?: import('./types').CommunicationReplyContentType;
      idempotencyKey: string;
    },
  ) {
    return wrap(() => api.communication.replyConversation(orgId, conversationId, body));
  },

  uploadAttachment(orgId: string, conversationId: string, file: File) {
    return wrap(() => api.communication.uploadAttachment(orgId, conversationId, file));
  },

  attachmentContentUrl(orgId: string, attachmentId: string) {
    return `/api/v1/organizations/${orgId}/communication/attachments/${attachmentId}/content`;
  },
};
