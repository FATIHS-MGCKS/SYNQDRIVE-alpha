import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { DocumentUploadDuplicateError } from '../../lib/document-upload-duplicate';
import { DocumentUploadRateLimitedError } from '../../lib/document-upload-rate-limit';
import { DocumentIdentificationRejectedError } from '../../lib/document-upload-identification';
import { shouldShowBusinessDuplicateWarning } from '../lib/document-upload-duplicate-flow';
import {
  buildReviewFields,
  parseReviewFieldsForConfirm,
  type FlowStatus,
  type Plausibility,
  type ReviewField,
} from '../components/documents/document-extraction.shared';
import {
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
  PublicUploadDuplicate,
  PublicUploadContextDisplay,
} from '../lib/document-extraction.types';
import {
  buildAcceptAttribute,
  validateUploadFile,
  type UploadValidationCode,
} from '../lib/document-extraction-validation';
import type { UseDocumentIntakeFlowOptions } from './useDocumentIntakeFlow.types';

const LONG_RUNNING_MS = 90_000;
const NETWORK_WARN_THRESHOLD = 3;

function toPlausibility(raw: unknown): Plausibility | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as Plausibility;
}

function defaultValidationMessage(code: UploadValidationCode, maxMb: number): string {
  const messages: Record<UploadValidationCode, string> = {
    NO_VEHICLE: 'Bitte zuerst ein Fahrzeug auswählen.',
    NO_FILE: 'Bitte eine Datei auswählen.',
    MULTIPLE_FILES: 'Bitte nur eine Datei hochladen.',
    EMPTY_FILE: 'Die Datei ist leer.',
    FILE_TOO_LARGE: `Die Datei überschreitet ${maxMb} MB.`,
    INVALID_EXTENSION: 'Dateityp wird nicht unterstützt.',
    INVALID_MIME: 'Dateiformat wird vom Browser nicht unterstützt.',
  };
  return messages[code];
}

function mapUploadError(err: unknown): string {
  if (err instanceof DocumentUploadRateLimitedError) {
    return `${err.payload.message} (${err.payload.scope}, Retry in ${err.payload.retryAfterSeconds}s)`;
  }
  if (err instanceof DocumentIdentificationRejectedError) {
    return err.payload.message;
  }
  if (err instanceof Error) return err.message;
  return 'Upload fehlgeschlagen.';
}

