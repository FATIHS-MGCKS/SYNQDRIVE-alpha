import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type LegalDocumentDto, type LegalDocumentEventDto } from '../../../lib/api';
import { buildLegalDocumentsReadinessSummary } from '../../lib/legal-documents-overview';
import type { LegalDocumentWorkflowSettings } from '../../lib/legal-document-lifecycle.types';
import { useLanguage } from '../../i18n/LanguageContext';

export interface UseLegalDocumentsOverviewResult {
  docs: LegalDocumentDto[];
  summary: ReturnType<typeof buildLegalDocumentsReadinessSummary>;
  events: LegalDocumentEventDto[];
  settings: LegalDocumentWorkflowSettings;
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
  const { t } = useLanguage();
  const [docs, setDocs] = useState<LegalDocumentDto[]>([]);
  const [events, setEvents] = useState<LegalDocumentEventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<LegalDocumentWorkflowSettings>({ fourEyesEnabled: false });

  const [eventsError, setEventsError] = useState<string | null>(null);

  const loadEvents = options?.loadEvents ?? false;

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const [list, workflowSettings] = await Promise.all([
        api.legalDocuments.list(orgId),
        api.legalDocuments.getSettings(orgId).catch(() => ({ fourEyesEnabled: false })),
      ]);
      setDocs(Array.isArray(list) ? list : []);
      setSettings(workflowSettings);
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

  const summary = useMemo(() => buildLegalDocumentsReadinessSummary(docs, t), [docs, t]);

  return {
    docs,
    summary,
    events,
    settings,
    loading,
    eventsLoading,
    error,
    eventsError,
    refresh,
  };
}
