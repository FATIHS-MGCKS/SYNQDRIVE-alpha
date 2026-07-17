import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { findVehicleIdByPlate } from '../lib/document-extraction-field-format';
import {
  formatConfidencePercent,
  getStepperIndex,
  resolveEffectiveType,
} from '../lib/document-extraction-lifecycle';
import {
  buildAcceptAttribute,
  buildSupportedFormatsLabel,
  validateUploadFile,
  type UploadValidationCode,
} from '../lib/document-extraction-validation';
import type {
  DocumentExtractionMetadata,
  PublicDocumentExtraction,
  PublicDocumentExtractionSummary,
} from '../lib/document-extraction.types';
import type { TranslationKey } from '../i18n/translations/en';
import {
  batteryHealthQueryKeys,
  invalidateBatteryHealthQueries,
  serializeBatteryHealthQueryKey,
  withBatteryHealthCacheRollback,
} from '../lib/battery-health-query';
import { useDocumentIntakeFlow } from './useDocumentIntakeFlow';
import type { FlowStatus } from '../components/documents/document-extraction.shared';
import { canShowApplyDone } from '../lib/document-apply-result';
import { readDocumentIntakeEntry, type DocumentIntakeEntryState } from '../lib/document-intake-entry';

const AUTO_TYPE = 'AUTO';
const UPLOAD_SOURCE = 'rental_ui';

export interface VehicleOption {
  id: string;
  name: string;
  licensePlate?: string | null;
}

