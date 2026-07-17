import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import type { PublicDocumentExtraction, PublicDocumentSubtypeSchema } from '../lib/document-extraction.types';
import {
  buildSchemaReviewGroups,
  flattenSchemaReviewGroups,
  hasSavedFieldReview,
  parseSchemaReviewFieldsForSave,
  schemaReviewValuesEqual,
  type SchemaReviewField,
  type SchemaReviewGroup,
} from '../lib/document-schema-field-review';
import type { Plausibility } from '../components/documents/document-extraction.shared';
import { resolveEntityLinksScope } from '../lib/document-entity-links';

function toPlausibility(raw: unknown): Plausibility | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as Plausibility;
}

export interface UseDocumentSchemaReviewOptions {
  record: PublicDocumentExtraction | null;
  orgId: string;
  vehicleId?: string | null;
  extractionId: string | null;
  locale?: string;
  enabled?: boolean;
  onRecordUpdated?: (record: PublicDocumentExtraction) => void;
}

export function useDocumentSchemaReview({
  record,
  orgId,
  vehicleId,
  extractionId,
  locale = 'de',
  enabled = true,
  onRecordUpdated,
}: UseDocumentSchemaReviewOptions) {
  const [schema, setSchema] = useState<PublicDocumentSubtypeSchema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [groups, setGroups] = useState<SchemaReviewGroup[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState<SchemaReviewField[]>([]);
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [planInvalidatedHint, setPlanInvalidatedHint] = useState(false);
  const [showSource, setShowSource] = useState(false);

  const docType = record?.effectiveDocumentType || record?.documentType || null;
  const subtype = record?.documentSubtype ?? null;
  const canReview = enabled && record?.status === 'READY_FOR_REVIEW' && Boolean(docType);

  useEffect(() => {
    if (!canReview || !docType) {
      setSchema(null);
      return;
    }
    let cancelled = false;
    setSchemaError(null);
    api.documentExtraction
      .resolveSchema({ legacyDocumentType: docType, subtype })
      .then((resolved) => {
        if (!cancelled) setSchema(resolved);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setSchema(null);
          setSchemaError(err instanceof Error ? err.message : 'Schema konnte nicht geladen werden.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [canReview, docType, subtype]);

  const rebuildGroups = useCallback(
    (sourceRecord: PublicDocumentExtraction, sourceSchema: PublicDocumentSubtypeSchema | null) => {
      const nextGroups = buildSchemaReviewGroups({
        schema: sourceSchema,
        extractedData: (sourceRecord.extractedData as Record<string, unknown> | null) ?? null,
        confirmedData: (sourceRecord.confirmedData as Record<string, unknown> | null) ?? null,
        fieldProvenance: sourceRecord.fieldProvenance ?? null,
        plausibility: toPlausibility(sourceRecord.plausibility),
        locale,
        showSourceByDefault: showSource,
      });
      setGroups(nextGroups);
      setSavedSnapshot(flattenSchemaReviewGroups(nextGroups));
    },
    [locale, showSource],
  );

  useEffect(() => {
    if (!record || !schema) {
      setGroups([]);
      setSavedSnapshot([]);
      return;
    }
    rebuildGroups(record, schema);
  }, [record, schema, rebuildGroups]);

  const fields = useMemo(() => flattenSchemaReviewGroups(groups), [groups]);
  const isDirty = useMemo(
    () => !schemaReviewValuesEqual(fields, savedSnapshot),
    [fields, savedSnapshot],
  );
  const hasSavedReview = hasSavedFieldReview(record?.confirmedData);

  const updateFieldValue = useCallback((key: string, value: string) => {
    setGroups((current) =>
      current.map((group) => ({
        ...group,
        fields: group.fields.map((field) =>
          field.key === key
            ? {
                ...field,
                value,
                isMissing: field.required && value.trim() === '',
              }
            : field,
        ),
      })),
    );
  }, []);

  const toggleSource = useCallback(() => {
    setShowSource((current) => {
      const next = !current;
      setGroups((groupsCurrent) =>
        groupsCurrent.map((group) => ({
          ...group,
          fields: group.fields.map((field) => ({ ...field, showSource: next })),
        })),
      );
      return next;
    });
  }, []);

  const saveReview = useCallback(async () => {
    if (!record || !extractionId || !schema || fields.length === 0) return null;
    const scope = resolveEntityLinksScope({
      orgId,
      vehicleId,
      recordVehicleId: record.vehicleId,
    });
    const confirmedData = parseSchemaReviewFieldsForSave(fields, { locale });
    setPending(true);
    setSaveError(null);
    try {
      const updated = scope.useOrgRoute
        ? await api.documentExtraction.saveReviewByOrg(orgId, extractionId, { confirmedData })
        : await api.vehicleIntelligence.saveDocumentReview(scope.vehicleId!, extractionId, {
            confirmedData,
          });
      const nextGroups = buildSchemaReviewGroups({
        schema,
        extractedData: (updated.extractedData as Record<string, unknown> | null) ?? null,
        confirmedData: (updated.confirmedData as Record<string, unknown> | null) ?? null,
        fieldProvenance: updated.fieldProvenance ?? null,
        plausibility: toPlausibility(updated.plausibility),
        locale,
        showSourceByDefault: showSource,
      });
      setGroups(nextGroups);
      setSavedSnapshot(flattenSchemaReviewGroups(nextGroups));
      setPlanInvalidatedHint(true);
      onRecordUpdated?.(updated);
      return updated;
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
      return null;
    } finally {
      setPending(false);
    }
  }, [
    extractionId,
    fields,
    locale,
    onRecordUpdated,
    orgId,
    record,
    schema,
    showSource,
    vehicleId,
  ]);

  const clearPlanInvalidatedHint = useCallback(() => setPlanInvalidatedHint(false), []);

  return {
    schema,
    schemaError,
    groups,
    fields,
    isDirty,
    hasSavedReview,
    pending,
    saveError,
    planInvalidatedHint,
    clearPlanInvalidatedHint,
    showSource,
    toggleSource,
    updateFieldValue,
    saveReview,
    canReview,
  };
}
