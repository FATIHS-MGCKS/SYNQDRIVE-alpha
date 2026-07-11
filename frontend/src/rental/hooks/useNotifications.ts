import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActionQueueFilterTab, ActionQueueItem } from '../../components/dashboard/dashboardTypes';
import { notificationClient, NotificationClientError } from './notification-client';
import type { ApiNotificationListParams, ApiNotificationResponse } from './notification-api.types';
import { mapNotificationApiList } from './map-notification-api-to-view-model';
import { emptyTabCounts, emptyPrimaryTabCounts, mapApiCountsToPrimaryTabCounts, mapApiCountsToTabCounts } from './map-api-counts-to-tab-counts';
import type { NotificationPrimaryTab } from '../../components/dashboard/notifications/notificationPanelTypes';

const DEFAULT_PAGE_SIZE = 50;

export type NotificationListMode = 'active' | 'resolved';

export interface UseNotificationsOptions {
  orgId: string | null | undefined;
  locale: string;
  enabled?: boolean;
}

export interface NotificationMutationState {
  id: string | null;
  action: string | null;
  error: NotificationClientError | null;
}

export interface UseNotificationsResult {
  items: ActionQueueItem[];
  apiRows: ApiNotificationResponse[];
  tabCounts: Record<ActionQueueFilterTab, number>;
  primaryTabCounts: Record<NotificationPrimaryTab, number>;
  listMode: NotificationListMode;
  setListMode: (mode: NotificationListMode) => void;
  loading: boolean;
  error: NotificationClientError | null;
  mutation: NotificationMutationState;
  page: number;
  totalPages: number;
  hasMore: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markUnread: (id: string) => Promise<void>;
  acknowledge: (id: string) => Promise<void>;
  snooze: (id: string, until: string) => Promise<void>;
  unsnooze: (id: string) => Promise<void>;
  resolveNotification: (id: string) => Promise<void>;
  archiveNotification: (id: string) => Promise<void>;
}

function mergePages(
  existing: ApiNotificationResponse[],
  next: ApiNotificationResponse[],
  append: boolean,
): ApiNotificationResponse[] {
  if (!append) return next;
  const seen = new Set(existing.map((row) => row.id));
  const merged = [...existing];
  for (const row of next) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return merged;
}

function patchRow(
  rows: ApiNotificationResponse[],
  id: string,
  patch: Partial<ApiNotificationResponse>,
): ApiNotificationResponse[] {
  return rows.map((row) => (row.id === id ? { ...row, ...patch } : row));
}

