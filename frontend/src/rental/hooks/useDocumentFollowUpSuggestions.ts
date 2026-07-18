import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { PublicDocumentFollowUpSuggestion } from '../lib/document-extraction.types';

export function useDocumentFollowUpSuggestions(input: {
  orgId: string | null;
  vehicleId: string | null;
  extractionId: string | null;
  enabled?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<PublicDocumentFollowUpSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!input.enabled || !input.extractionId || !input.orgId) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = input.vehicleId
        ? await api.vehicleIntelligence.listFollowUpSuggestions(input.vehicleId, input.extractionId)
        : await api.documentExtraction.listFollowUpSuggestions(input.orgId, input.extractionId);
      setSuggestions(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError((err as Error).message || 'Failed to load follow-up suggestions');
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [input.enabled, input.extractionId, input.orgId, input.vehicleId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { suggestions, loading, error, reload };
}