export function useDocumentIntakeFlow({
  vehicleId,
  orgId = null,
  initialDocType = 'SERVICE',
  locale = 'de',
  uploadSource = 'documents_tab',
  mode = 'embedded',
  pollThroughApply = false,
  respectAllowedActions = false,
  onComplete,
  onRecordApplied,
}: UseDocumentIntakeFlowOptions) {
  const abortRef = useRef<AbortController | null>(null);
  const pollerStopRef = useRef<(() => void) | null>(null);
  const pendingFileRef = useRef<File | null>(null);
  const processingStartedRef = useRef<number | null>(null);

  const [metadata, setMetadata] = useState<DocumentExtractionMetadata | null>(null);
  const [flow, setFlow] = useState<FlowStatus>('idle');
  const [record, setRecord] = useState<PublicDocumentExtraction | null>(null);
  const [documentType, setDocumentType] = useState(initialDocType);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [duplicateBlocked, setDuplicateBlocked] = useState<DocumentUploadDuplicateError | null>(null);
  const [uploadDuplicateWarning, setUploadDuplicateWarning] = useState<PublicUploadDuplicate | null>(null);
  const [editingFields, setEditingFields] = useState(false);
  const [editedFields, setEditedFields] = useState<ReviewField[]>([]);
  const [plausibility, setPlausibility] = useState<Plausibility | null>(null);
  const [uploadContext, setUploadContext] = useState<PublicUploadContextDisplay | null>(null);
  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [confirmedDocType, setConfirmedDocType] = useState(initialDocType);
  const [pollNetworkWarning, setPollNetworkWarning] = useState(false);
  const [showLongRunningHint, setShowLongRunningHint] = useState(false);

  const acceptAttr = useMemo(() => buildAcceptAttribute(metadata?.extensions), [metadata]);
  const isBusy = isBusyFlow(flow);
  const blockerPresent = plausibility?.overallStatus === 'BLOCKER';

  const stopPolling = useCallback(() => {
    pollerStopRef.current?.();
    pollerStopRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    setDocumentType(initialDocType);
    setConfirmedDocType(initialDocType);
  }, [initialDocType]);

  useEffect(() => {
    let cancelled = false;
    api.documentExtraction
      .metadata()
      .then((m) => {
        if (!cancelled) setMetadata(m);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const applyRecord = useCallback(
    (next: PublicDocumentExtraction) => {
      setRecord(next);
      const effectiveType = resolveEffectiveType(next);
      const mapped = mapServerToFlowStatus(next.status, next.processingStage);
      setConfirmedDocType(effectiveType);
      if (next.sourceFileName) setUploadedFileName(next.sourceFileName);
      setUploadContext(next.uploadContext ?? null);

      if (mapped === 'ready') {
        setEditedFields(buildReviewFields(effectiveType, next.extractedData ?? undefined, { locale }));
        setPlausibility(toPlausibility(next.plausibility));
        setFlow('ready');
        stopPolling();
        if (mode === 'page') {
          writeActiveExtractionPointer({
            vehicleId: next.vehicleId ?? vehicleId,
            extractionId: next.id,
            updatedAt: new Date().toISOString(),
          });
        }
        return;
      }

      if (mapped === 'awaiting_type') {
        setEditedFields([]);
        setPlausibility(null);
        setFlow('awaiting_type');
        stopPolling();
        if (mode === 'page') {
          writeActiveExtractionPointer({
            vehicleId: next.vehicleId ?? vehicleId,
            extractionId: next.id,
            updatedAt: new Date().toISOString(),
          });
        }
        return;
      }

      if (mapped === 'failed' || mapped === 'cancelled') {
        setErrorMessage(next.errorMessage || 'Extraktion fehlgeschlagen.');
        setFlow(mapped);
        stopPolling();
        return;
      }

      if (mapped === 'done') {
        setFlow('done');
        stopPolling();
        if (mode === 'page') writeActiveExtractionPointer(null);
        onRecordApplied?.(next);
        onComplete?.();
        return;
      }

      setFlow(mapped);
      if (!pollThroughApply && mapped === 'applying') {
        /* embedded mode stops at confirm response */
      }
    },
    [locale, mode, onComplete, onRecordApplied, stopPolling, vehicleId],
  );

  const startPolling = useCallback(
    (id: string, pollVehicleId: string = vehicleId) => {
      if (!pollVehicleId) return;
      stopPolling();
      processingStartedRef.current = Date.now();
      setPollNetworkWarning(false);
      setShowLongRunningHint(false);

      const controller = new AbortController();
      abortRef.current = controller;

      const poller = createExtractionPoller({
        signal: controller.signal,
        fetchRecord: () =>
          api.vehicleIntelligence.getDocumentExtraction(pollVehicleId, id) as Promise<PublicDocumentExtraction>,
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
    [applyRecord, stopPolling, vehicleId],
  );

  const handleReset = useCallback(() => {
    stopPolling();
    pendingFileRef.current = null;
    setDuplicateBlocked(null);
    setUploadDuplicateWarning(null);
    setFlow('idle');
    setRecord(null);
    setUploadedFileName('');
    setEditingFields(false);
    setEditedFields([]);
    setPlausibility(null);
    setUploadContext(null);
    setExtractionId(null);
    setErrorMessage(null);
    setValidationError(null);
    setPollNetworkWarning(false);
    setShowLongRunningHint(false);
    setDocumentType(initialDocType);
    setConfirmedDocType(initialDocType);
    if (mode === 'page') writeActiveExtractionPointer(null);
  }, [initialDocType, mode, stopPolling]);

  const performUpload = useCallback(
    async (
      file: File,
      options?: {
        reuploadReason?: string;
        relatedExtractionId?: string | null;
        invoiceNumberHint?: string;
        referenceNumberHint?: string;
      },
    ) => {
      const res = await api.vehicleIntelligence.uploadDocumentExtraction(
        vehicleId,
        file,
        documentType,
        uploadSource,
        {
          reuploadReason: options?.reuploadReason,
          relatedExtractionId: options?.relatedExtractionId ?? undefined,
          invoiceNumberHint: options?.invoiceNumberHint,
          referenceNumberHint: options?.referenceNumberHint,
        },
      );

      setDuplicateBlocked(null);
      setUploadDuplicateWarning(
        shouldShowBusinessDuplicateWarning(res.uploadDuplicateStatus)
          ? ((res.uploadDuplicate as PublicUploadDuplicate | null) ?? null)
          : null,
      );
      setExtractionId(res.id);
      setConfirmedDocType(res.documentType || documentType);
      setFlow(mapServerToFlowStatus(res.status as PublicDocumentExtraction['status']));
      if (mode === 'page') {
        writeActiveExtractionPointer({
          vehicleId,
          extractionId: res.id,
          updatedAt: new Date().toISOString(),
        });
      }
      startPolling(res.id, vehicleId);
    },
    [documentType, mode, startPolling, uploadSource, vehicleId],
  );

  const handleFile = useCallback(
    async (file: File) => {
      if (!vehicleId) return;
      setValidationError(null);
      setErrorMessage(null);
      setDuplicateBlocked(null);
      setUploadDuplicateWarning(null);
      setEditingFields(false);
      setPlausibility(null);
      setEditedFields([]);
      setExtractionId(null);
      setRecord(null);
      setFlow('validating');

      const validation = validateUploadFile(file, metadata, { vehicleSelected: Boolean(vehicleId) });
      if (!validation.ok && validation.code) {
        setValidationError(defaultValidationMessage(validation.code, metadata?.maxUploadMb ?? 10));
        setFlow('idle');
        return;
      }

      pendingFileRef.current = file;
      setUploadedFileName(file.name);
      setFlow('uploading');

      try {
        await performUpload(file);
      } catch (err: unknown) {
        if (err instanceof DocumentUploadDuplicateError) {
          setDuplicateBlocked(err);
          setFlow('duplicate_blocked');
          return;
        }
        setErrorMessage(mapUploadError(err));
        setFlow('failed');
      }
    },
    [metadata, performUpload, vehicleId],
  );

  const handleAuthorizedReupload = useCallback(
    async (reason: string) => {
      const file = pendingFileRef.current;
      if (!file || !duplicateBlocked) return;
      setFlow('uploading');
      setErrorMessage(null);
      try {
        await performUpload(file, {
          reuploadReason: reason,
          relatedExtractionId: duplicateBlocked.payload.relatedExtractionId,
        });
      } catch (err: unknown) {
        if (err instanceof DocumentUploadDuplicateError) {
          setDuplicateBlocked(err);
          setFlow('duplicate_blocked');
          return;
        }
        setErrorMessage(mapUploadError(err));
        setFlow('failed');
      }
    },
    [duplicateBlocked, performUpload],
  );

  const handleRetry = useCallback(async () => {
    if (!vehicleId || !extractionId) {
      handleReset();
      return;
    }
    if (respectAllowedActions && record && !record.allowedActions?.includes('retry')) return;
    setErrorMessage(null);
    setValidationError(null);
    setFlow('retrying');
    try {
      await api.vehicleIntelligence.retryDocumentExtraction(vehicleId, extractionId);
      startPolling(extractionId, vehicleId);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Erneuter Versuch fehlgeschlagen.');
      setFlow('failed');
    }
  }, [extractionId, handleReset, record, respectAllowedActions, startPolling, vehicleId]);

  const handleReextract = useCallback(async () => {
    if (!vehicleId || !extractionId || !record) return;
    if (respectAllowedActions && !record.allowedActions?.includes('reextract')) return;
    const type = resolveEffectiveType(record);
    setErrorMessage(null);
    setFlow('retrying');
    try {
      await api.vehicleIntelligence.setDocumentType(vehicleId, extractionId, {
        documentType: type,
        reextract: true,
      });
      startPolling(extractionId, vehicleId);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Re-Extraktion fehlgeschlagen.');
      setFlow(record ? mapServerToFlowStatus(record.status, record.processingStage) : 'failed');
    }
  }, [extractionId, record, respectAllowedActions, startPolling, vehicleId]);

  const handleConfirm = useCallback(async () => {
    if (!vehicleId || !extractionId) return;
    if (respectAllowedActions && record && !record.allowedActions?.includes('confirm')) return;
    setFlow('applying');
    setErrorMessage(null);

    const confirmedData = parseReviewFieldsForConfirm(editedFields, { locale });

    try {
      await api.vehicleIntelligence.confirmDocumentExtraction(vehicleId, extractionId, {
        confirmedData,
      });
      if (pollThroughApply) {
        startPolling(extractionId, vehicleId);
      } else {
        setFlow('done');
        onComplete?.();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Bestätigung fehlgeschlagen.');
      setFlow('ready');
    }
  }, [editedFields, extractionId, locale, onComplete, pollThroughApply, record, respectAllowedActions, startPolling, vehicleId]);

  const openExtraction = useCallback(
    async (id: string, fileName?: string | null, pollVehicleId: string = vehicleId) => {
      if (!pollVehicleId) return;
      setExtractionId(id);
      setErrorMessage(null);
      setValidationError(null);
      setEditingFields(false);
      if (fileName) setUploadedFileName(fileName);
      if (mode === 'page') {
        writeActiveExtractionPointer({
          vehicleId: pollVehicleId,
          extractionId: id,
          updatedAt: new Date().toISOString(),
        });
      }
      setFlow('processing');
      try {
        const detail = (await api.vehicleIntelligence.getDocumentExtraction(
          pollVehicleId,
          id,
        )) as PublicDocumentExtraction;
        applyRecord(detail);
        const mapped = mapServerToFlowStatus(detail.status, detail.processingStage);
        if (isActiveExtractionStatus(detail.status) || (pollThroughApply && mapped === 'applying')) {
          startPolling(id, pollVehicleId);
        }
      } catch {
        setErrorMessage('Dokument konnte nicht geladen werden.');
        setFlow('failed');
      }
    },
    [applyRecord, mode, pollThroughApply, startPolling, vehicleId],
  );

  useEffect(() => {
    if (mode !== 'page' || !orgId) return;
    const pointer = readActiveExtractionPointer();
    if (!pointer) return;
    void openExtraction(pointer.extractionId, null, pointer.vehicleId);
  }, [mode, openExtraction, orgId]);

  return {
    metadata,
    flow,
    record,
    documentType,
    setDocumentType,
    confirmedDocType,
    uploadedFileName,
    errorMessage,
    validationError,
    duplicateBlocked,
    uploadDuplicateWarning,
    editingFields,
    setEditingFields,
    editedFields,
    setEditedFields,
    plausibility,
    uploadContext,
    extractionId,
    pollNetworkWarning,
    showLongRunningHint,
    acceptAttr,
    isBusy,
    blockerPresent,
    handleFile,
    handleAuthorizedReupload,
    handleRetry,
    handleReextract,
    handleConfirm,
    handleReset,
    openExtraction,
    openReview: openExtraction,
    openView: openExtraction,
    startPolling,
    applyRecord,
    stopPolling,
  };
}
