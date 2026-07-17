import { useCallback, useState } from 'react';
import { api } from '../../lib/api';
import type { DocumentEntityLinkOperation, DocumentEntityLinkType } from '../lib/document-entity-links';
import { resolveEntityLinksScope } from '../lib/document-entity-links';
import type { PublicDocumentExtraction } from '../lib/document-extraction.types';

export interface UseDocumentEntityLinksOptions {
  orgId: string;
  vehicleId?: string | null;
  extractionId: string | null;
  recordVehicleId?: string | null;
  onUpdated?: (record: PublicDocumentExtraction) => void;
}

export function useDocumentEntityLinks({
  orgId,
  vehicleId,
  extractionId,
  recordVehicleId,
  onUpdated,
}: UseDocumentEntityLinksOptions) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planInvalidatedHint, setPlanInvalidatedHint] = useState(false);

  const mutate = useCallback(
    async (operations: DocumentEntityLinkOperation[]) => {
      if (!extractionId || operations.length === 0) return null;
      const scope = resolveEntityLinksScope({ orgId, vehicleId, recordVehicleId });
      setPending(true);
      setError(null);
      try {
        const updated = scope.useOrgRoute
          ? await api.documentExtraction.updateEntityLinksByOrg(orgId, extractionId, { operations })
          : await api.vehicleIntelligence.updateEntityLinks(scope.vehicleId!, extractionId, { operations });
        setPlanInvalidatedHint(true);
        onUpdated?.(updated);
        return updated;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Entity-Verknüpfung fehlgeschlagen.');
        return null;
      } finally {
        setPending(false);
      }
    },
    [extractionId, onUpdated, orgId, recordVehicleId, vehicleId],
  );

  const confirmLink = useCallback(
    async (entityType: DocumentEntityLinkType, entityId: string, label?: string) => {
      return mutate([{ operation: 'confirm', entityType, entityId, label }]);
    },
    [mutate],
  );

  const changeLink = useCallback(
    async (
      entityType: DocumentEntityLinkType,
      entityId: string,
      label: string | undefined,
      previousEntityId: string,
    ) => {
      return mutate([
        { operation: 'change', entityType, entityId, label, previousEntityId },
      ]);
    },
    [mutate],
  );

  const removeLink = useCallback(
    async (entityType: DocumentEntityLinkType, previousEntityId?: string) => {
      return mutate([{ operation: 'remove', entityType, previousEntityId }]);
    },
    [mutate],
  );

  const clearPlanInvalidatedHint = useCallback(() => setPlanInvalidatedHint(false), []);

  return {
    pending,
    error,
    planInvalidatedHint,
    clearPlanInvalidatedHint,
    confirmLink,
    changeLink,
    removeLink,
  };
}
