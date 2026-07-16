import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import {
  buildReviewFields,
  parseReviewFieldsForConfirm,
  type FlowStatus,
  type Plausibility,
  type ReviewField,
} from '../components/documents/document-extraction.shared';
import { findVehicleIdByPlate } from '../lib/document-extraction-field-format';
import {
  formatConfidencePercent,
  getStepperIndex,
  isActiveExtractionStatus,
  isBusyFlow,
  mapServerToFlowStatus,
  resolveEffectiveType,
} from '../lib/document-extraction-lifecycle';
import { createExtractionPoller } from '../lib/document-extraction-polling';
import {
  readActiveExtractionPointer,
  writeActiveExtractionPointer,
} from '../lib/document-extraction-session';
import type {
  DocumentExtractionMetadata,
  PublicDocumentExtraction,
  PublicDocumentExtractionSummary,
} from '../lib/document-extraction.types';
import {
  buildAcceptAttribute,
  buildSupportedFormatsLabel,
  validateUploadFile,
  type UploadValidationCode,
} from '../lib/document-extraction-validation';
import type { TranslationKey } from '../i18n/translations/en';

const AUTO_TYPE = 'AUTO';
const UPLOAD_SOURCE = 'rental_ui';
const LONG_RUNNING_MS = 90_000;
const NETWORK_WARN_THRESHOLD = 3;

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