export function useNotifications({
  orgId,
  locale,
  enabled = true,
}: UseNotificationsOptions): UseNotificationsResult {
  const [apiRows, setApiRows] = useState<ApiNotificationResponse[]>([]);
  const [tabCounts, setTabCounts] = useState<Record<ActionQueueFilterTab, number>>(emptyTabCounts);
  const [primaryTabCounts, setPrimaryTabCounts] = useState(emptyPrimaryTabCounts);
  const [listMode, setListMode] = useState<NotificationListMode>('active');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<NotificationClientError | null>(null);
  const [mutation, setMutation] = useState<NotificationMutationState>({
    id: null,
    action: null,
    error: null,
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const cancelRef = useRef(false);
  const rowsSnapshotRef = useRef<ApiNotificationResponse[]>([]);

  const items = useMemo(
    () => mapNotificationApiList(apiRows, locale),
    [apiRows, locale],
  );

  const listParams = useMemo<ApiNotificationListParams>(
    () => ({
      page: 1,
      limit: DEFAULT_PAGE_SIZE,
      activeOnly: listMode === 'active',
      resolvedOnly: listMode === 'resolved',
      sortBy: 'lastSeenAt',
      sortOrder: 'desc',
    }),
    [listMode],
  );

  const fetchCounts = useCallback(async () => {
    if (!orgId || !enabled) return;
    const counts = await notificationClient.counts(orgId);
    setTabCounts(mapApiCountsToTabCounts(counts));
    setPrimaryTabCounts(mapApiCountsToPrimaryTabCounts(counts));
  }, [orgId, enabled]);

  const fetchPage = useCallback(
    async (targetPage: number, append: boolean) => {
      if (!orgId || !enabled) {
        setApiRows([]);
        setTabCounts(emptyTabCounts());
        setPrimaryTabCounts(emptyPrimaryTabCounts());
        setError(null);
        return;
      }

      cancelRef.current = false;
      setLoading(true);
      setError(null);

      try {
        const [listRes] = await Promise.all([
          notificationClient.list(orgId, { ...listParams, page: targetPage }),
          targetPage === 1 ? fetchCounts() : Promise.resolve(),
        ]);

        if (cancelRef.current) return;

        setApiRows((prev) => mergePages(prev, listRes.data, append));
        setPage(listRes.meta.page);
        setTotalPages(listRes.meta.totalPages);
      } catch (err) {
        if (cancelRef.current) return;
        const clientErr =
          err instanceof NotificationClientError
            ? err
            : new NotificationClientError('unknown', 'Failed to load notifications');
        setError(clientErr);
        if (!append) {
          setApiRows([]);
          setTabCounts(emptyTabCounts());
        setPrimaryTabCounts(emptyPrimaryTabCounts());
        }
      } finally {
        if (!cancelRef.current) setLoading(false);
      }
    },
    [orgId, enabled, listParams, fetchCounts],
  );

  const refresh = useCallback(async () => {
    setApiRows([]);
    await fetchPage(1, false);
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (page >= totalPages || loading) return;
    await fetchPage(page + 1, true);
  }, [page, totalPages, loading, fetchPage]);

  useEffect(() => {
    cancelRef.current = false;
    void fetchPage(1, false);
    return () => {
      cancelRef.current = true;
    };
  }, [fetchPage]);

  const runOptimisticMutation = useCallback(
    async (
      id: string,
      action: string,
      optimistic: (rows: ApiNotificationResponse[]) => ApiNotificationResponse[],
      request: () => Promise<ApiNotificationResponse>,
    ) => {
      rowsSnapshotRef.current = apiRows;
      setMutation({ id, action, error: null });
      setApiRows((prev) => optimistic(prev));

      try {
        const updated = await request();
        setApiRows((prev) => patchRow(prev, id, updated));
        await fetchCounts();
      } catch (err) {
        setApiRows(rowsSnapshotRef.current);
        const clientErr =
          err instanceof NotificationClientError
            ? err
            : new NotificationClientError('mutation_failed', 'Notification mutation failed');
        setMutation({ id, action, error: clientErr });
        throw clientErr;
      } finally {
        setMutation({ id: null, action: null, error: null });
      }
    },
    [apiRows, fetchCounts],
  );

  const markRead = useCallback(
    (id: string) =>
      runOptimisticMutation(
        id,
        'read',
        (rows) =>
          patchRow(rows, id, {
            userReceipt: {
              ...(rows.find((r) => r.id === id)?.userReceipt ?? {
                readAt: null,
                acknowledgedAt: null,
                snoozedUntil: null,
                hiddenAt: null,
              }),
              readAt: new Date().toISOString(),
            },
          }),
        () => notificationClient.markRead(orgId!, id),
      ),
    [orgId, runOptimisticMutation],
  );

  const markUnread = useCallback(
    (id: string) =>
      runOptimisticMutation(
        id,
        'unread',
        (rows) =>
          patchRow(rows, id, {
            userReceipt: {
              ...(rows.find((r) => r.id === id)?.userReceipt ?? {
                readAt: null,
                acknowledgedAt: null,
                snoozedUntil: null,
                hiddenAt: null,
              }),
              readAt: null,
            },
          }),
        () => notificationClient.markUnread(orgId!, id),
      ),
    [orgId, runOptimisticMutation],
  );

  const acknowledge = useCallback(
    (id: string) =>
      runOptimisticMutation(
        id,
        'acknowledge',
        (rows) =>
          patchRow(rows, id, {
            status: 'ACKNOWLEDGED',
            userReceipt: {
              ...(rows.find((r) => r.id === id)?.userReceipt ?? {
                readAt: null,
                acknowledgedAt: null,
                snoozedUntil: null,
                hiddenAt: null,
              }),
              acknowledgedAt: new Date().toISOString(),
              readAt: new Date().toISOString(),
            },
          }),
        () => notificationClient.acknowledge(orgId!, id),
      ),
    [orgId, runOptimisticMutation],
  );

  const snooze = useCallback(
    (id: string, until: string) =>
      runOptimisticMutation(
        id,
        'snooze',
        (rows) =>
          patchRow(rows, id, {
            status: 'SNOOZED',
            userReceipt: {
              ...(rows.find((r) => r.id === id)?.userReceipt ?? {
                readAt: null,
                acknowledgedAt: null,
                snoozedUntil: null,
                hiddenAt: null,
              }),
              snoozedUntil: until,
            },
          }),
        () => notificationClient.snooze(orgId!, id, until),
      ),
    [orgId, runOptimisticMutation],
  );

  const unsnooze = useCallback(
    (id: string) =>
      runOptimisticMutation(
        id,
        'unsnooze',
        (rows) =>
          patchRow(rows, id, {
            status: 'OPEN',
            userReceipt: {
              ...(rows.find((r) => r.id === id)?.userReceipt ?? {
                readAt: null,
                acknowledgedAt: null,
                snoozedUntil: null,
                hiddenAt: null,
              }),
              snoozedUntil: null,
            },
          }),
        () => notificationClient.unsnooze(orgId!, id),
      ),
    [orgId, runOptimisticMutation],
  );

  const resolveNotification = useCallback(
    (id: string) =>
      runOptimisticMutation(
        id,
        'resolve',
        (rows) =>
          patchRow(rows, id, {
            status: 'RESOLVED',
            resolvedAt: new Date().toISOString(),
          }),
        () => notificationClient.resolve(orgId!, id),
      ),
    [orgId, runOptimisticMutation],
  );

  const archiveNotification = useCallback(
    (id: string) =>
      runOptimisticMutation(
        id,
        'archive',
        (rows) => patchRow(rows, id, { status: 'ARCHIVED' }),
        () => notificationClient.archive(orgId!, id),
      ),
    [orgId, runOptimisticMutation],
  );

  return {
    items,
    apiRows,
    tabCounts,
    primaryTabCounts,
    listMode,
    setListMode,
    loading,
    error,
    mutation,
    page,
    totalPages,
    hasMore: page < totalPages,
    refresh,
    loadMore,
    markRead,
    markUnread,
    acknowledge,
    snooze,
    unsnooze,
    resolveNotification,
    archiveNotification,
  };
}
