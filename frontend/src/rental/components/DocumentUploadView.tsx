import { CheckCircle, Eye, Sparkles, Upload } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useRef, useState } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import { useRentalOrg } from '../RentalContext';
import { useDocumentUploadPage } from '../hooks/useDocumentUploadPage';
import type { PlausibilityStatus } from './documents/document-extraction.shared';
import type { PublicDocumentExtractionSummary } from '../lib/document-extraction.types';

interface DocumentUploadViewProps {
  isDarkMode: boolean;
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return <Icon name="file-text" className="w-5 h-5 text-red-500" />;
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext || '')) return <Icon name="image" className="w-5 h-5 text-status-info" />;
  return <Icon name="file" className="w-5 h-5 text-gray-500" />;
}

function formatHistoryDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function DocumentUploadView({ isDarkMode }: DocumentUploadViewProps) {
  const { t } = useLanguage();
  const { orgId } = useRentalOrg();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const page = useDocumentUploadPage({ orgId, t });

  const glass = isDarkMode
    ? 'bg-neutral-900 border border-neutral-800 shadow-sm'
    : 'bg-white border border-gray-200 shadow-sm';

  const stepConfig = [
    { key: 'upload' as const, label: t('docUpload.step1'), icon: Upload },
    { key: 'analyzing' as const, label: t('docUpload.step2'), icon: Sparkles },
    { key: 'review' as const, label: t('docUpload.step3'), icon: Eye },
    { key: 'filed' as const, label: t('docUpload.step4'), icon: CheckCircle },
  ];
  const currentIdx = page.stepperIndex;

  const plausStyles = (s: PlausibilityStatus) =>
    s === 'BLOCKER'
      ? (isDarkMode ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-red-50 text-red-700 border-red-200')
      : s === 'WARNING'
        ? (isDarkMode ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-amber-50 text-amber-700 border-amber-200')
        : (isDarkMode ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-green-50 text-green-700 border-green-200');

  const renderStepIcon = (s: (typeof stepConfig)[number], i: number, compact = false) => {
    const isActive = i === currentIdx;
    const isDone = i < currentIdx;
    const StepIcon = s.icon;
    const iconBox = compact ? 'w-8 h-8' : 'w-9 h-9';
    const iconSize = compact ? 'w-4 h-4' : 'w-5 h-5';
    return (
      <div className={`${iconBox} rounded-lg flex items-center justify-center transition-all duration-300 shrink-0 ${
        isDone ? 'bg-green-500/20' : isActive
          ? isDarkMode ? 'bg-brand-soft' : 'bg-brand-soft'
          : isDarkMode ? 'surface-premium' : 'bg-gray-100'
      }`}>
        {isDone ? (
          <Icon name="check" className={`${compact ? 'w-4 h-4' : 'w-4.5 h-4.5'} text-green-500`} />
        ) : (
          <StepIcon className={`${iconSize} ${isActive
            ? isDarkMode ? 'text-brand' : 'text-brand'
            : isDarkMode ? 'text-gray-500' : 'text-muted-foreground'
          }`} />
        )}
      </div>
    );
  };

  const stepLabelClass = (i: number, centered = false) => {
    const isActive = i === currentIdx;
    const isDone = i < currentIdx;
    return `font-semibold ${
      centered ? 'text-[10px] sm:text-xs text-center leading-tight line-clamp-2 min-w-0 w-full' : 'text-xs min-w-0'
    } ${
      isDone ? 'text-green-500' : isActive
        ? isDarkMode ? 'text-white' : 'text-gray-900'
        : isDarkMode ? 'text-gray-500' : 'text-muted-foreground'
    }`;
  };

  const renderHistoryActions = (item: PublicDocumentExtractionSummary) => {
    const actions = item.allowedActions ?? [];
    const btn = (label: string, onClick: () => void, primary = false) => (
      <button
        key={label}
        type="button"
        onClick={onClick}
        className={`text-[10px] font-semibold px-2 py-1 rounded-md ${
          primary
            ? 'bg-brand text-brand-foreground'
            : isDarkMode ? 'surface-premium text-gray-300' : 'bg-gray-100 text-gray-600'
        }`}
      >
        {label}
      </button>
    );
    const nodes = [];
    if (item.status === 'READY_FOR_REVIEW' || item.status === 'AWAITING_DOCUMENT_TYPE') {
      nodes.push(btn(t('docUpload.openReview'), () => page.handleOpenHistoryItem(item), true));
    }
    if (actions.includes('retry')) {
      nodes.push(btn(t('docUpload.retry'), () => page.handleOpenHistoryItem(item)));
    }
    if (actions.includes('download') && item.hasStoredFile) {
      nodes.push(btn(t('docUpload.viewFile'), () => {
        page.handleOpenHistoryItem(item);
        void page.handleDownload();
      }));
    }
    return nodes;
  };

  const manualDocTypes = page.docTypeOptions.filter((o) => o.value !== 'AUTO');
  const showMainIdle = page.flow === 'idle';
  const showBusy = page.isBusy;
  const showAwaitingType = page.flow === 'awaiting_type';
  const showFailed = page.flow === 'failed';
  const showReview = page.flow === 'ready' || page.flow === 'applying';
  const showDone = page.flow === 'done';
  const showCancelled = page.flow === 'cancelled';

  return (
    <div className="w-full max-w-[1200px] mx-auto min-w-0 overflow-x-clip">
      <div className="mb-3 min-w-0">
        <h1 className="min-w-0 break-words font-display text-[length:var(--text-display-lg)] font-bold leading-[1.15] tracking-[var(--tracking-display)] text-foreground">{t('docUpload.title')}</h1>
        <p className={`text-xs mt-1 break-words ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>{t('docUpload.subtitle')}</p>
      </div>

      <div className={`rounded-lg p-3 sm:p-4 mb-3 min-w-0 ${glass}`}>
        <div className="grid grid-cols-4 gap-1 min-w-0 sm:hidden">
          {stepConfig.map((s, i) => (
            <div key={s.key} className="flex flex-col items-center gap-1.5 min-w-0 px-0.5">
              {renderStepIcon(s, i, true)}
              <span className={stepLabelClass(i, true)}>{s.label}</span>
            </div>
          ))}
        </div>
        <div className="hidden sm:flex items-center justify-between min-w-0">
          {stepConfig.map((s, i) => (
            <div key={s.key} className="flex items-center flex-1 min-w-0">
              <div className="flex items-center gap-3 min-w-0">
                {renderStepIcon(s, i)}
                <span className={stepLabelClass(i)}>{s.label}</span>
              </div>
              {i < stepConfig.length - 1 && (
                <div className={`flex-1 min-w-2 h-px mx-2 lg:mx-4 ${i < currentIdx ? 'bg-green-500/40' : isDarkMode ? 'bg-neutral-700' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 min-w-0">
        <div className="lg:col-span-2 min-w-0">
          {showMainIdle && (
            <div className="space-y-3">
              <div className={`rounded-lg p-4 ${isDarkMode ? 'bg-neutral-900 border border-neutral-800' : 'bg-white border border-gray-200'}`}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                  <div className="min-w-0">
                    <label className={`text-[10px] uppercase tracking-wider font-semibold mb-1 block ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>{t('docUpload.vehicle')}</label>
                    <select value={page.selectedVehicleId} onChange={(e) => page.setSelectedVehicleId(e.target.value)} className={`w-full min-w-0 px-3 py-2 rounded-lg text-xs font-medium ${isDarkMode ? 'surface-premium text-white border-neutral-700' : 'bg-white text-gray-900 border-gray-300'} border`}>
                      {page.vehicles.length === 0 && <option value="">{t('docUpload.validation.noVehicle')}</option>}
                      {page.vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label className={`text-[10px] uppercase tracking-wider font-semibold mb-1 block ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>{t('docUpload.documentType')}</label>
                    <select value={page.documentType} onChange={(e) => page.setDocumentType(e.target.value)} disabled={page.metadataLoading} className={`w-full min-w-0 px-3 py-2 rounded-lg text-xs font-medium ${isDarkMode ? 'surface-premium text-white border-neutral-700' : 'bg-white text-gray-900 border-gray-300'} border`}>
                      {page.docTypeOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{page.typeLabel(opt.labelKey)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {page.validationError && (
                <div className={`px-3 py-2 rounded-lg text-xs font-medium ${isDarkMode ? 'bg-amber-500/10 text-amber-300' : 'bg-amber-50 text-amber-800'}`}>
                  {page.validationError}
                </div>
              )}

              <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  if (e.dataTransfer.files?.length) page.handleDropFiles(e.dataTransfer.files);
                }}
                onClick={() => (page.selectedVehicleId ? fileInputRef.current?.click() : undefined)}
                className={`rounded-lg p-6 sm:p-10 lg:p-12 text-center cursor-pointer transition-all duration-300 border-2 border-dashed min-w-0 ${
                  !page.selectedVehicleId ? (isDarkMode ? 'border-neutral-800 bg-neutral-900/30 opacity-60' : 'border-gray-200 bg-gray-50 opacity-60') :
                  dragActive
                    ? isDarkMode ? 'border-brand bg-brand-soft' : 'border-brand bg-brand-soft'
                    : isDarkMode ? 'border-neutral-700 bg-neutral-900/60 hover:border-neutral-600 hover:bg-neutral-900/80' : 'border-gray-300 bg-white/60 hover:border-gray-400 hover:bg-white/80'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept={page.acceptAttr}
                  onChange={(e) => {
                    if (e.target.files?.length) page.handleDropFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-lg mx-auto mb-3 flex items-center justify-center ${isDarkMode ? 'bg-brand-soft' : 'bg-brand-soft'}`}>
                  <Icon name="upload" className={`w-6 h-6 sm:w-7 sm:h-7 ${isDarkMode ? 'text-brand' : 'text-brand'}`} />
                </div>
                <p className={`text-xs font-semibold mb-2 break-words px-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {dragActive ? t('docUpload.dropzoneActive') : t('docUpload.dropzone')}
                </p>
                <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>{page.supportedFormatsLabel}</p>
                {!page.selectedVehicleId && <p className={`mt-3 text-xs font-semibold ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>{t('docUpload.selectVehicleFirst')}</p>}
                <button type="button" disabled={!page.selectedVehicleId} className={`mt-5 w-full sm:w-auto min-h-11 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                  isDarkMode ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-brand text-brand-foreground hover:bg-brand-hover'
                } ${!page.selectedVehicleId ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {t('docUpload.browse')}
                </button>
              </div>
            </div>
          )}

          {showBusy && (
            <div className={`rounded-lg p-6 sm:p-12 text-center min-w-0 ${glass}`}>
              <div className="relative w-16 h-16 mx-auto mb-3">
                <div className="w-16 h-16 rounded-lg flex items-center justify-center sq-tone-info">
                  <Icon name="sparkles" className="w-7 h-7" />
                </div>
                <div className="absolute -top-1 -right-1">
                  <Icon name="loader-2" className="w-5 h-5 animate-spin" />
                </div>
              </div>
              <p className={`text-xs font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {page.flowStatusLabel(page.flow)}
              </p>
              {page.record?.processingStage && (
                <p className={`text-[11px] mb-2 ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>
                  {page.stageLabel(page.record.processingStage)}
                </p>
              )}
              <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'} break-all px-1`}>{page.uploadedFileName}</p>
              <div className="mt-4 space-y-2">
                <span className={`inline-block text-[10px] font-semibold px-2 py-1 rounded-full ${isDarkMode ? 'surface-premium text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                  {page.record ? page.serverStatusLabel(page.record.status) : page.flowStatusLabel(page.flow)}
                </span>
                {page.showLongRunningHint && (
                  <p className={`text-[11px] max-w-md mx-auto break-words ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>{t('docUpload.longRunningHint')}</p>
                )}
                {page.pollNetworkWarning && (
                  <p className={`text-[11px] max-w-md mx-auto break-words ${isDarkMode ? 'text-amber-300' : 'text-amber-700'}`}>{t('docUpload.networkWarning')}</p>
                )}
              </div>
              {page.record?.allowedActions?.includes('cancel') && (
                <button type="button" onClick={() => void page.handleCancel()} className={`mt-4 inline-flex items-center justify-center min-h-11 px-3 py-2 rounded-lg text-xs font-semibold ${isDarkMode ? 'surface-premium text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                  {t('docUpload.cancel')}
                </button>
              )}
            </div>
          )}

          {showAwaitingType && (
            <div className={`rounded-lg p-4 sm:p-6 min-w-0 ${glass}`}>
              <h3 className={`text-base font-semibold mb-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('docUpload.awaitingTypeTitle')}</h3>
              <p className={`text-xs mb-4 break-words ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>{t('docUpload.awaitingTypeHint')}</p>
              {page.record?.detectedDocumentType && (
                <div className={`mb-3 px-3 py-2 rounded-lg text-xs ${isDarkMode ? 'bg-brand-soft text-brand' : 'bg-status-info-soft text-status-info'}`}>
                  {t('docUpload.detectedType')}: {page.typeLabel(`documentExtraction.type.${page.record.detectedDocumentType}`, page.record.detectedDocumentType)}
                  {page.classificationConfidence ? ` · ${t('docUpload.confidence')}: ${page.classificationConfidence}` : ''}
                </div>
              )}
              <div className="min-w-0 mb-4">
                <label className={`text-xs font-semibold uppercase tracking-wider mb-1.5 block ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>{t('docUpload.documentType')}</label>
                <select value={page.pendingTypeSelection} onChange={(e) => page.setPendingTypeSelection(e.target.value)} className={`w-full min-w-0 px-3 py-2 rounded-lg text-xs font-medium border ${isDarkMode ? 'surface-premium text-white border-neutral-700' : 'bg-white text-gray-900 border-gray-300'}`}>
                  {manualDocTypes.map((opt) => (
                    <option key={opt.value} value={opt.value}>{page.typeLabel(opt.labelKey)}</option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={() => void page.handleSetDocumentType(page.pendingTypeSelection, false)} className="w-full sm:w-auto min-h-11 px-3 py-2 rounded-lg text-xs font-semibold bg-brand text-brand-foreground">
                {t('docUpload.selectTypeAndContinue')}
              </button>
            </div>
          )}

          {showFailed && (
            <div className={`rounded-lg p-6 sm:p-10 text-center min-w-0 ${glass}`}>
              <div className={`w-16 h-16 rounded-lg mx-auto mb-3 flex items-center justify-center ${isDarkMode ? 'bg-red-500/15' : 'bg-red-100/80'}`}>
                <Icon name="alert-triangle" className={`w-7 h-7 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`} />
              </div>
              <p className={`text-xs font-semibold mb-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('docUpload.extractionFailed')}</p>
              {page.record?.errorPhase && (
                <p className={`text-[11px] mb-2 ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>{page.errorPhaseLabel(page.record.errorPhase)}</p>
              )}
              <p className={`text-xs mb-4 max-w-md mx-auto break-words px-1 ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>{page.errorMessage || t('docUpload.extractionFailed')}</p>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-center gap-3 w-full max-w-sm mx-auto">
                {page.record?.allowedActions?.includes('retry') && (
                  <button type="button" onClick={() => void page.handleRetry()} className="inline-flex items-center justify-center gap-2 min-h-11 w-full sm:w-auto px-3 py-2 rounded-lg text-xs font-semibold bg-brand hover:bg-brand text-brand-foreground transition-all">
                    <Icon name="rotate-ccw" className="w-3.5 h-3.5" />
                    {t('docUpload.retry')}
                  </button>
                )}
                <button type="button" onClick={page.handleReset} className={`inline-flex items-center justify-center gap-2 min-h-11 w-full sm:w-auto px-3 py-2 rounded-lg text-xs font-semibold transition-all ${isDarkMode ? 'surface-premium hover:bg-neutral-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>
                  {t('docUpload.cancel')}
                </button>
              </div>
            </div>
          )}

          {showReview && (
            <div className={`rounded-lg overflow-hidden min-w-0 ${glass}`}>
              <div className={`px-3 py-3 border-b min-w-0 ${isDarkMode ? 'border-neutral-800' : 'border-gray-200/60'}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-green-500/15' : 'bg-green-100/80'}`}>
                      <Icon name="shield" className={`w-5 h-5 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
                    </div>
                    <div className="min-w-0">
                      <h3 className={`text-base font-semibold break-words ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('docUpload.analysisComplete')}</h3>
                      <p className={`text-xs break-words ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>{t('docUpload.reviewHint')}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => page.setEditingFields(!page.editingFields)}
                    disabled={page.flow === 'applying'}
                    className={`flex items-center justify-center gap-1.5 self-start sm:self-auto shrink-0 min-h-11 sm:min-h-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                      page.editingFields
                        ? isDarkMode ? 'bg-brand-soft text-brand' : 'bg-brand-soft text-brand'
                        : isDarkMode ? 'bg-muted text-muted-foreground hover:bg-muted/80' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    } ${page.flow === 'applying' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Icon name="pencil" className="w-3 h-3" />
                    {page.editingFields ? t('docUpload.doneEditing') : t('docUpload.editFields')}
                  </button>
                </div>
              </div>

              <div className={`px-3 py-2 border-b flex flex-wrap items-center gap-2 sm:gap-3 min-w-0 ${isDarkMode ? 'border-neutral-800 bg-neutral-900/40' : 'border-gray-200/60 bg-gray-50/40'}`}>
                <div className="shrink-0">{getFileIcon(page.uploadedFileName)}</div>
                <span className={`min-w-0 flex-1 break-all text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{page.uploadedFileName}</span>
                <span className={`shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full ${isDarkMode ? 'surface-premium text-gray-300' : 'bg-gray-100 text-gray-600'}`}>{page.flowStatusLabel(page.flow)}</span>
                {page.record?.allowedActions?.includes('download') && page.record.hasStoredFile && (
                  <button type="button" onClick={() => void page.handleDownload()} className="text-[10px] font-semibold text-brand underline">
                    {t('docUpload.viewFile')}
                  </button>
                )}
              </div>

              {page.record?.classificationMode === 'AUTO' && page.classificationConfidence && (
                <div className={`px-3 py-2 text-xs ${isDarkMode ? 'bg-brand-soft/40 text-brand' : 'bg-status-info-soft text-status-info'}`}>
                  {page.typeLabel(`documentExtraction.type.${page.confirmedDocType}`, page.confirmedDocType)} · {t('docUpload.confidence')}: {page.classificationConfidence}
                  <span className="block mt-0.5 opacity-80">{t('docUpload.autoReviewHint')}</span>
                </div>
              )}

              {errorBanner(page.errorMessage, isDarkMode)}

              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                  <div className="min-w-0">
                    <label className={`text-xs font-semibold uppercase tracking-wider mb-1.5 block ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>{t('docUpload.documentType')}</label>
                    <div className={`px-3 py-2 rounded-lg text-xs font-semibold break-words ${isDarkMode ? 'bg-brand-soft text-brand' : 'bg-status-info-soft text-status-info'}`}>
                      {page.typeLabel(`documentExtraction.type.${page.confirmedDocType}`, page.confirmedDocType)}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <label className={`text-xs font-semibold uppercase tracking-wider mb-1.5 block ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>{t('docUpload.assignedTo')}</label>
                    <div className={`px-3 py-2 rounded-lg text-xs font-semibold break-words ${isDarkMode ? 'surface-premium text-gray-200' : 'bg-gray-100 text-gray-700'}`}>
                      {page.vehicles.find((v) => v.id === page.selectedVehicleId)?.name || ''}
                    </div>
                  </div>
                </div>

                {page.record?.allowedActions?.includes('set_document_type') && (
                  <div className={`rounded-lg p-3 border min-w-0 ${isDarkMode ? 'border-neutral-800' : 'border-gray-200'}`}>
                    <p className={`text-xs mb-2 break-words ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>{t('docUpload.typeCorrectionWarning')}</p>
                    <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                      <select value={page.pendingTypeSelection} onChange={(e) => page.setPendingTypeSelection(e.target.value)} className={`flex-1 min-w-0 px-3 py-2 rounded-lg text-xs border ${isDarkMode ? 'surface-premium border-neutral-700 text-white' : 'bg-white border-gray-200'}`}>
                        {manualDocTypes.map((opt) => (
                          <option key={opt.value} value={opt.value}>{page.typeLabel(opt.labelKey)}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => void page.handleSetDocumentType(page.pendingTypeSelection, true)} className="min-h-11 px-3 py-2 rounded-lg text-xs font-semibold bg-brand text-brand-foreground">
                        {t('docUpload.reextract')}
                      </button>
                    </div>
                  </div>
                )}

                {page.plausibility && (
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5 min-w-0">
                      <label className={`text-xs font-semibold uppercase tracking-wider block ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>{t('docUpload.plausibilityTitle')}</label>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${plausStyles(page.plausibility.overallStatus)}`}>{page.plausibility.overallStatus}</span>
                    </div>
                    {page.plausibility.checks.length === 0 ? (
                      <div className={`px-3 py-2 rounded-lg text-xs border ${plausStyles('OK')}`}>{t('docUpload.plausibilityOk')}</div>
                    ) : (
                      <div className="space-y-1.5">
                        {page.plausibility.checks.map((c, i) => (
                          <div key={`${c.code}-${i}`} className={`px-3 py-2 rounded-lg text-xs border min-w-0 ${plausStyles(c.status)}`}>
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                              <span className="font-semibold shrink-0">{c.status}</span>
                              <span className="opacity-70 break-words min-w-0">&middot; {c.source}</span>
                            </div>
                            <p className="mt-0.5 break-words">{c.message}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className={`text-xs font-semibold uppercase tracking-wider mb-2 block ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>{t('docUpload.detectedFields')}</label>
                  <div className={`rounded-lg overflow-hidden border ${isDarkMode ? 'border-neutral-800' : 'border-gray-200/60'}`}>
                    {page.editedFields.map((field, i) => (
                      <div key={field.key} className={`flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3 px-3 py-2.5 min-w-0 ${i > 0 ? (isDarkMode ? 'border-t border-neutral-800' : 'border-t border-gray-200/40') : ''}`}>
                        <span className={`sm:w-44 text-xs font-semibold shrink-0 min-w-0 ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>{field.label}</span>
                        {page.editingFields ? (
                          <input
                            value={field.value}
                            onChange={(e) => {
                              const updated = [...page.editedFields];
                              updated[i] = { ...updated[i], value: e.target.value };
                              page.setEditedFields(updated);
                            }}
                            className={`w-full min-w-0 sm:flex-1 text-xs font-semibold px-2 py-1 rounded-md border ${isDarkMode ? 'surface-premium border-neutral-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
                          />
                        ) : (
                          <span className={`w-full min-w-0 break-words text-xs font-semibold ${field.value ? (isDarkMode ? 'text-white' : 'text-gray-900') : (isDarkMode ? 'text-gray-600' : 'text-muted-foreground')}`}>{field.value || '—'}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => void page.handleConfirm()}
                    disabled={page.flow === 'applying' || page.blockerPresent || !page.record?.allowedActions?.includes('confirm')}
                    title={page.blockerPresent ? t('docUpload.blockerHint') : undefined}
                    className={`w-full sm:flex-1 min-h-11 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-green-600 hover:bg-green-500 text-white transition-all shadow-sm ${(page.flow === 'applying' || page.blockerPresent) ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {page.flow === 'applying' ? <Icon name="loader-2" className="w-5 h-5 animate-spin" /> : <Icon name="check-circle" className="w-5 h-5" />}
                    {page.flow === 'applying' ? page.flowStatusLabel('applying') : t('docUpload.confirmAndFile')}
                  </button>
                  {page.record?.allowedActions?.includes('reextract') && (
                    <button type="button" onClick={() => void page.handleReextract()} disabled={page.flow === 'applying'} className={`w-full sm:w-auto min-h-11 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${isDarkMode ? 'surface-premium hover:bg-neutral-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'} ${page.flow === 'applying' ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      <Icon name="rotate-ccw" className="w-3.5 h-3.5" />
                      {t('docUpload.reextract')}
                    </button>
                  )}
                  <button type="button" onClick={page.handleReset} disabled={page.flow === 'applying'} className={`w-full sm:w-auto min-h-11 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${isDarkMode ? 'surface-premium hover:bg-neutral-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'} ${page.flow === 'applying' ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    {t('docUpload.cancel')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {showDone && (
            <div className={`rounded-lg p-6 sm:p-12 text-center min-w-0 ${glass}`}>
              <div className={`w-16 h-16 rounded-lg mx-auto mb-3 flex items-center justify-center ${isDarkMode ? 'bg-green-500/15' : 'bg-green-100/80'}`}>
                <Icon name="check-circle" className={`w-5 h-5 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
              </div>
              <p className={`text-xs font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('docUpload.successFiled')}</p>
              <p className={`text-xs mb-3 break-words ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>
                {t('docUpload.appliedTo', { type: page.typeLabel(`documentExtraction.type.${page.confirmedDocType}`, page.confirmedDocType) })}
              </p>
              <button type="button" onClick={page.handleReset} className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold bg-brand hover:bg-brand text-brand-foreground transition-all">
                <Icon name="upload" className="w-3.5 h-3.5" />
                {t('docUpload.uploadAnother')}
              </button>
            </div>
          )}

          {showCancelled && (
            <div className={`rounded-lg p-6 sm:p-10 text-center min-w-0 ${glass}`}>
              <p className={`text-xs font-semibold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{page.flowStatusLabel('cancelled')}</p>
              <button type="button" onClick={page.handleReset} className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold bg-brand text-brand-foreground">
                {t('docUpload.uploadAnother')}
              </button>
            </div>
          )}

          {page.previewUrl && (
            <div className="mt-3 min-w-0">
              <iframe title={t('docUpload.viewFile')} src={page.previewUrl} className="w-full min-h-[320px] rounded-lg border border-gray-200" />
            </div>
          )}
        </div>

        <div className="space-y-5 min-w-0 w-full">
          <div className={`rounded-lg p-4 min-w-0 ${glass}`}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-5 h-5 rounded-lg flex items-center justify-center sq-tone-info">
                <Icon name="sparkles" className="w-5 h-5" />
              </div>
              <h3 className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('docUpload.aiPowered')}</h3>
            </div>
            <div className="space-y-2">
              {(page.metadata?.documentTypes ?? []).map((type) => (
                <div key={type.value} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg min-w-0 ${isDarkMode ? 'surface-premium' : 'bg-gray-50'}`}>
                  <Icon name="file-text" className={`w-3 h-3 shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`} />
                  <span className={`text-[11px] break-words min-w-0 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{page.typeLabel(type.labelKey)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={`rounded-lg overflow-hidden min-w-0 ${glass}`}>
            <div className={`px-3 py-2 border-b flex items-center justify-between gap-2 ${isDarkMode ? 'border-neutral-800' : 'border-gray-200/60'}`}>
              <h3 className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('docUpload.recentUploads')}</h3>
              {page.historyLoading && <Icon name="loader-2" className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
            <div className="p-3">
              {page.history.length === 0 ? (
                <div className="py-8 text-center">
                  <Icon name="file-text" className={`w-5 h-5 mx-auto mb-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                  <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>{t('docUpload.noUploads')}</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {page.history.map((doc) => (
                    <div key={doc.id} className={`flex flex-col gap-2 p-2.5 rounded-lg transition-colors min-w-0 ${isDarkMode ? 'hover:surface-premium' : 'hover:bg-gray-50'}`}>
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-green-500/10' : 'bg-green-50'}`}>
                          <Icon name="file-text" className="w-4 h-4 text-brand" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[11px] font-semibold break-all ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{doc.sourceFileName || doc.id}</p>
                          <p className={`text-xs break-words ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>
                            {page.typeLabel(`documentExtraction.type.${doc.effectiveDocumentType || doc.documentType || 'OTHER'}`, doc.effectiveDocumentType || doc.documentType || 'OTHER')}
                          </p>
                          <p className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>{page.serverStatusLabel(doc.status)}</p>
                          {doc.errorPhase && doc.status === 'FAILED' && (
                            <p className={`text-[10px] ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>{page.errorPhaseLabel(doc.errorPhase)}</p>
                          )}
                        </div>
                        <span className={`text-[10px] font-medium shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>{formatHistoryDate(doc.createdAt)}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pl-8">{renderHistoryActions(doc)}</div>
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

function errorBanner(message: string | null, isDarkMode: boolean) {
  if (!message) return null;
  return (
    <div className={`px-3 py-2 text-xs font-medium ${isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-700'}`}>
      {message}
    </div>
  );
}
