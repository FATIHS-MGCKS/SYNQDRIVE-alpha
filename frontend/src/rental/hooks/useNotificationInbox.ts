import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActionQueueFilterTab, ActionQueueItem } from '../components/dashboard/dashboardTypes';
import { notificationClient, NotificationClientError } from '../lib/notifications/notification-client';
import type { ApiNotificationListMeta, ApiNotificationListParams, ApiNotificationResponse } from '../lib/notifications/notification-api.types';
import { mapNotificationApiList } from '../lib/notifications/map-notification-api-to-view-model';
import {
  emptyTabCounts,
  emptyPrimaryTabCounts,
  mapApiCountsToPrimaryTabCounts,
  mapApiCountsToTabCounts,
} from '../lib/notifications/map-api-counts-to-tab-counts';
import type { NotificationPrimaryTab } from '../components/dashboard/notifications/notificationPanelTypes';
import {
  buildNotificationInboxScopeParams,
  type NotificationInboxListMode,
} from '../lib/notifications/notification-inbox-query';

export type { NotificationInboxListMode as NotificationListMode } from '../lib/notifications/notification-inbox-query';

export interface UseNotificationInboxOptions {
  orgId: string | null | undefined;
  locale: string;
  enabled?: boolean;
}

export interface NotificationMutationState {
  id: string | null;
  action: string | null;
  error: NotificationClientError | null;
}

export interface UseNotificationInboxResult {
  items: ActionQueueItem[];
  apiRows: ApiNotificationResponse[];
  tabCounts: Record<ActionQueueFilterTab, number>;
  primaryTabCounts: Record<NotificationPrimaryTab, number>;
  listMode: NotificationInboxListMode;
  setListMode: (mode: NotificationInboxListMode) => void;
  loading: boolean;
  error: NotificationClientError | null;
  mutation: NotificationMutationState;
  hasMore: boolean;
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markUnread: (id: string) => Promise<void>;
  acknowledge: (id: string) => Promise<void>;
  snooze: (id: string, until: string) => Promise<void>;
  unsnooze: (id: string) => Promise<void>;
  resolveNotification: (id: string) => Promise<void>;
  archiveNotification: (id: string) => Promise<void>;
}

