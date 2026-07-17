import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { DocumentUploadDuplicateError } from '../../lib/document-upload-duplicate';
import { shouldShowBusinessDuplicateWarning } from '../lib/document-upload-duplicate-flow';
import type { PublicUploadDuplicate } from '../lib/document-extraction.types';
import {
  buildReviewFields,
  parseReviewFieldsForConfirm,
  type FlowStatus,
  type Plausibility,
  type ReviewField,
} from '../components/documents/document-extraction.shared';
import { mapServerToFlowStatus } from '../lib/document-extraction-lifecycle';
import { createExtractionPoller } from '../lib/document-extraction-polling';
import type { DocumentExtractionMetadata, PublicDocumentExtraction } from '../lib/document-extraction.types';
import {
  buildAcceptAttribute,
  validateUploadFile,
  type UploadValidationCode,
} from '../lib/document-extraction-validation';

export interface UseDocumentExtractionFlowOptions {
  vehicleId: string;
  initialDocType?: string;
  locale?: string;
  /** Form field `source` on multipart upload (e.g. operator_app, documents_tab). */
  uploadSource?: string;
  onComplete?: () => void;
}

export function useDocumentExtractionFlow({
  vehicleId,
  initialDocType = 'SERVICE',
  locale = 'de',
  uploadSource = 'documents_tab',
  onComplete,
}: UseDocumentExtractionFlowOptions) {
  const abortRef = useRef<AbortController | null>(null);
  const pollerStopRef = useRef<(() => void) | null>(null);
  const pendingFileRef = useRef<File | null>(null);

  const [metadata, setMetadata] = useState<DocumentExtractionMetadata | null>(null);
  const [flow, setFlow] = useState<FlowStatus>('idle');
  const [documentType, setDocumentType] = useState(initialDocType);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [duplicateBlocked, setDuplicateBlocked] = useState<DocumentUploadDuplicateError | null>(null);
  const [uploadDuplicateWarning, setUploadDuplicateWarning] = useState<PublicUploadDuplicate | null>(null);
  const [editingFields, setEditingFields] = useState(false);
  const [editedFields, setEditedFields] = useState<ReviewField[]>([]);
  const [plausibility, setPlausibility] = useState<Plausibility | null>(null);
  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [confirmedDocType, setConfirmedDocType] = useState(initialDocType);

  const acceptAttr = useMemo(() => buildAcceptAttribute(metadata?.extensions), [metadata]);

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
      .catch(() => {
        /* validation helper falls back to canonical constants */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const validationMessage = useCallback((code: UploadValidationCode): string => {
    const messages: Record<UploadValidationCode, string> = {
      NO_VEHICLE: 'Bitte zuerst ein Fahrzeug auswählen.',
      NO_FILE: 'Bitte eine Datei auswählen.',
      MULTIPLE_FILES: 'Bitte nur eine Datei hochladen.',
      EMPTY_FILE: 'Die Datei ist leer.',
      FILE_TOO_LARGE: `Die Datei überschreitet ${metadata?.maxUploadMb ?? 10} MB.`,
      INVALID_EXTENSION: 'Dateityp wird nicht unterstützt.',
      INVALID_MIME: 'Dateiformat wird vom Browser nicht unterstützt.',
    };
    return messages[code];
  }, [metadata?.maxUploadMb]);

  const applyRecord = useCallback(
    (record: PublicDocumentExtraction) => {
      const mapped = mapServerToFlowStatus(record.status, record.processingStage);
      const docType = record.effectiveDocumentType || record.documentType || documentType;
      setConfirmedDocType(docType);
      if (record.sourceFileName) setUploadedFileName(record.sourceFileName);

      if (mapped === 'ready') {
        setEditedFields(buildReviewFields(docType, (record.extractedData ?? undefined) as Record<string, unknown> | undefined, { locale }));
        setPlausibility((record.plausibility as Plausibility | null) ?? null);
        setFlow('ready');
        stopPolling();
      } else if (mapped === 'failed') {
        setErrorMessage(record.errorMessage || 'Extraktion fehlgeschlagen.');
        setFlow('failed');
        stopPolling();
      } else if (mapped === 'done') {
        setFlow('done');
        stopPolling();
      } else if (mapped === 'awaiting_type') {
        setEditedFields([]);
        setPlausibility(null);
        setFlow('awaiting_type');
        stopPolling();
      } else {
        setFlow(mapped);
      }
    },
    [documentType, stopPolling],
  );

  const startPolling = useCallback(
    (id: string) => {
      stopPolling();
      const controller = new AbortController();
      abortRef.current = controller;

      const poller = createExtractionPoller({
        signal: controller.signal,
        fetchRecord: () =>
          api.vehicleIntelligence.getDocumentExtraction(vehicleId, id) as Promise<PublicDocumentExtraction>,
        onRecord: applyRecord,
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
    setUploadedFileName('');
    setEditingFields(false);
    setEditedFields([]);
    setPlausibility(null);
    setExtractionId(null);
    setErrorMessage(null);
    setValidationError(null);
    setDocumentType(initialDocType);
    setConfirmedDocType(initialDocType);
  }, [initialDocType, stopPolling]);

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
      startPolling(res.id);
    },
    [documentType, startPolling, uploadSource, vehicleId],
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
      setFlow('validating');

      const validation = validateUploadFile(file, metadata, { vehicleSelected: Boolean(vehicleId) });
      if (!validation.ok && validation.code) {
        setValidationError(validationMessage(validation.code));
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
        setErrorMessage(err instanceof Error ? err.message : 'Upload fehlgeschlagen.');
        setFlow('failed');
      }
    },
    [metadata, performUpload, validationMessage, vehicleId],
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
        setErrorMessage(err instanceof Error ? err.message : 'Upload fehlgeschlagen.');
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
    setErrorMessage(null);
    setValidationError(null);
    setFlow('queued');
    try {
      await api.vehicleIntelligence.retryDocumentExtraction(vehicleId, extractionId);
      startPolling(extractionId);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Erneuter Versuch fehlgeschlagen.');
      setFlow('failed');
    }
  }, [extractionId, handleReset, startPolling, vehicleId]);

  const handleConfirm = useCallback(async () => {
    if (!vehicleId || !extractionId) return;
    setFlow('applying');
    setErrorMessage(null);

    const confirmedData = parseReviewFieldsForConfirm(editedFields, { locale });

    try {
      await api.vehicleIntelligence.confirmDocumentExtraction(vehicleId, extractionId, {
        confirmedData,
      });
      setFlow('done');
      onComplete?.();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Bestätigung fehlgeschlagen.');
      setFlow('ready');
    }
  }, [editedFields, extractionId, locale, onComplete, vehicleId]);

  const openReview = useCallback(
    async (id: string, fileName?: string | null) => {
      setExtractionId(id);
      setErrorMessage(null);
      setValidationError(null);
      setEditingFields(false);
      if (fileName) setUploadedFileName(fileName);
      setFlow('processing');
      try {
        const record = (await api.vehicleIntelligence.getDocumentExtraction(
          vehicleId,
          id,
        )) as PublicDocumentExtraction;
        applyRecord(record);
        const mapped = mapServerToFlowStatus(record.status, record.processingStage);
        if (mapped !== 'ready' && mapped !== 'failed' && mapped !== 'done' && mapped !== 'awaiting_type') {
          startPolling(id);
        }
      } catch {
        setErrorMessage('Dokument konnte nicht geladen werden.');
        setFlow('failed');
      }
    },
    [applyRecord, startPolling, vehicleId],
  );

  const openView = openReview;

  const isBusy =
    flow === 'validating' ||
    flow === 'uploading' ||
    flow === 'queued' ||
    flow === 'processing' ||
    flow === 'retrying' ||
    flow === 'ocr' ||
    flow === 'classifying' ||
    flow === 'extracting' ||
    flow === 'validating_plausibility' ||
    flow === 'stored' ||
    flow === 'awaiting_type';
  const blockerPresent = plausibility?.overallStatus === 'BLOCKER';

  return {
    flow,
    documentType,
    setDocumentType,
    confirmedDocType,
    uploadedFileName,
    errorMessage,
    validationError,
    editingFields,
    setEditingFields,
    editedFields,
    setEditedFields,
    plausibility,
    extractionId,
    duplicateBlocked,
    uploadDuplicateWarning,
    acceptAttr,
    metadata,
    isBusy,
    blockerPresent,
    handleFile,
    handleAuthorizedReupload,
    handleRetry,
    handleConfirm,
    handleReset,
    openReview,
    openView,
  };
}
