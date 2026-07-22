import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type LegalDocumentDto, type LegalDocumentEventDto } from '../../../lib/api';
import { buildLegalDocumentsReadinessSummary } from '../../lib/legal-documents-overview';

export interface UseLegalDocumentsOverviewResult {
  docs: LegalDocumentDto[];
  summary: ReturnType<typeof buildLegalDocumentsReadinessSummary>;
  events: LegalDocumentEventDto[];
  loading: boolean;
  eventsLoading: boolean;
  error: string | null;
  eventsError: string | null;
  refresh: () => Promise<void>;
}

export function useLegalDocumentsOverview(
  orgId: string | null | undefined,
  options?: { loadEvents?: boolean },
): UseLegalDocumentsOverviewResult {
  const [docs, setDocs] = useState<LegalDocumentDto[]>([]);
  const [events, setEvents] = useState<LegalDocumentEventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const loadEvents = options?.loadEvents ?? false;

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const list = await api.legalDocuments.list(orgId);
      setDocs(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Laden fehlgeschlagen');
    } finally {
      setLoading(false);
    }

    if (loadEvents) {
      setEventsLoading(true);
      setEventsError(null);
      try {
        const page = await api.legalDocuments.listEvents(orgId, { page: 1, limit: 20 });
        setEvents(page.data ?? []);
      } catch (err) {
        setEventsError(err instanceof Error ? err.message : 'Audit konnte nicht geladen werden');
      } finally {
        setEventsLoading(false);
      }
    }
  }, [orgId, loadEvents]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const summary = useMemo(() => buildLegalDocumentsReadinessSummary(docs), [docs]);

  return {
    docs,
    summary,
    events,
    loading,
    eventsLoading,
    error,
    eventsError,
    refresh,
  };
}