function isCursorMeta(meta: ApiNotificationListMeta): meta is { limit: number; nextCursor: string | null } {
  return 'nextCursor' in meta;
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

function receiptForRow(
  rows: ApiNotificationResponse[],
  id: string,
): ApiNotificationResponse['userReceipt'] {
  return (
    rows.find((r) => r.id === id)?.userReceipt ?? {
      readAt: null,
      acknowledgedAt: null,
      snoozedUntil: null,
      hiddenAt: null,
    }
  );
}

/**
 * Canonical notification inbox data layer — sole frontend source for V2 list, counts, and mutations.
 */
export function useNotificationInbox({
  orgId,
  locale,
  enabled = true,
}: UseNotificationInboxOptions): UseNotificationInboxResult {
  const [apiRows, setApiRows] = useState<ApiNotificationResponse[]>([]);
  const [tabCounts, setTabCounts] = useState<Record<ActionQueueFilterTab, number>>(emptyTabCounts);
  const [primaryTabCounts, setPrimaryTabCounts] = useState(emptyPrimaryTabCounts);
  const [listMode, setListMode] = useState<NotificationInboxListMode>('active');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<NotificationClientError | null>(null);
  const [mutation, setMutation] = useState<NotificationMutationState>({
    id: null,
    action: null,
    error: null,
  });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [offsetPage, setOffsetPage] = useState(1);
  const [offsetTotalPages, setOffsetTotalPages] = useState(1);
  const [paginationMode, setPaginationMode] = useState<'cursor' | 'offset'>('cursor');
  const cancelRef = useRef(false);
  const rowsSnapshotRef = useRef<ApiNotificationResponse[]>([]);
  const listModeRef = useRef(listMode);
  listModeRef.current = listMode;

  const items = useMemo(() => mapNotificationApiList(apiRows, locale), [apiRows, locale]);

  const scopeParams = useMemo(
    () => buildNotificationInboxScopeParams(listMode),
    [listMode],
  );

  const fetchCounts = useCallback(async () => {
    if (!orgId || !enabled) return;
    const counts = await notificationClient.counts(orgId, scopeParams);
    setTabCounts(mapApiCountsToTabCounts(counts));
    setPrimaryTabCounts(mapApiCountsToPrimaryTabCounts(counts));
  }, [orgId, enabled, scopeParams]);

  const fetchPage = useCallback(
    async (options: { cursor?: string | null; append: boolean }) => {
      if (!orgId || !enabled) {
        setApiRows([]);
        setTabCounts(emptyTabCounts());
        setPrimaryTabCounts(emptyPrimaryTabCounts());
        setNextCursor(null);
        setError(null);
        return;
      }

      cancelRef.current = false;
      setLoading(true);
      setError(null);

      const listParams: ApiNotificationListParams = {
        ...scopeParams,
        ...(options.cursor ? { cursor: options.cursor } : {}),
      };

      try {
        const listRes = await notificationClient.list(orgId, listParams);

        if (cancelRef.current) return;

        if (!options.append) {
          await fetchCounts();
        }

        if (cancelRef.current) return;

        setApiRows((prev) => mergePages(prev, listRes.data, options.append));

        if (isCursorMeta(listRes.meta)) {
          setPaginationMode('cursor');
          setNextCursor(listRes.meta.nextCursor);
        } else {
          setPaginationMode('offset');
          setOffsetPage(listRes.meta.page);
          setOffsetTotalPages(listRes.meta.totalPages);
          setNextCursor(listRes.meta.page < listRes.meta.totalPages ? 'offset' : null);
        }
      } catch (err) {
        if (cancelRef.current) return;
        const clientErr =
          err instanceof NotificationClientError
            ? err
            : new NotificationClientError('unknown', 'Failed to load notifications');
        setError(clientErr);
        if (!options.append) {
          setApiRows([]);
          setTabCounts(emptyTabCounts());
          setPrimaryTabCounts(emptyPrimaryTabCounts());
          setNextCursor(null);
        }
      } finally {
        if (!cancelRef.current) setLoading(false);
      }
    },
    [orgId, enabled, scopeParams, fetchCounts],
  );

  const refresh = useCallback(async () => {
    setApiRows([]);
    setNextCursor(null);
    await fetchPage({ append: false });
  }, [fetchPage]);

  const retry = refresh;

  const loadMore = useCallback(async () => {
    if (!nextCursor || loading || !orgId || !enabled) return;

    if (paginationMode === 'offset') {
      const targetPage = offsetPage + 1;
      if (targetPage > offsetTotalPages) return;
      setLoading(true);
      setError(null);
      try {
        const listRes = await notificationClient.list(orgId, {
          ...scopeParams,
          page: targetPage,
        });
        setApiRows((prev) => mergePages(prev, listRes.data, true));
        if (isCursorMeta(listRes.meta)) {
          setPaginationMode('cursor');
          setNextCursor(listRes.meta.nextCursor);
        } else {
          setOffsetPage(listRes.meta.page);
          setOffsetTotalPages(listRes.meta.totalPages);
          setNextCursor(listRes.meta.page < listRes.meta.totalPages ? 'offset' : null);
        }
      } catch (err) {
        const clientErr =
          err instanceof NotificationClientError
            ? err
            : new NotificationClientError('unknown', 'Failed to load notifications');
        setError(clientErr);
      } finally {
        setLoading(false);
      }
      return;
    }

    await fetchPage({ cursor: nextCursor, append: true });
  }, [
    nextCursor,
    loading,
    orgId,
    enabled,
    paginationMode,
    offsetPage,
    offsetTotalPages,
    scopeParams,
    fetchPage,
  ]);

  useEffect(() => {
    cancelRef.current = false;
    setApiRows([]);
    setNextCursor(null);
    void fetchPage({ append: false });
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
      options?: { removeOnSuccess?: boolean },
    ) => {
      rowsSnapshotRef.current = apiRows;
      setMutation({ id, action, error: null });
      setApiRows((prev) => optimistic(prev));

      try {
        const updated = await request();
        if (options?.removeOnSuccess && listModeRef.current === 'active') {
          setApiRows((prev) => prev.filter((row) => row.id !== id));
        } else {
          setApiRows((prev) => patchRow(prev, id, updated));
        }
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
            userReceipt: { ...receiptForRow(rows, id), readAt: new Date().toISOString() },
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
            userReceipt: { ...receiptForRow(rows, id), readAt: null },
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
            userReceipt: {
              ...receiptForRow(rows, id),
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
            userReceipt: { ...receiptForRow(rows, id), snoozedUntil: until },
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
            userReceipt: { ...receiptForRow(rows, id), snoozedUntil: null },
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
        (rows) => rows,
        () => notificationClient.resolve(orgId!, id),
        { removeOnSuccess: true },
      ),
    [orgId, runOptimisticMutation],
  );

  const archiveNotification = useCallback(
    (id: string) =>
      runOptimisticMutation(
        id,
        'archive',
        (rows) => rows,
        () => notificationClient.archive(orgId!, id),
        { removeOnSuccess: true },
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
    hasMore: nextCursor != null,
    refresh,
    retry,
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
