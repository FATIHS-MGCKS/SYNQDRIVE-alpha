import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import {
  buildReviewFields,
  mapFlowStatus,
  type FlowStatus,
  type Plausibility,
  type ReviewField,
} from '../components/documents/document-extraction.shared';

export interface UseDocumentExtractionFlowOptions {
  vehicleId: string;
  initialDocType?: string;
  onComplete?: () => void;
}

export function useDocumentExtractionFlow({
  vehicleId,
  initialDocType = 'SERVICE',
  onComplete,
}: UseDocumentExtractionFlowOptions) {
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [flow, setFlow] = useState<FlowStatus>('idle');
  const [documentType, setDocumentType] = useState(initialDocType);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingFields, setEditingFields] = useState(false);
  const [editedFields, setEditedFields] = useState<ReviewField[]>([]);
  const [plausibility, setPlausibility] = useState<Plausibility | null>(null);
  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [confirmedDocType, setConfirmedDocType] = useState(initialDocType);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    setDocumentType(initialDocType);
    setConfirmedDocType(initialDocType);
  }, [initialDocType]);

  const applyRecord = useCallback(
    (record: {
      status?: string;
      documentType?: string;
      extractedData?: Record<string, unknown>;
      plausibility?: Plausibility;
      errorMessage?: string | null;
      sourceFileName?: string | null;
    }) => {
      const mapped = mapFlowStatus(record?.status);
      const docType = record?.documentType || documentType;
      setConfirmedDocType(docType);
      if (record.sourceFileName) setUploadedFileName(record.sourceFileName);

      if (mapped === 'ready') {
        setEditedFields(buildReviewFields(docType, record?.extractedData));
        setPlausibility(record?.plausibility ?? null);
        setFlow('ready');
        stopPolling();
      } else if (mapped === 'failed') {
        setErrorMessage(record?.errorMessage || 'Extraktion fehlgeschlagen.');
        setFlow('failed');
        stopPolling();
      } else if (mapped === 'done') {
        setFlow('done');
        stopPolling();
      } else {
        setFlow(mapped);
      }
    },
    [documentType, onComplete, stopPolling],
  );

  const startPolling = useCallback(
    (id: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const record = await api.vehicleIntelligence.getDocumentExtraction(vehicleId, id);
          applyRecord(record);
        } catch {
          /* transient */
        }
      }, 2000);
    },
    [applyRecord, stopPolling, vehicleId],
  );

  const handleReset = useCallback(() => {
    stopPolling();
    setFlow('idle');
    setUploadedFileName('');
    setEditingFields(false);
    setEditedFields([]);
    setPlausibility(null);
    setExtractionId(null);
    setErrorMessage(null);
    setDocumentType(initialDocType);
    setConfirmedDocType(initialDocType);
  }, [initialDocType, stopPolling]);

  const handleFile = useCallback(
    async (file: File) => {
      if (!vehicleId) return;
      setUploadedFileName(file.name);
      setErrorMessage(null);
      setEditingFields(false);
      setPlausibility(null);
      setEditedFields([]);
      setExtractionId(null);
      setFlow('uploading');

      try {
        const res = await api.vehicleIntelligence.uploadDocumentExtraction(
          vehicleId,
          file,
          documentType,
          'documents_tab',
        );
        setExtractionId(res.id);
        setConfirmedDocType(res.documentType || documentType);
        setFlow(mapFlowStatus(res.status));
        startPolling(res.id);
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : 'Upload fehlgeschlagen.');
        setFlow('failed');
      }
    },
    [documentType, startPolling, vehicleId],
  );

  const handleRetry = useCallback(async () => {
    if (!vehicleId || !extractionId) {
      handleReset();
      return;
    }
    setErrorMessage(null);
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

    const confirmedData: Record<string, unknown> = {};
    for (const f of editedFields) {
      const value = f.value === '' ? null : f.value;
      if (f.key.includes('.')) {
        const [parent, child] = f.key.split('.');
        if (!confirmedData[parent]) confirmedData[parent] = {};
        (confirmedData[parent] as Record<string, unknown>)[child] = value;
      } else {
        confirmedData[f.key] = value;
      }
    }

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
  }, [editedFields, extractionId, onComplete, vehicleId]);

  const openReview = useCallback(
    async (id: string, fileName?: string | null) => {
      setExtractionId(id);
      setErrorMessage(null);
      setEditingFields(false);
      if (fileName) setUploadedFileName(fileName);
      setFlow('processing');
      try {
        const record = await api.vehicleIntelligence.getDocumentExtraction(vehicleId, id);
        applyRecord(record);
        if (mapFlowStatus(record.status) === 'processing' || mapFlowStatus(record.status) === 'queued') {
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

  const isBusy = flow === 'uploading' || flow === 'queued' || flow === 'processing';
  const blockerPresent = plausibility?.overallStatus === 'BLOCKER';

  return {
    flow,
    documentType,
    setDocumentType,
    confirmedDocType,
    uploadedFileName,
    errorMessage,
    editingFields,
    setEditingFields,
    editedFields,
    setEditedFields,
    plausibility,
    extractionId,
    isBusy,
    blockerPresent,
    handleFile,
    handleRetry,
    handleConfirm,
    handleReset,
    openReview,
    openView,
  };
}
