import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type {
  EvaluationsRecommendationEventRecord,
  EvaluationsRecommendationListFilters,
  EvaluationsRecommendationRecord,
  EvaluationsRecommendationStatus,
} from '@synq/evaluations-insights/evaluations-recommendations';
import { logEvaluationsRecommendationAudit } from '@synq/evaluations-insights/evaluations-recommendations';

export interface UseEvaluationsRecommendationsResult {
  items: EvaluationsRecommendationRecord[];
  loading: boolean;
  error: string | null;
  filters: EvaluationsRecommendationListFilters;
  setFilters: (patch: Partial<EvaluationsRecommendationListFilters>) => void;
  reload: () => Promise<void>;
  selected: EvaluationsRecommendationRecord | null;
  setSelectedId: (id: string | null) => void;
  events: EvaluationsRecommendationEventRecord[];
  eventsLoading: boolean;
  pendingId: string | null;
  transitionStatus: (
    id: string,
    status: EvaluationsRecommendationStatus,
    reason?: string,
  ) => Promise<void>;
  updateRecommendation: (
    id: string,
    patch: Partial<Pick<EvaluationsRecommendationRecord, 'ownerId' | 'dueAt' | 'priority'>>,
  ) => Promise<void>;
}

export function useEvaluationsRecommendations(
  orgId: string | null | undefined,
  initialFilters: EvaluationsRecommendationListFilters = {},
): UseEvaluationsRecommendationsResult {
  const [items, setItems] = useState<EvaluationsRecommendationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFiltersState] = useState<EvaluationsRecommendationListFilters>(initialFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<EvaluationsRecommendationEventRecord[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const snapshotRef = useRef<EvaluationsRecommendationRecord[]>([]);

  const setFilters = useCallback((patch: Partial<EvaluationsRecommendationListFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
  }, []);

  const reload = useCallback(async () => {
    if (!orgId) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await api.evaluationsRecommendations.list(orgId, {
        status: filters.status,
        ownerId: filters.ownerId,
        limit: 200,
      });
      snapshotRef.current = rows;
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load recommendations');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, filters.status, filters.ownerId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selected = useMemo(
    () => items.find((row) => row.id === selectedId) ?? null,
    [items, selectedId],
  );

  useEffect(() => {
    if (!orgId || !selectedId) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    setEventsLoading(true);
    api.evaluationsRecommendations
      .getEvents(orgId, selectedId)
      .then((rows) => {
        if (!cancelled) setEvents(rows);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      })
      .finally(() => {
        if (!cancelled) setEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, selectedId]);

  const applyOptimistic = useCallback(
    (id: string, patch: Partial<EvaluationsRecommendationRecord>) => {
      setItems((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    },
    [],
  );

  const rollback = useCallback(() => {
    setItems(snapshotRef.current);
  }, []);

  const transitionStatus = useCallback(
    async (id: string, status: EvaluationsRecommendationStatus, reason?: string) => {
      if (!orgId) return;
      const previous = items.find((row) => row.id === id);
      if (!previous) return;
      setPendingId(id);
      applyOptimistic(id, { status, updatedAt: new Date().toISOString() });
      try {
        const updated = await api.evaluationsRecommendations.transitionStatus(orgId, id, {
          status,
          reason,
        });
        setItems((prev) => prev.map((row) => (row.id === id ? updated : row)));
        snapshotRef.current = snapshotRef.current.map((row) => (row.id === id ? updated : row));
        logEvaluationsRecommendationAudit({
          action: 'status_transition',
          recommendationId: id,
          status,
        });
        if (selectedId === id) {
          const nextEvents = await api.evaluationsRecommendations.getEvents(orgId, id);
          setEvents(nextEvents);
        }
      } catch (e) {
        rollback();
        throw e;
      } finally {
        setPendingId(null);
      }
    },
    [orgId, items, applyOptimistic, rollback, selectedId],
  );

  const updateRecommendation = useCallback(
    async (
      id: string,
      patch: Partial<Pick<EvaluationsRecommendationRecord, 'ownerId' | 'dueAt' | 'priority'>>,
    ) => {
      if (!orgId) return;
      const previous = items.find((row) => row.id === id);
      if (!previous) return;
      setPendingId(id);
      applyOptimistic(id, { ...patch, updatedAt: new Date().toISOString() });
      try {
        const updated = await api.evaluationsRecommendations.update(orgId, id, patch);
        setItems((prev) => prev.map((row) => (row.id === id ? updated : row)));
        snapshotRef.current = snapshotRef.current.map((row) => (row.id === id ? updated : row));
        logEvaluationsRecommendationAudit({
          action: 'update',
          recommendationId: id,
        });
      } catch (e) {
        rollback();
        throw e;
      } finally {
        setPendingId(null);
      }
    },
    [orgId, items, applyOptimistic, rollback],
  );

  return {
    items,
    loading,
    error,
    filters,
    setFilters,
    reload,
    selected,
    setSelectedId,
    events,
    eventsLoading,
    pendingId,
    transitionStatus,
    updateRecommendation,
  };
}
