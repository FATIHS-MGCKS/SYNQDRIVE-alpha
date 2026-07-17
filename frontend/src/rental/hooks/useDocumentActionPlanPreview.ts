import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type {
  PublicDocumentActionPlanPreview,
  PublicDocumentExtraction,
} from '../lib/document-extraction.types';
import { hasSavedFieldReview } from '../lib/document-schema-field-review';
import { resolveEntityLinksScope } from '../lib/document-entity-links';
import { toggleDisabledOptionalAction } from '../lib/document-action-plan-preview';

export interface UseDocumentActionPlanPreviewOptions {
  record: PublicDocumentExtraction | null;
  orgId: string;
  vehicleId?: string | null;
  extractionId: string | null;
  enabled?: boolean;
  onPreviewChange?: (preview: PublicDocumentActionPlanPreview | null) => void;
  onStateChange?: (state: {
    preview: PublicDocumentActionPlanPreview | null;
    loading: boolean;
  }) => void;
}

export function useDocumentActionPlanPreview({
  record,
  orgId,
  vehicleId,
  extractionId,
  enabled = true,
  onPreviewChange,
  onStateChange,
}: UseDocumentActionPlanPreviewOptions) {
  const [preview, setPreview] = useState<PublicDocumentActionPlanPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingToggle, setPendingToggle] = useState<string | null>(null);

  const canLoad =
    enabled &&
    Boolean(extractionId) &&
    record?.status === 'READY_FOR_REVIEW' &&
    hasSavedFieldReview(record.confirmedData);

  const applyPreview = useCallback(
    (next: PublicDocumentActionPlanPreview | null, nextLoading: boolean) => {
      setPreview(next);
      onPreviewChange?.(next);
      onStateChange?.({ preview: next, loading: nextLoading });
    },
    [onPreviewChange, onStateChange],
  );

  const loadPreview = useCallback(async () => {
    if (!canLoad || !extractionId) {
      applyPreview(null, false);
      return null;
    }

    const scope = resolveEntityLinksScope({
      orgId,
      vehicleId,
      recordVehicleId: record?.vehicleId,
    });

    setLoading(true);
    setError(null);
    onStateChange?.({ preview, loading: true });
    try {
      const next = scope.useOrgRoute
        ? await api.documentExtraction.getActionPlanPreviewByOrg(orgId, extractionId)
        : await api.vehicleIntelligence.getActionPlanPreview(scope.vehicleId!, extractionId);
      applyPreview(next, false);
      return next;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Aktionsvorschau konnte nicht geladen werden.');
      applyPreview(null, false);
      return null;
    } finally {
      setLoading(false);
    }
  }, [applyPreview, canLoad, extractionId, orgId, record?.vehicleId, vehicleId]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview, record?.confirmedData, record?.plausibility, record?.vehicleId]);

  const setOptionalActionEnabled = useCallback(
    async (semanticAction: string, enabled: boolean) => {
      if (!preview || !extractionId) return null;

      const scope = resolveEntityLinksScope({
        orgId,
        vehicleId,
        recordVehicleId: record?.vehicleId,
      });

      const disabledOptionalActions = toggleDisabledOptionalAction(
        preview.disabledOptionalActions,
        semanticAction,
        enabled,
      );

      setPendingToggle(semanticAction);
      setError(null);
      try {
        const next = scope.useOrgRoute
          ? await api.documentExtraction.updateActionPlanPreferencesByOrg(orgId, extractionId, {
              disabledOptionalActions,
            })
          : await api.vehicleIntelligence.updateActionPlanPreferences(scope.vehicleId!, extractionId, {
              disabledOptionalActions,
            });
        applyPreview(next, false);
        return next;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Einstellung konnte nicht gespeichert werden.');
        return null;
      } finally {
        setPendingToggle(null);
      }
    },
    [applyPreview, extractionId, orgId, preview, record?.vehicleId, vehicleId],
  );

  return {
    preview,
    loading,
    error,
    pendingToggle,
    canLoad,
    reloadPreview: loadPreview,
    setOptionalActionEnabled,
  };
}
