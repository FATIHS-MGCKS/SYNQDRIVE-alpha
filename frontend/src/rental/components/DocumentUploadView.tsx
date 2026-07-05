import { CheckCircle, Eye, Sparkles, Upload } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useRef, useCallback, useEffect } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import { api } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';
import {
  ACCEPT_ATTR,
  DOC_TYPE_LABELS,
  EXTRACTION_TEMPLATES,
  buildReviewFields,
  mapFlowStatus,
  type FlowStatus,
  type Plausibility,
  type PlausibilityStatus,
  type ReviewField,
} from './documents/document-extraction.shared';

interface DocumentUploadViewProps {
  isDarkMode: boolean;
}

interface VehicleOption { id: string; name: string; }

const mapStatus = mapFlowStatus;

interface FiledDocument {
  id: string;
  fileName: string;
  type: string;
  date: string;
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return <Icon name="file-text" className="w-5 h-5 text-red-500" />;
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext || '')) return <Icon name="image" className="w-5 h-5 text-status-info" />;
  if (['xlsx', 'xls', 'csv'].includes(ext || '')) return <Icon name="file-spreadsheet" className="w-5 h-5 text-green-500" />;
  return <Icon name="file" className="w-5 h-5 text-gray-500" />;
}

export function DocumentUploadView({ isDarkMode }: DocumentUploadViewProps) {
  const { t } = useLanguage();
  const { orgId } = useRentalOrg();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [flow, setFlow] = useState<FlowStatus>('idle');
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [editingFields, setEditingFields] = useState(false);
  const [editedFields, setEditedFields] = useState<ReviewField[]>([]);
  const [plausibility, setPlausibility] = useState<Plausibility | null>(null);

  const [filedDocuments, setFiledDocuments] = useState<FiledDocument[]>([]);

  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [selectedDocType, setSelectedDocType] = useState('SERVICE');
  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [confirmedDocType, setConfirmedDocType] = useState('SERVICE');

  useEffect(() => {
    if (!orgId) return;
    api.vehicles.listByOrg(orgId).then((res: any) => {
      const list = (res?.data || res || []).map((v: any) => ({
        id: v.id,
        name: v.vehicleName || `${v.make} ${v.model} (${v.year})`,
      }));
      setVehicles(list);
      if (list.length > 0 && !selectedVehicleId) setSelectedVehicleId(list[0].id);
    }).catch(() => []);
  }, [orgId]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // Applies a freshly-fetched server record to local state.
  const applyRecord = useCallback((record: any) => {
    const mapped = mapStatus(record?.status);
    const docType = record?.documentType || selectedDocType;
    setConfirmedDocType(docType);

    if (mapped === 'ready') {
      setEditedFields(buildReviewFields(docType, record?.extractedData));
      setPlausibility((record?.plausibility as Plausibility) ?? null);
      setFlow('ready');
      stopPolling();
    } else if (mapped === 'failed') {
      setErrorMessage(record?.errorMessage || 'Extraction failed.');
      setFlow('failed');
      stopPolling();
    } else if (mapped === 'done') {
      setFlow('done');
      stopPolling();
    } else {
      setFlow(mapped); // queued / processing / applying
    }
  }, [selectedDocType, stopPolling]);

  const startPolling = useCallback((vehicleId: string, id: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const record = await api.vehicleIntelligence.getDocumentExtraction(vehicleId, id);
        applyRecord(record);
      } catch {
        /* transient — keep polling */
      }
    }, 2000);
  }, [applyRecord, stopPolling]);

  const handleFile = useCallback(async (file: File) => {
    if (!selectedVehicleId) return;
    setUploadedFileName(file.name);
    setErrorMessage(null);
    setEditingFields(false);
    setPlausibility(null);
    setEditedFields([]);
    setExtractionId(null);
    setFlow('uploading');

    try {
      const res = await api.vehicleIntelligence.uploadDocumentExtraction(
        selectedVehicleId,
        file,
        selectedDocType,
        'rental_ui',
      );
      setExtractionId(res.id);
      setConfirmedDocType(res.documentType || selectedDocType);
      setFlow(mapStatus(res.status));
      // Begin polling immediately; first tick fetches the latest state.
      startPolling(selectedVehicleId, res.id);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Upload failed.');
      setFlow('failed');
    }
  }, [selectedVehicleId, selectedDocType, startPolling]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const handleRetry = useCallback(async () => {
    if (!selectedVehicleId || !extractionId) {
      // Upload itself failed (no record was created) — go back to the picker.
      handleReset();
      return;
    }
    setErrorMessage(null);
    setFlow('queued');
    try {
      await api.vehicleIntelligence.retryDocumentExtraction(selectedVehicleId, extractionId);
      startPolling(selectedVehicleId, extractionId);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Retry failed.');
      setFlow('failed');
    }
  }, [selectedVehicleId, extractionId, startPolling]);

  const handleConfirm = async () => {
    if (!selectedVehicleId || !extractionId) return;
    setFlow('applying');
    setErrorMessage(null);

    const confirmedData: Record<string, any> = {};
    for (const f of editedFields) {
      const value = f.value === '' ? null : f.value;
      if (f.key.includes('.')) {
        const [parent, child] = f.key.split('.');
        if (!confirmedData[parent]) confirmedData[parent] = {};
        confirmedData[parent][child] = value;
      } else {
        confirmedData[f.key] = value;
      }
    }

    try {
      await api.vehicleIntelligence.confirmDocumentExtraction(selectedVehicleId, extractionId, { confirmedData });
      setFiledDocuments((prev) => [
        {
          id: extractionId,
          fileName: uploadedFileName,
          type: DOC_TYPE_LABELS[confirmedDocType] || confirmedDocType,
          date: new Date().toLocaleDateString('de-DE'),
        },
        ...prev,
      ]);
      setFlow('done');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not apply the document.');
      setFlow('ready'); // stay on review so the user can fix & retry confirm
    }
  };

  function handleReset() {
    stopPolling();
    setFlow('idle');
    setUploadedFileName('');
    setEditingFields(false);
    setEditedFields([]);
    setPlausibility(null);
    setExtractionId(null);
    setErrorMessage(null);
  }

  const stepConfig = [
    { key: 'upload' as const, label: t('docUpload.step1'), icon: Upload },
    { key: 'analyzing' as const, label: t('docUpload.step2'), icon: Sparkles },
    { key: 'review' as const, label: t('docUpload.step3'), icon: Eye },
    { key: 'filed' as const, label: t('docUpload.step4'), icon: CheckCircle },
  ];
  const currentIdx =
    flow === 'idle' || flow === 'uploading' ? 0
      : flow === 'queued' || flow === 'processing' ? 1
        : flow === 'ready' || flow === 'applying' || flow === 'failed' ? 2
          : 3;

  const glass = isDarkMode
    ? 'bg-neutral-900 border border-neutral-800 shadow-sm'
    : 'bg-white border border-gray-200 shadow-sm';

  const statusLabel: Record<FlowStatus, string> = {
    idle: 'Ready',
    uploading: 'Uploading…',
    queued: 'Queued',
    processing: 'Extracting…',
    ready: 'Ready for review',
    applying: 'Applying…',
    done: 'Applied',
    failed: 'Failed',
  };

  const isBusy = flow === 'uploading' || flow === 'queued' || flow === 'processing';
  const blockerPresent = plausibility?.overallStatus === 'BLOCKER';

  const plausStyles = (s: PlausibilityStatus) =>
    s === 'BLOCKER'
      ? (isDarkMode ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-red-50 text-red-700 border-red-200')
      : s === 'WARNING'
        ? (isDarkMode ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-amber-50 text-amber-700 border-amber-200')
        : (isDarkMode ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-green-50 text-green-700 border-green-200');

  return (
    <div className="max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="mb-3">
        <h1 className="min-w-0 truncate font-display text-[length:var(--text-display-lg)] font-bold leading-[1.15] tracking-[var(--tracking-display)] text-foreground">{t('docUpload.title')}</h1>
        <p className={`text-xs mt-1 ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>{t('docUpload.subtitle')}</p>
      </div>

      {/* Step indicator */}
      <div className={`rounded-lg p-4 mb-3 ${glass}`}>
        <div className="flex items-center justify-between">
          {stepConfig.map((s, i) => {
            const isActive = i === currentIdx;
            const isDone = i < currentIdx;
            const StepIcon = s.icon;
            return (
              <div key={s.key} className="flex items-center flex-1">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300 ${
                    isDone ? 'bg-green-500/20' : isActive
                      ? isDarkMode ? 'bg-brand-soft' : 'bg-brand-soft'
                      : isDarkMode ? 'bg-card' : 'bg-gray-100'
                  }`}>
                    {isDone ? (
                      <Icon name="check" className="w-4.5 h-4.5 text-green-500" />
                    ) : (
                      <StepIcon className={`w-5 h-5 ${isActive
                        ? isDarkMode ? 'text-brand' : 'text-brand'
                        : isDarkMode ? 'text-gray-500' : 'text-muted-foreground'
                      }`} />
                    )}
                  </div>
                  <span className={`text-xs font-semibold ${
                    isDone ? 'text-green-500' : isActive
                      ? isDarkMode ? 'text-white' : 'text-gray-900'
                      : isDarkMode ? 'text-gray-500' : 'text-muted-foreground'
                  }`}>{s.label}</span>
                </div>
                {i < stepConfig.length - 1 && (
                  <div className={`flex-1 h-px mx-4 ${isDone ? 'bg-green-500/40' : isDarkMode ? 'bg-neutral-700' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Main area */}
        <div className="lg:col-span-2">
          {flow === 'idle' && (
            <div className="space-y-3">
              {/* Vehicle + Document Type selector */}
              <div className={`rounded-lg p-4 ${isDarkMode ? 'bg-neutral-900 border border-neutral-800' : 'bg-white border border-gray-200'}`}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`text-[10px] uppercase tracking-wider font-semibold mb-1 block ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>Vehicle</label>
                    <select value={selectedVehicleId} onChange={e => setSelectedVehicleId(e.target.value)} className={`w-full px-3 py-2 rounded-lg text-xs font-medium ${isDarkMode ? 'bg-card text-white border-neutral-700' : 'bg-white text-gray-900 border-gray-300'} border`}>
                      {vehicles.length === 0 && <option value="">No vehicles available</option>}
                      {vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={`text-[10px] uppercase tracking-wider font-semibold mb-1 block ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>Document Type</label>
                    <select value={selectedDocType} onChange={e => setSelectedDocType(e.target.value)} className={`w-full px-3 py-2 rounded-lg text-xs font-medium ${isDarkMode ? 'bg-card text-white border-neutral-700' : 'bg-white text-gray-900 border-gray-300'} border`}>
                      {Object.keys(EXTRACTION_TEMPLATES).map((k) => <option key={k} value={k}>{DOC_TYPE_LABELS[k] || k.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                </div>
              </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => selectedVehicleId ? fileInputRef.current?.click() : undefined}
              className={`rounded-lg p-12 text-center cursor-pointer transition-all duration-300 border-2 border-dashed ${
                !selectedVehicleId ? (isDarkMode ? 'border-neutral-800 bg-neutral-900/30 opacity-60' : 'border-gray-200 bg-gray-50 opacity-60') :
                dragActive
                  ? isDarkMode ? 'border-brand bg-brand-soft' : 'border-brand bg-brand-soft'
                  : isDarkMode ? 'border-neutral-700 bg-neutral-900/60 hover:border-neutral-600 hover:bg-neutral-900/80' : 'border-gray-300 bg-white/60 hover:border-gray-400 hover:bg-white/80'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={ACCEPT_ATTR}
                onChange={(e) => { if (e.target.files?.[0] && selectedVehicleId) handleFile(e.target.files[0]); }}
              />
              <div className={`w-16 h-16 rounded-lg mx-auto mb-3 flex items-center justify-center ${isDarkMode ? 'bg-brand-soft' : 'bg-brand-soft'}`}>
                <Icon name="upload" className={`w-7 h-7 ${isDarkMode ? 'text-brand' : 'text-brand'}`} />
              </div>
              <p className={`text-xs font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {dragActive ? t('docUpload.dropzoneActive') : t('docUpload.dropzone')}
              </p>
              <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>PDF, JPG, PNG, WebP, TXT &middot; max 10 MB</p>
              {!selectedVehicleId && <p className={`mt-3 text-xs font-semibold ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>Please select a vehicle first</p>}
              <button disabled={!selectedVehicleId} className={`mt-5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                isDarkMode ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-brand text-brand-foreground hover:bg-brand-hover'
              } ${!selectedVehicleId ? 'opacity-50 cursor-not-allowed' : ''}`}>
                {t('docUpload.browse')}
              </button>
            </div>
            </div>
          )}

          {isBusy && (
            <div className={`rounded-lg p-12 text-center ${glass}`}>
              <div className="relative w-16 h-16 mx-auto mb-3">
                <div className="w-16 h-16 rounded-lg flex items-center justify-center sq-tone-info">
                  <Icon name="sparkles" className="w-7 h-7" />
                </div>
                <div className="absolute -top-1 -right-1">
                  <Icon name="loader-2" className="w-5 h-5 animate-spin" />
                </div>
              </div>
              <p className={`text-xs font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {flow === 'uploading' ? 'Uploading document…' : flow === 'queued' ? 'Queued for extraction…' : t('docUpload.analyzing')}
              </p>
              <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>{uploadedFileName}</p>
              <div className="mt-4">
                <span className={`inline-block text-[10px] font-semibold px-2 py-1 rounded-full ${isDarkMode ? 'bg-card text-gray-300' : 'bg-gray-100 text-gray-600'}`}>{statusLabel[flow]}</span>
              </div>
            </div>
          )}

          {flow === 'failed' && (
            <div className={`rounded-lg p-10 text-center ${glass}`}>
              <div className={`w-16 h-16 rounded-lg mx-auto mb-3 flex items-center justify-center ${isDarkMode ? 'bg-red-500/15' : 'bg-red-100/80'}`}>
                <Icon name="alert-triangle" className={`w-7 h-7 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`} />
              </div>
              <p className={`text-xs font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Extraction failed</p>
              <p className={`text-xs mb-4 max-w-md mx-auto ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>{errorMessage || 'Something went wrong while processing this document.'}</p>
              <div className="flex items-center justify-center gap-3">
                <button onClick={handleRetry} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-brand hover:bg-brand text-brand-foreground transition-all">
                  <Icon name="rotate-ccw" className="w-3.5 h-3.5" />
                  Retry extraction
                </button>
                <button onClick={handleReset} className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${isDarkMode ? 'bg-card hover:bg-neutral-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {(flow === 'ready' || flow === 'applying') && (
            <div className={`rounded-lg overflow-hidden ${glass}`}>
              {/* Review Header */}
              <div className={`px-3 py-3 border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-200/60'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-green-500/15' : 'bg-green-100/80'}`}>
                      <Icon name="shield" className={`w-5 h-5 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
                    </div>
                    <div>
                      <h3 className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('docUpload.analysisComplete')}</h3>
                      <p className={`text-xs ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>Review &amp; confirm — nothing is applied until you confirm.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setEditingFields(!editingFields)}
                    disabled={flow === 'applying'}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                      editingFields
                        ? isDarkMode ? 'bg-brand-soft text-brand' : 'bg-brand-soft text-brand'
                        : isDarkMode ? 'bg-muted text-muted-foreground hover:bg-muted/80' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    } ${flow === 'applying' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Icon name="pencil" className="w-3 h-3" />
                    {editingFields ? 'Done editing' : 'Edit fields'}
                  </button>
                </div>
              </div>

              {/* File info + status */}
              <div className={`px-3 py-2 border-b flex items-center gap-3 ${isDarkMode ? 'border-neutral-800 bg-neutral-900/40' : 'border-gray-200/60 bg-gray-50/40'}`}>
                {getFileIcon(uploadedFileName)}
                <span className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{uploadedFileName}</span>
                <span className={`ml-auto text-[10px] font-semibold px-2 py-1 rounded-full ${isDarkMode ? 'bg-card text-gray-300' : 'bg-gray-100 text-gray-600'}`}>{statusLabel[flow]}</span>
              </div>

              {/* Apply error banner */}
              {errorMessage && (
                <div className={`px-3 py-2 text-xs font-medium ${isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-700'}`}>
                  {errorMessage}
                </div>
              )}

              <div className="p-4 space-y-4">
                {/* Document Type + Vehicle */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`text-xs font-semibold uppercase tracking-wider mb-1.5 block ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>{t('docUpload.documentType')}</label>
                    <div className={`px-3 py-2 rounded-lg text-xs font-semibold ${isDarkMode ? 'bg-brand-soft text-brand' : 'bg-status-info-soft text-status-info'}`}>{DOC_TYPE_LABELS[confirmedDocType] || confirmedDocType}</div>
                  </div>
                  <div>
                    <label className={`text-xs font-semibold uppercase tracking-wider mb-1.5 block ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>{t('docUpload.assignedTo')}</label>
                    <div className={`px-3 py-2 rounded-lg text-xs font-semibold ${isDarkMode ? 'bg-card text-gray-200' : 'bg-gray-100 text-gray-700'}`}>{vehicles.find(v => v.id === selectedVehicleId)?.name || ''}</div>
                  </div>
                </div>

                {/* Plausibility */}
                {plausibility && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className={`text-xs font-semibold uppercase tracking-wider block ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>Plausibility checks</label>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${plausStyles(plausibility.overallStatus)}`}>{plausibility.overallStatus}</span>
                    </div>
                    {plausibility.checks.length === 0 ? (
                      <div className={`px-3 py-2 rounded-lg text-xs border ${plausStyles('OK')}`}>No automated issues detected. Please still verify the values below.</div>
                    ) : (
                      <div className="space-y-1.5">
                        {plausibility.checks.map((c, i) => (
                          <div key={`${c.code}-${i}`} className={`px-3 py-2 rounded-lg text-xs border ${plausStyles(c.status)}`}>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{c.status}</span>
                              <span className="opacity-70">&middot; {c.source}</span>
                            </div>
                            <p className="mt-0.5">{c.message}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {plausibility.recommendedHumanReviewNotes && plausibility.recommendedHumanReviewNotes.length > 0 && (
                      <ul className={`mt-2 list-disc list-inside text-[11px] ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>
                        {plausibility.recommendedHumanReviewNotes.map((n, i) => <li key={i}>{n}</li>)}
                      </ul>
                    )}
                  </div>
                )}

                {/* Extracted Fields */}
                <div>
                  <label className={`text-xs font-semibold uppercase tracking-wider mb-2 block ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>{t('docUpload.detectedFields')}</label>
                  <div className={`rounded-lg overflow-hidden border ${isDarkMode ? 'border-neutral-800' : 'border-gray-200/60'}`}>
                    {editedFields.map((field, i) => (
                      <div key={field.key} className={`flex items-center px-3 py-2.5 ${i > 0 ? (isDarkMode ? 'border-t border-neutral-800' : 'border-t border-gray-200/40') : ''}`}>
                        <span className={`w-44 text-xs font-semibold shrink-0 ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>{field.label}</span>
                        {editingFields ? (
                          <input
                            value={field.value}
                            onChange={(e) => {
                              const updated = [...editedFields];
                              updated[i] = { ...updated[i], value: e.target.value };
                              setEditedFields(updated);
                            }}
                            className={`flex-1 text-xs font-semibold px-2 py-1 rounded-md border ${isDarkMode ? 'bg-card border-neutral-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
                          />
                        ) : (
                          <span className={`text-xs font-semibold ${field.value ? (isDarkMode ? 'text-white' : 'text-gray-900') : (isDarkMode ? 'text-gray-600' : 'text-muted-foreground')}`}>{field.value || '—'}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleConfirm}
                    disabled={flow === 'applying' || blockerPresent}
                    title={blockerPresent ? 'Resolve blocking plausibility issues before applying.' : undefined}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-green-600 hover:bg-green-500 text-white transition-all shadow-sm ${(flow === 'applying' || blockerPresent) ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {flow === 'applying' ? <Icon name="loader-2" className="w-5 h-5 animate-spin" /> : <Icon name="check-circle" className="w-5 h-5" />}
                    {flow === 'applying' ? 'Applying…' : t('docUpload.confirmAndFile')}
                  </button>
                  <button
                    onClick={handleRetry}
                    disabled={flow === 'applying'}
                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      isDarkMode ? 'bg-card hover:bg-neutral-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                    } ${flow === 'applying' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Icon name="rotate-ccw" className="w-3.5 h-3.5" />
                    Re-extract
                  </button>
                  <button
                    onClick={handleReset}
                    disabled={flow === 'applying'}
                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      isDarkMode ? 'bg-card hover:bg-neutral-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                    } ${flow === 'applying' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {flow === 'done' && (
            <div className={`rounded-lg p-12 text-center ${glass}`}>
              <div className={`w-16 h-16 rounded-lg mx-auto mb-3 flex items-center justify-center ${isDarkMode ? 'bg-green-500/15' : 'bg-green-100/80'}`}>
                <Icon name="check-circle" className={`w-5 h-5 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
              </div>
              <p className={`text-xs font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('docUpload.successFiled')}</p>
              <p className={`text-xs mb-3 ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>
                Applied to {DOC_TYPE_LABELS[confirmedDocType] || confirmedDocType}.
              </p>
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold bg-brand hover:bg-brand text-brand-foreground transition-all"
              >
                <Icon name="upload" className="w-3.5 h-3.5" />
                {t('docUpload.uploadAnother')}
              </button>
            </div>
          )}
        </div>

        {/* Right column - Recent Uploads + AI Info */}
        <div className="space-y-5">
          {/* AI Badge */}
          <div className={`rounded-lg p-4 ${glass}`}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-5 h-5 rounded-lg flex items-center justify-center sq-tone-info">
                <Icon name="sparkles" className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('docUpload.aiPowered')}</h3>
              </div>
            </div>
            <div className="space-y-2">
              {['Service Record', 'Oil Change', 'Tire Service', 'Brake Service', 'Battery Service', 'TÜV / BOKraft', 'Invoice', 'Damage / Accident'].map((type) => (
                <div key={type} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${isDarkMode ? 'bg-card' : 'bg-gray-50'}`}>
                  <Icon name="file-text" className={`w-3 h-3 ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`} />
                  <span className={`text-[11px] ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{type}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Uploads */}
          <div className={`rounded-lg overflow-hidden ${glass}`}>
            <div className={`px-3 py-2 border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-200/60'}`}>
              <h3 className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('docUpload.recentUploads')}</h3>
            </div>
            <div className="p-3">
              {filedDocuments.length === 0 ? (
                <div className="py-8 text-center">
                  <Icon name="file-text" className={`w-5 h-5 mx-auto mb-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                  <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>{t('docUpload.noUploads')}</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filedDocuments.map(doc => (
                    <div key={doc.id} className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-card/60' : 'hover:bg-gray-50'}`}>
                      <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-green-500/10' : 'bg-green-50'}`}>
                        <Icon name="check-circle" className="w-5 h-5 text-green-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[11px] font-semibold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{doc.fileName}</p>
                        <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>{doc.type}</p>
                      </div>
                      <span className={`text-xs font-medium shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>{doc.date}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