function toPlausibility(raw: unknown): Plausibility | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as Plausibility;
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
  const abortRef = useRef<AbortController | null>(null);
  const pollerStopRef = useRef<(() => void) | null>(null);
  const processingStartedRef = useRef<number | null>(null);
  const autoReassignAttemptedRef = useRef<string | null>(null);

  const [metadata, setMetadata] = useState<DocumentExtractionMetadata | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [documentType, setDocumentType] = useState(AUTO_TYPE);
  const [pendingTypeSelection, setPendingTypeSelection] = useState('SERVICE');
  const [flow, setFlow] = useState<FlowStatus>('idle');
  const [record, setRecord] = useState<PublicDocumentExtraction | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [editingFields, setEditingFields] = useState(false);
  const [editedFields, setEditedFields] = useState<ReviewField[]>([]);
  const [plausibility, setPlausibility] = useState<Plausibility | null>(null);
  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [history, setHistory] = useState<PublicDocumentExtractionSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pollNetworkWarning, setPollNetworkWarning] = useState(false);
  const [showLongRunningHint, setShowLongRunningHint] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [typeCorrectionPending, setTypeCorrectionPending] = useState(false);

  const stopPolling = useCallback(() => {
    pollerStopRef.current?.();
    pollerStopRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const typeLabel = useCallback(
    (labelKey: string, fallback?: string) => {
      const key = labelKey as TranslationKey;
      const translated = t(key);
      return translated === key ? (fallback ?? labelKey) : translated;
    },
    [t],
  );

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

  const applyRecord = useCallback(
    (next: PublicDocumentExtraction) => {
      setRecord(next);
      const effectiveType = resolveEffectiveType(next);
      const mapped = mapServerToFlowStatus(next.status, next.processingStage);
      if (next.sourceFileName) setUploadedFileName(next.sourceFileName);

      if (mapped === 'ready') {
        setEditedFields(buildReviewFields(effectiveType, next.extractedData ?? undefined, { locale }));
        setPlausibility(toPlausibility(next.plausibility));
        setSelectedVehicleId(next.vehicleId);
        setFlow('ready');
        stopPolling();
        writeActiveExtractionPointer({
          vehicleId: next.vehicleId,
          extractionId: next.id,
          updatedAt: new Date().toISOString(),
        });
        return;
      }

      if (mapped === 'awaiting_type') {
        setEditedFields([]);
        setPlausibility(null);
        setFlow('awaiting_type');
        if (next.detectedDocumentType) setPendingTypeSelection(next.detectedDocumentType);
        stopPolling();
        writeActiveExtractionPointer({
          vehicleId: next.vehicleId,
          extractionId: next.id,
          updatedAt: new Date().toISOString(),
        });
        return;
      }

      if (mapped === 'failed' || mapped === 'cancelled') {
        setErrorMessage(next.errorMessage || t('docUpload.extractionFailed'));
        setFlow(mapped);
        stopPolling();
        return;
      }

      if (mapped === 'done') {
        setFlow('done');
        stopPolling();
        writeActiveExtractionPointer(null);
        void reloadHistory();
        return;
      }

      setFlow(mapped);
      if (mapped === 'applying' && next.status === 'CONFIRMED') {
        /* keep polling until APPLIED/FAILED */
      }
    },
    [locale, reloadHistory, stopPolling, t],
  );

  const startPolling = useCallback(
    (vehicleId: string, id: string) => {
      stopPolling();
      processingStartedRef.current = Date.now();
      setPollNetworkWarning(false);
      setShowLongRunningHint(false);

      const controller = new AbortController();
      abortRef.current = controller;

      const poller = createExtractionPoller({
        signal: controller.signal,
        fetchRecord: () => api.vehicleIntelligence.getDocumentExtraction(vehicleId, id) as Promise<PublicDocumentExtraction>,
        onRecord: (r) => {
          applyRecord(r);
          if (processingStartedRef.current && Date.now() - processingStartedRef.current > LONG_RUNNING_MS) {
            setShowLongRunningHint(true);
          }
        },
        onError: (_err, failures) => {
          if (failures >= NETWORK_WARN_THRESHOLD) setPollNetworkWarning(true);
        },
      });
      pollerStopRef.current = poller.stop;
    },
    [applyRecord, stopPolling],
  );

  const loadExtraction = useCallback(
    async (vehicleId: string, id: string, fileName?: string | null) => {
      setExtractionId(id);
      setSelectedVehicleId(vehicleId);
      setErrorMessage(null);
      setValidationError(null);
      setEditingFields(false);
      if (fileName) setUploadedFileName(fileName);
      writeActiveExtractionPointer({ vehicleId, extractionId: id, updatedAt: new Date().toISOString() });

      try {
        const detail = (await api.vehicleIntelligence.getDocumentExtraction(vehicleId, id)) as PublicDocumentExtraction;
        applyRecord(detail);
        if (isActiveExtractionStatus(detail.status)) {
          startPolling(vehicleId, id);
        }
      } catch {
        setErrorMessage(t('docUpload.loadFailed'));
        setFlow('failed');
      }
    },
    [applyRecord, startPolling, t],
  );

  useEffect(() => {
    let cancelled = false;
    setMetadataLoading(true);
    api.documentExtraction
      .metadata()
      .then((m) => {
        if (!cancelled) setMetadata(m);
      })
      .catch(() => {
        /* fallback constants used by validation helper */
      })
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
    if (flow !== 'ready' || !record || !orgId || !extractionId) return;
    const effectiveType = resolveEffectiveType(record);
    if (effectiveType !== 'FINE') return;
    const attemptKey = `${extractionId}:${record.vehicleId}`;
    if (autoReassignAttemptedRef.current === attemptKey) return;

    const extracted = (record.extractedData ?? {}) as Record<string, unknown>;
    const plate = typeof extracted.licensePlate === 'string' ? extracted.licensePlate : null;
    const matchedId = findVehicleIdByPlate(vehicles, plate);
    if (!matchedId || matchedId === record.vehicleId) return;

    autoReassignAttemptedRef.current = attemptKey;
    let cancelled = false;
    void api.documentExtraction
      .reassignVehicle(orgId, extractionId, matchedId)
      .then((updated) => {
        if (cancelled) return;
        setSelectedVehicleId(matchedId);
        applyRecord(updated);
      })
      .catch(() => {
        autoReassignAttemptedRef.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [applyRecord, extractionId, flow, orgId, record, vehicles]);

  useEffect(() => {
    const pointer = readActiveExtractionPointer();
    if (!pointer || !orgId) return;
    void loadExtraction(pointer.vehicleId, pointer.extractionId);
  }, [loadExtraction, orgId]);

  useEffect(() => () => {
    stopPolling();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl, stopPolling]);

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

  const validateAndSetError = useCallback(
    (file: File | null | undefined, fileCount = 1) => {
      const result = validateUploadFile(file, metadata, {
        vehicleSelected: Boolean(selectedVehicleId),
        fileCount,
      });
      if (!result.ok && result.code) {
        const msg = t(validationKey(result.code), { maxMb: metadata?.maxUploadMb ?? 10 });
        setValidationError(msg);
        return false;
      }
      setValidationError(null);
      return true;
    },
    [metadata, selectedVehicleId, t],
  );

  const handleReset = useCallback(() => {
    stopPolling();
    setFlow('idle');
    setRecord(null);
    setUploadedFileName('');
    setEditingFields(false);
    setEditedFields([]);
    setPlausibility(null);
    setExtractionId(null);
    setErrorMessage(null);
    setValidationError(null);
    setPollNetworkWarning(false);
    setShowLongRunningHint(false);
    setTypeCorrectionPending(false);
    setDocumentType(AUTO_TYPE);
    writeActiveExtractionPointer(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }, [previewUrl, stopPolling]);

  const handleFile = useCallback(
    async (file: File, fileCount = 1) => {
      if (!selectedVehicleId) return;
      setFlow('validating');
      if (!validateAndSetError(file, fileCount)) {
        setFlow('idle');
        return;
      }

      setUploadedFileName(file.name);
      setErrorMessage(null);
      setEditingFields(false);
      setPlausibility(null);
      setEditedFields([]);
      setExtractionId(null);
      setRecord(null);
      setFlow('uploading');

      try {
        const res = await api.vehicleIntelligence.uploadDocumentExtraction(
          selectedVehicleId,
          file,
          documentType,
          UPLOAD_SOURCE,
        );
        setExtractionId(res.id);
        writeActiveExtractionPointer({
          vehicleId: selectedVehicleId,
          extractionId: res.id,
          updatedAt: new Date().toISOString(),
        });
        setFlow(mapServerToFlowStatus(res.status as PublicDocumentExtraction['status']));
        startPolling(selectedVehicleId, res.id);
        void reloadHistory();
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : t('docUpload.uploadFailed'));
        setFlow('failed');
      }
    },
    [documentType, reloadHistory, selectedVehicleId, startPolling, t, validateAndSetError],
  );

  const handleDropFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      if (list.length > 1) {
        validateAndSetError(list[0], list.length);
        return;
      }
      void handleFile(list[0]);
    },
    [handleFile, validateAndSetError],
  );

  const handleRetry = useCallback(async () => {
    if (!selectedVehicleId || !extractionId) {
      handleReset();
      return;
    }
    if (!record?.allowedActions?.includes('retry')) return;
    setErrorMessage(null);
    setFlow('retrying');
    try {
      await api.vehicleIntelligence.retryDocumentExtraction(selectedVehicleId, extractionId);
      startPolling(selectedVehicleId, extractionId);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : t('docUpload.retryFailed'));
      setFlow('failed');
    }
  }, [extractionId, handleReset, record?.allowedActions, selectedVehicleId, startPolling, t]);

  const handleSetDocumentType = useCallback(async (type: string, reextract = false) => {
    if (!selectedVehicleId || !extractionId) return;
    setErrorMessage(null);
    setFlow(reextract ? 'retrying' : 'queued');
    try {
      await api.vehicleIntelligence.setDocumentType(selectedVehicleId, extractionId, {
        documentType: type,
        reextract,
      });
      setTypeCorrectionPending(false);
      startPolling(selectedVehicleId, extractionId);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : t('docUpload.typeSetFailed'));
      setFlow(record ? mapServerToFlowStatus(record.status, record.processingStage) : 'failed');
    }
  }, [extractionId, record, selectedVehicleId, startPolling, t]);

  const handleReextract = useCallback(async () => {
    if (!record?.allowedActions?.includes('reextract')) return;
    const type = resolveEffectiveType(record);
    await handleSetDocumentType(type, true);
  }, [handleSetDocumentType, record]);

  const handleCancel = useCallback(async () => {
    if (!selectedVehicleId || !extractionId || !record?.allowedActions?.includes('cancel')) {
      handleReset();
      return;
    }
    try {
      await api.vehicleIntelligence.cancelDocumentExtraction(selectedVehicleId, extractionId);
      setFlow('cancelled');
      stopPolling();
      writeActiveExtractionPointer(null);
      void reloadHistory();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : t('docUpload.cancelFailed'));
    }
  }, [extractionId, handleReset, record?.allowedActions, reloadHistory, selectedVehicleId, stopPolling, t]);

  const handleConfirm = useCallback(async () => {
    if (!selectedVehicleId || !extractionId || !record?.allowedActions?.includes('confirm')) return;
    setFlow('applying');
    setErrorMessage(null);

    const confirmedData = parseReviewFieldsForConfirm(editedFields, { locale });

    try {
      await api.vehicleIntelligence.confirmDocumentExtraction(selectedVehicleId, extractionId, { confirmedData });
      startPolling(selectedVehicleId, extractionId);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : t('docUpload.applyFailed'));
      setFlow('ready');
    }
  }, [editedFields, extractionId, locale, record?.allowedActions, selectedVehicleId, startPolling, t]);

  const handleReassignVehicle = useCallback(
    async (newVehicleId: string) => {
      if (!orgId || !extractionId || newVehicleId === selectedVehicleId) {
        setSelectedVehicleId(newVehicleId);
        return;
      }
      try {
        const updated = await api.documentExtraction.reassignVehicle(orgId, extractionId, newVehicleId);
        setSelectedVehicleId(newVehicleId);
        applyRecord(updated);
        writeActiveExtractionPointer({
          vehicleId: newVehicleId,
          extractionId,
          updatedAt: new Date().toISOString(),
        });
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : t('docUpload.applyFailed'));
      }
    },
    [applyRecord, extractionId, orgId, selectedVehicleId, t],
  );

  const handleDownload = useCallback(async () => {
    if (!selectedVehicleId || !extractionId || !record?.hasStoredFile) {
      setErrorMessage(t('docUpload.noStoredFile'));
      return;
    }
    try {
      const blob = await api.vehicleIntelligence.downloadDocumentExtraction(selectedVehicleId, extractionId);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      return url;
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : t('docUpload.downloadFailed'));
      return null;
    }
  }, [extractionId, previewUrl, record?.hasStoredFile, selectedVehicleId, t]);

  const handleOpenHistoryItem = useCallback(
    (item: PublicDocumentExtractionSummary) => {
      void loadExtraction(item.vehicleId, item.id, item.sourceFileName);
    },
    [loadExtraction],
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

  const confirmedDocType = record ? resolveEffectiveType(record) : documentType;
  const isBusy = isBusyFlow(flow);
  const blockerPresent = plausibility?.overallStatus === 'BLOCKER';
  const stepperIndex = getStepperIndex(flow);
  const classificationConfidence = formatConfidencePercent(record?.classificationConfidence ?? null);

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
    flow,
    record,
    uploadedFileName,
    errorMessage,
    validationError,
    editingFields,
    setEditingFields,
    editedFields,
    setEditedFields,
    plausibility,
    extractionId,
    history,
    historyLoading,
    reloadHistory,
    pollNetworkWarning,
    showLongRunningHint,
    previewUrl,
    typeCorrectionPending,
    setTypeCorrectionPending,
    acceptAttr,
    supportedFormatsLabel,
    docTypeOptions,
    isBusy,
    blockerPresent,
    stepperIndex,
    confirmedDocType,
    classificationConfidence,
    typeLabel,
    flowStatusLabel,
    serverStatusLabel,
    stageLabel,
    errorPhaseLabel,
    handleFile,
    handleDropFiles,
    handleRetry,
    handleConfirm,
    handleReassignVehicle,
    handleReset,
    handleSetDocumentType,
    handleReextract,
    handleCancel,
    handleDownload,
    handleOpenHistoryItem,
    validateAndSetError,
  };
}