export interface UseDocumentUploadPageOptions {
  orgId: string;
  locale?: string;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

function validationKey(code: UploadValidationCode): TranslationKey {
  const map: Record<UploadValidationCode, TranslationKey> = {
    NO_VEHICLE: 'docUpload.validation.noVehicle',
    NO_FILE: 'docUpload.validation.noFile',
    MULTIPLE_FILES: 'docUpload.validation.multipleFiles',
    EMPTY_FILE: 'docUpload.validation.emptyFile',
    FILE_TOO_LARGE: 'docUpload.validation.fileTooLarge',
    INVALID_EXTENSION: 'docUpload.validation.invalidExtension',
    INVALID_MIME: 'docUpload.validation.invalidMime',
  };
  return map[code];
}

export function useDocumentUploadPage({ orgId, locale = 'de', t }: UseDocumentUploadPageOptions) {
  const autoReassignAttemptedRef = useRef<string | null>(null);

  const [metadata, setMetadata] = useState<DocumentExtractionMetadata | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [documentType, setDocumentType] = useState(AUTO_TYPE);
  const [pendingTypeSelection, setPendingTypeSelection] = useState(AUTO_TYPE);
  const [intakeEntry, setIntakeEntry] = useState<DocumentIntakeEntryState>(() =>
    readDocumentIntakeEntry(typeof window !== 'undefined' ? window.location.search : ''),
  );
  const [history, setHistory] = useState<PublicDocumentExtractionSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [typeCorrectionPending, setTypeCorrectionPending] = useState(false);
  const [pageValidationError, setPageValidationError] = useState<string | null>(null);

  const reloadHistory = useCallback(async () => {
    if (!orgId) return;
    setHistoryLoading(true);
    try {
      const res = await api.documentExtraction.listByOrg(orgId, { limit: 20, page: 1 });
      setHistory(res.data ?? []);
    } catch {
      /* keep previous */
    } finally {
      setHistoryLoading(false);
    }
  }, [orgId]);

  const intake = useDocumentIntakeFlow({
    vehicleId: selectedVehicleId,
    orgId,
    initialDocType: documentType,
    locale,
    uploadSource: UPLOAD_SOURCE,
    optionalContextType: intakeEntry.optionalContextType ?? undefined,
    optionalContextId: intakeEntry.optionalContextId ?? undefined,
    sourceSurface: intakeEntry.sourceSurface ?? 'rental_ui',
    mode: 'page',
    pollThroughApply: true,
    respectAllowedActions: true,
    onRecordApplied: (record) => {
      void reloadHistory();
      if (record.vehicleId && orgId) {
        invalidateBatteryHealthQueries({
          orgId,
          vehicleId: record.vehicleId,
          reason: 'document-confirmed',
          scopes: ['health', 'summary', 'detail'],
        });
      }
    },
  });

  const typeLabel = useCallback(
    (labelKey: string, fallback?: string) => {
      const key = labelKey as TranslationKey;
      const translated = t(key);
      return translated === key ? (fallback ?? labelKey) : translated;
    },
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    setMetadataLoading(true);
    api.documentExtraction
      .metadata()
      .then((m) => {
        if (!cancelled) setMetadata(m);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setMetadataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!orgId) return;
    api.vehicles.listByOrg(orgId).then((res: { data?: Array<Record<string, unknown>> }) => {
      const list = (res?.data ?? []).map((v) => ({
        id: String(v.id),
        name: String(v.vehicleName || `${v.make} ${v.model} (${v.year})`),
        licensePlate: (v.licensePlate as string | null | undefined) ?? null,
      }));
      setVehicles(list);
    }).catch(() => []);
    void reloadHistory();
  }, [orgId, reloadHistory]);

  useEffect(() => {
    const syncEntry = () => {
      const next = readDocumentIntakeEntry(window.location.search);
      setIntakeEntry(next);
      if (next.contextVehicleId) {
        setSelectedVehicleId(next.contextVehicleId);
      }
    };
    syncEntry();
    window.addEventListener('popstate', syncEntry);
    return () => window.removeEventListener('popstate', syncEntry);
  }, []);

  useEffect(() => {
    if (intake.flow !== 'ready' || !intake.record || !orgId || !intake.extractionId) return;
    const effectiveType = resolveEffectiveType(intake.record);
    if (effectiveType !== 'FINE') return;
    const attemptKey = `${intake.extractionId}:${intake.record.vehicleId}`;
    if (autoReassignAttemptedRef.current === attemptKey) return;

    const extracted = (intake.record.extractedData ?? {}) as Record<string, unknown>;
    const plate = typeof extracted.licensePlate === 'string' ? extracted.licensePlate : null;
    const matchedId = findVehicleIdByPlate(vehicles, plate);
    if (!matchedId || matchedId === intake.record.vehicleId) return;

    autoReassignAttemptedRef.current = attemptKey;
    let cancelled = false;
    void api.documentExtraction
      .reassignVehicle(orgId, intake.extractionId, matchedId)
      .then((updated) => {
        if (cancelled) return;
        setSelectedVehicleId(matchedId);
        intake.applyRecord(updated);
      })
      .catch(() => {
        autoReassignAttemptedRef.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [intake, orgId, vehicles]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (intake.flow === 'awaiting_type' && intake.record?.detectedDocumentType) {
      setPendingTypeSelection(intake.record.detectedDocumentType);
    }
  }, [intake.flow, intake.record?.detectedDocumentType]);

  const docTypeOptions = useMemo(() => {
    const auto = metadata?.classificationOptions ?? [{ value: AUTO_TYPE, labelKey: 'documentExtraction.classification.AUTO' }];
    const types = metadata?.documentTypes ?? [];
    return [...auto, ...types];
  }, [metadata]);

  const acceptAttr = useMemo(() => buildAcceptAttribute(metadata?.extensions), [metadata]);
  const supportedFormatsLabel = useMemo(
    () => buildSupportedFormatsLabel(metadata?.extensions ?? ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.txt'], metadata?.maxUploadMb ?? 10),
    [metadata],
  );

  const handleReset = useCallback(() => {
    intake.handleReset();
    setTypeCorrectionPending(false);
    setDocumentType(AUTO_TYPE);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }, [intake, previewUrl]);

  const handleFile = useCallback(
    async (file: File, fileCount = 1) => {
      const result = validateUploadFile(file, metadata, {
        vehicleSelected: Boolean(selectedVehicleId) || Boolean(orgId),
        requireVehicle: false,
        fileCount,
      });
      if (!result.ok && result.code) {
        setPageValidationError(t(validationKey(result.code), { maxMb: metadata?.maxUploadMb ?? 10 }));
        return;
      }
      setPageValidationError(null);
      await intake.handleFile(file);
      void reloadHistory();
    },
    [intake, metadata, orgId, reloadHistory, selectedVehicleId, t],
  );

  const handleDropFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      if (list.length > 1) {
        setPageValidationError(t('docUpload.validation.multipleFiles'));
        return;
      }
      void handleFile(list[0]);
    },
    [handleFile, t],
  );

  const handleSetDocumentType = useCallback(
    async (type: string, reextract = false) => {
      if (!intake.extractionId) return;
      const mutationVehicleId = selectedVehicleId || intake.record?.vehicleId || '';
      intake.setDocumentType(type);
      try {
        if (mutationVehicleId) {
          await api.vehicleIntelligence.setDocumentType(mutationVehicleId, intake.extractionId, {
            documentType: type,
            reextract,
          });
          intake.startPolling(intake.extractionId, mutationVehicleId);
        } else if (orgId) {
          await api.documentExtraction.setDocumentTypeByOrg(orgId, intake.extractionId, {
            documentType: type,
            reextract,
          });
          intake.startPolling(intake.extractionId, null);
        } else {
          return;
        }
      } catch {
        /* keep current record */
      }
      setTypeCorrectionPending(false);
    },
    [intake, orgId, selectedVehicleId],
  );

  const handleCancel = useCallback(async () => {
    const mutationVehicleId = selectedVehicleId || intake.record?.vehicleId;
    if (!mutationVehicleId || !intake.extractionId || !intake.record?.allowedActions?.includes('cancel')) {
      handleReset();
      return;
    }
    try {
      await api.vehicleIntelligence.cancelDocumentExtraction(mutationVehicleId, intake.extractionId);
      intake.stopPolling();
      void reloadHistory();
      handleReset();
    } catch {
      /* intake surfaces errors */
    }
  }, [handleReset, intake, reloadHistory, selectedVehicleId]);

  const handleConfirm = useCallback(async () => {
    if (!intake.extractionId) return;
    const mutationVehicleId = selectedVehicleId || intake.record?.vehicleId;
    if (!mutationVehicleId && !orgId) return;
    await withBatteryHealthCacheRollback(
      mutationVehicleId
        ? [
            serializeBatteryHealthQueryKey(batteryHealthQueryKeys.summary(orgId, mutationVehicleId)),
            serializeBatteryHealthQueryKey(batteryHealthQueryKeys.detail(orgId, mutationVehicleId)),
          ]
        : [],
      async () => {
        await intake.handleConfirm();
      },
    );
  }, [intake, orgId, selectedVehicleId]);

  const handleReassignVehicle = useCallback(
    async (newVehicleId: string) => {
      if (!orgId || !intake.extractionId || newVehicleId === selectedVehicleId) {
        setSelectedVehicleId(newVehicleId);
        return;
      }
      try {
        const updated = await api.documentExtraction.reassignVehicle(orgId, intake.extractionId, newVehicleId);
        setSelectedVehicleId(newVehicleId);
        intake.applyRecord(updated);
      } catch {
        /* intake surfaces errors */
      }
    },
    [intake, orgId, selectedVehicleId],
  );

  const handleDownload = useCallback(async () => {
    if (!intake.extractionId || !intake.record?.hasStoredFile) {
      return null;
    }
    const mutationVehicleId = selectedVehicleId || intake.record?.vehicleId;
    try {
      const blob = mutationVehicleId
        ? await api.vehicleIntelligence.downloadDocumentExtraction(mutationVehicleId, intake.extractionId)
        : await api.documentExtraction.downloadByOrg(orgId, intake.extractionId);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      return url;
    } catch {
      return null;
    }
  }, [intake.extractionId, intake.record?.hasStoredFile, intake.record?.vehicleId, orgId, previewUrl, selectedVehicleId]);

  const handleOpenHistoryItem = useCallback(
    (item: PublicDocumentExtractionSummary) => {
      setSelectedVehicleId(item.vehicleId ?? '');
      void intake.openExtraction(item.id, item.sourceFileName, item.vehicleId ?? null);
    },
    [intake],
  );

  const flowStatusLabel = useCallback(
    (status: FlowStatus) => {
      const key = `docUpload.flow.${status}` as TranslationKey;
      const translated = t(key);
      return translated === key ? status : translated;
    },
    [t],
  );

  const serverStatusLabel = useCallback(
    (status: string) => typeLabel(`documentExtraction.status.${status}`, status),
    [typeLabel],
  );

  const stageLabel = useCallback(
    (stage: string) => typeLabel(`documentExtraction.stage.${stage}`, stage),
    [typeLabel],
  );

  const errorPhaseLabel = useCallback(
    (phase: string | null | undefined) =>
      phase ? typeLabel(`documentExtraction.errorPhase.${phase}`, phase) : '',
    [typeLabel],
  );

  const validateAndSetError = useCallback(
    (file: File | null | undefined, fileCount = 1) => {
      const result = validateUploadFile(file, metadata, {
        vehicleSelected: Boolean(selectedVehicleId) || Boolean(orgId),
        requireVehicle: false,
        fileCount,
      });
      if (!result.ok && result.code) {
        setPageValidationError(t(validationKey(result.code), { maxMb: metadata?.maxUploadMb ?? 10 }));
        return false;
      }
      setPageValidationError(null);
      return true;
    },
    [metadata, orgId, selectedVehicleId, t],
  );

  const assignedVehicleId = selectedVehicleId || intake.record?.vehicleId || '';
  const canConfirm =
    Boolean(assignedVehicleId) &&
    intake.canConfirmActionPlan;

  const processingStepLabels = useMemo(
    (): Record<IntakeProcessingStepId, string> => ({
      file_check: t('docUpload.processingStep.fileCheck'),
      file_stored: t('docUpload.processingStep.fileStored'),
      text_recognition: t('docUpload.processingStep.textRecognition'),
      classification: t('docUpload.processingStep.classification'),
      data_preparation: t('docUpload.processingStep.dataPreparation'),
      ready_for_review: t('docUpload.processingStep.readyForReview'),
    }),
    [t],
  );

  const confirmedDocType = intake.record ? resolveEffectiveType(intake.record) : documentType;
  const stepperIndex = getStepperIndex(intake.flow);
  const classificationConfidence = formatConfidencePercent(intake.record?.classificationConfidence ?? null);

  const vehicleLookup = useMemo(() => {
    const map = new Map<string, { name: string; licensePlate?: string | null }>();
    for (const vehicle of vehicles) {
      map.set(vehicle.id, { name: vehicle.name, licensePlate: vehicle.licensePlate ?? null });
    }
    return map;
  }, [vehicles]);

  const handleEntityLinksUpdated = useCallback(
    (updated: PublicDocumentExtraction) => {
      intake.applyRecord(updated);
    },
    [intake],
  );

  const handleSchemaReviewUpdated = useCallback(
    (updated: PublicDocumentExtraction) => {
      intake.applyRecord(updated);
    },
    [intake],
  );

  return {
    metadata,
    metadataLoading,
    vehicles,
    selectedVehicleId,
    setSelectedVehicleId,
    documentType,
    setDocumentType,
    pendingTypeSelection,
    setPendingTypeSelection,
    intakeEntry,
    flow: intake.flow,
    record: intake.record,
    uploadedFileName: intake.uploadedFileName,
    errorMessage: intake.errorMessage,
    validationError: pageValidationError ?? intake.validationError,
    editingFields: intake.editingFields,
    setEditingFields: intake.setEditingFields,
    editedFields: intake.editedFields,
    setEditedFields: intake.setEditedFields,
    plausibility: intake.plausibility,
    extractionId: intake.extractionId,
    history,
    historyLoading,
    reloadHistory,
    pollNetworkWarning: intake.pollNetworkWarning,
    showLongRunningHint: intake.showLongRunningHint,
    previewUrl,
    typeCorrectionPending,
    setTypeCorrectionPending,
    acceptAttr,
    supportedFormatsLabel,
    docTypeOptions,
    isBusy: intake.isBusy,
    blockerPresent: intake.blockerPresent,
    stepperIndex,
    confirmedDocType,
    classificationConfidence,
    uploadContext: intake.uploadContext,
    duplicateBlocked: intake.duplicateBlocked,
    uploadDuplicateWarning: intake.uploadDuplicateWarning,
    typeLabel,
    flowStatusLabel,
    serverStatusLabel,
    stageLabel,
    errorPhaseLabel,
    handleFile,
    handleDropFiles,
    handleRetry: intake.handleRetry,
    handleConfirm,
    handleReassignVehicle,
    handleReset,
    handleSetDocumentType,
    handleReextract: intake.handleReextract,
    handleCancel,
    handleDownload,
    handleOpenHistoryItem,
    handleAuthorizedReupload: intake.handleAuthorizedReupload,
    validateAndSetError,
    assignedVehicleId,
    canConfirm,
    processingStepLabels,
    processingStartedAt: intake.processingStartedAt,
    vehicleLookup,
    handleEntityLinksUpdated,
    handleSchemaReviewUpdated,
    handleActionPlanPreviewState: intake.handleActionPlanPreviewState,
    actionPlanPreview: intake.actionPlanPreview,
    applyRetryPending: intake.applyRetryPending,
    handleRetryFailedActions: intake.handleRetryFailedActions,
    canShowApplyDone: canShowApplyDone(intake.record?.status, intake.record?.applyResult),
  };
}
