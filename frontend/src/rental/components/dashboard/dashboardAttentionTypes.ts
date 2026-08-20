import type { ActionQueueItem, ActionQueueEntry } from './dashboardTypes';
import type { ApiFleetReadinessSummaryResponse } from '../../lib/notifications/notification-api.types';
import type { NotificationClientError } from '../../lib/notifications/notification-client';
export interface DashboardAttentionMutations {
  markRead: (id: string) => Promise<void>;
  markUnread: (id: string) => Promise<void>;
  acknowledge: (id: string) => Promise<void>;
  snooze: (id: string, until: string) => Promise<void>;
  unsnooze: (id: string) => Promise<void>;
  resolveNotification: (id: string) => Promise<void>;
  archiveNotification: (id: string) => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
}

export interface DashboardScopedAttentionProjection {
  items: ActionQueueItem[];
  entries: ActionQueueEntry[];
  loading: boolean;
  error: NotificationClientError | null;
  errorCode: string | null;
  total: number;
  refresh: () => Promise<void>;
  mutations: DashboardAttentionMutations;
}

export interface DashboardFleetSummaryProjection {
  summary: ApiFleetReadinessSummaryResponse | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export interface DashboardAttentionModel {
  splitActive: boolean;
  operations: DashboardScopedAttentionProjection;
  fleetReadiness: DashboardScopedAttentionProjection;
  fleetSummary: DashboardFleetSummaryProjection;
}
