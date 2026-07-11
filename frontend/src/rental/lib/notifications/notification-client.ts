import { api } from '../../../lib/api';
import type {
  ApiNotificationCountsResponse,
  ApiNotificationListParams,
  ApiNotificationListResponse,
  ApiNotificationResponse,
} from './notification-api.types';

export type NotificationClientErrorCode =
  | 'network'
  | 'api_disabled'
  | 'permission_denied'
  | 'not_found'
  | 'mutation_failed'
  | 'unknown';

export class NotificationClientError extends Error {
  readonly code: NotificationClientErrorCode;
  readonly status?: number;

  constructor(code: NotificationClientErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'NotificationClientError';
    this.code = code;
    this.status = status;
  }
}

function mapRequestError(err: unknown): NotificationClientError {
  const message = err instanceof Error ? err.message : 'Notification request failed';
  const statusFromObj = (err as { status?: number })?.status;
  const statusMatch = message.match(/API error (\d{3})/);
  const status = statusFromObj ?? (statusMatch ? Number(statusMatch[1]) : undefined);
  if (status === 503) {
    return new NotificationClientError('api_disabled', message, status);
  }
  if (status === 403 || status === 401) {
    return new NotificationClientError('permission_denied', message, status);
  }
  if (status === 404) {
    return new NotificationClientError('not_found', message, status);
  }
  if (status != null && status >= 400) {
    return new NotificationClientError('unknown', message, status);
  }
  return new NotificationClientError('network', message, status);
}

async function wrap<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw mapRequestError(err);
  }
}

/**
 * Org-scoped Notification Engine V2 client — thin wrapper over `api.notifications`.
 */
export const notificationClient = {
  list(orgId: string, params?: ApiNotificationListParams): Promise<ApiNotificationListResponse> {
    return wrap(() => api.notifications.list(orgId, params));
  },

  counts(orgId: string): Promise<ApiNotificationCountsResponse> {
    return wrap(() => api.notifications.counts(orgId));
  },

  get(orgId: string, id: string): Promise<ApiNotificationResponse> {
    return wrap(() => api.notifications.get(orgId, id));
  },

  markRead(orgId: string, id: string): Promise<ApiNotificationResponse> {
    return wrap(() => api.notifications.markRead(orgId, id));
  },

  markUnread(orgId: string, id: string): Promise<ApiNotificationResponse> {
    return wrap(() => api.notifications.markUnread(orgId, id));
  },

  acknowledge(orgId: string, id: string): Promise<ApiNotificationResponse> {
    return wrap(() => api.notifications.acknowledge(orgId, id));
  },

  snooze(orgId: string, id: string, until: string): Promise<ApiNotificationResponse> {
    return wrap(() => api.notifications.snooze(orgId, id, until));
  },

  unsnooze(orgId: string, id: string): Promise<ApiNotificationResponse> {
    return wrap(() => api.notifications.unsnooze(orgId, id));
  },

  resolve(orgId: string, id: string): Promise<ApiNotificationResponse> {
    return wrap(() => api.notifications.resolve(orgId, id));
  },

  archive(orgId: string, id: string): Promise<ApiNotificationResponse> {
    return wrap(() => api.notifications.archive(orgId, id));
  },
};
