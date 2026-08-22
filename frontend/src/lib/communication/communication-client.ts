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
};
