import { CheckCircle, Eye, Sparkles, Upload } from 'lucide-react';
import { Icon } from './ui/Icon';

import { formatUploadContextBanner, hasUploadContextConflict } from '../../lib/document-upload-context';
import { useLanguage } from '../i18n/LanguageContext';
import { useRentalOrg } from '../RentalContext';
import { useDocumentUploadPage } from '../hooks/useDocumentUploadPage';
import type { PlausibilityStatus } from './documents/document-extraction.shared';
import type { PublicDocumentExtractionSummary } from '../lib/document-extraction.types';
import { DocumentExtractionReviewPanel } from './documents/DocumentExtractionReviewPanel';
import { DocumentExtractionFlowStatus } from './documents/DocumentExtractionFlowStatus';
import { DocumentIntakeUploadZone } from './documents/DocumentIntakeUploadZone';
import { DocumentClassificationResultPanel } from './documents/DocumentClassificationResultPanel';

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
  const { t, locale } = useLanguage();
  const { orgId } = useRentalOrg();

  const page = useDocumentUploadPage({ orgId, locale, t });

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

  const showMainIdle = page.flow === 'idle';
  const showAwaitingType = page.flow === 'awaiting_type';
  const showProcessingStatus = (page.isBusy && !showAwaitingType) || page.flow === 'failed';
  const showDuplicate = page.flow === 'duplicate_blocked';
  const showReview = page.flow === 'ready' || page.flow === 'applying';
  const showDone = page.flow === 'done';
  const showCancelled = page.flow === 'cancelled';
  const uploadContextBanner = formatUploadContextBanner(page.record?.uploadContext);
  const uploadContextConflict = hasUploadContextConflict(page.record?.uploadContext);

  const flowStatusProps = {
    flow: page.flow,
    uploadedFileName: page.uploadedFileName,
    errorMessage: page.errorMessage,
    validationError: page.validationError,
    uploadContext: page.record?.uploadContext,
    record: page.record,
    duplicateBlocked: page.duplicateBlocked,
    uploadDuplicateWarning: page.uploadDuplicateWarning,
    pollNetworkWarning: page.pollNetworkWarning,
    showLongRunningHint: page.showLongRunningHint,
    processingStartedAt: page.processingStartedAt,
    processingStepLabels: page.processingStepLabels,
    awaitingTypeDetail: t('docUpload.awaitingTypeStepDetail'),
    retryDetail: page.flow === 'retrying' ? t('docUpload.retryStepDetail') : t('docUpload.retryAtFailedStep'),
    elapsedPrefix: t('docUpload.processingElapsed'),
    longRunningHint: t('docUpload.longRunningHint'),
    safeLeaveHint: t('docUpload.safeLeaveHint'),
    networkWarning: t('docUpload.networkWarning'),
    isDarkMode,
    onRetry: page.handleRetry,
    onReset: page.handleReset,
    onCancel: page.handleCancel,
    onAuthorizedReupload: page.handleAuthorizedReupload,
  };

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
            <div className={`rounded-lg p-4 min-w-0 ${isDarkMode ? 'bg-neutral-900 border border-neutral-800' : 'bg-white border border-gray-200'}`}>
              <DocumentIntakeUploadZone
                acceptAttr={page.acceptAttr}
                supportedFormatsLabel={page.supportedFormatsLabel}
                onFilesSelected={page.handleDropFiles}
                dropzoneLabel={t('docUpload.dropzone')}
                dropzoneActiveLabel={t('docUpload.dropzoneActive')}
                browseLabel={t('docUpload.browse')}
                validationError={page.validationError}
                contextHint={uploadContextBanner}
                contextConflict={uploadContextConflict}
                isDarkMode={isDarkMode}
                headerSlot={
                  <p className={`text-xs break-words ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>
                    {t('docUpload.initialUploadHint')}
                  </p>
                }
              />
            </div>
          )}

          {showProcessingStatus && (
            <div className={`rounded-lg min-w-0 ${glass}`}>
              <DocumentExtractionFlowStatus {...flowStatusProps} />
            </div>
          )}

          {showAwaitingType && (
            <div className={`rounded-lg p-4 sm:p-6 min-w-0 space-y-4 ${glass}`}>
              <DocumentExtractionFlowStatus {...flowStatusProps} />
              <div className="border-t pt-4 min-w-0" style={{ borderColor: isDarkMode ? 'var(--border)' : undefined }}>
                <h3 className={`text-base font-semibold mb-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('docUpload.awaitingTypeTitle')}</h3>
                <p className={`text-xs mb-4 break-words ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>{t('docUpload.awaitingTypeHint')}</p>
                <DocumentClassificationResultPanel
                  record={page.record}
                  locale={locale}
                  t={t}
                  typeLabel={page.typeLabel}
                  isDarkMode={isDarkMode}
                  mode="awaiting_type"
                  docTypeOptions={page.docTypeOptions}
                  pendingTypeSelection={page.pendingTypeSelection}
                  onPendingTypeChange={page.setPendingTypeSelection}
                  onSetDocumentType={(type, reextract) => void page.handleSetDocumentType(type, reextract)}
                />
              </div>
            </div>
          )}

          {showDuplicate && page.duplicateBlocked && (
            <DocumentExtractionFlowStatus
              flow={page.flow}
              duplicateBlocked={page.duplicateBlocked}
              onReset={page.handleReset}
              onAuthorizedReupload={(reason) => void page.handleAuthorizedReupload?.(reason)}
            />
          )}

          {showReview && (
            <div className={`rounded-lg overflow-hidden min-w-0 ${glass}`}>
              {uploadContextBanner && (
                <div className={`px-3 py-2 border-b min-w-0 ${isDarkMode ? 'border-neutral-800' : 'border-gray-200/60'}`}>
                  {uploadContextBannerNode(uploadContextBanner, uploadContextConflict, page.record?.uploadContext?.conflicts, isDarkMode)}
                </div>
              )}
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

              {errorBanner(page.errorMessage, isDarkMode)}

              <div className="p-4 space-y-4">
                <DocumentClassificationResultPanel
                  record={page.record}
                  locale={locale}
                  t={t}
                  typeLabel={page.typeLabel}
                  isDarkMode={isDarkMode}
                  mode="review"
                  docTypeOptions={page.docTypeOptions}
                  pendingTypeSelection={page.pendingTypeSelection}
                  onPendingTypeChange={page.setPendingTypeSelection}
                  onSetDocumentType={(type, reextract) => void page.handleSetDocumentType(type, reextract)}
                  disabled={page.flow === 'applying'}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                  <div className="min-w-0">
                    <label className={`text-xs font-semibold uppercase tracking-wider mb-1.5 block ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>{t('docUpload.documentType')}</label>
                    <div className={`px-3 py-2 rounded-lg text-xs font-semibold break-words ${isDarkMode ? 'bg-brand-soft text-brand' : 'bg-status-info-soft text-status-info'}`}>
                      {page.typeLabel(`documentExtraction.type.${page.confirmedDocType}`, page.confirmedDocType)}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <label className={`text-xs font-semibold uppercase tracking-wider mb-1.5 block ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>{t('docUpload.assignedTo')}</label>
                    {page.flow === 'ready' && page.record?.allowedActions?.includes('confirm') ? (
                      <select
                        value={page.assignedVehicleId}
                        onChange={(e) => void page.handleReassignVehicle(e.target.value)}
                        className={`w-full min-w-0 px-3 py-2 rounded-lg text-xs font-semibold border ${isDarkMode ? 'surface-premium border-neutral-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
                      >
                        <option value="">{t('docUpload.assignVehiclePlaceholder')}</option>
                        {page.vehicles.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}{v.licensePlate ? ` · ${v.licensePlate}` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className={`px-3 py-2 rounded-lg text-xs font-semibold break-words ${isDarkMode ? 'surface-premium text-gray-200' : 'bg-gray-100 text-gray-700'}`}>
                        {page.vehicles.find((v) => v.id === page.assignedVehicleId)?.name || t('docUpload.assignVehiclePlaceholder')}
                      </div>
                    )}
                  </div>
                </div>

                <DocumentExtractionReviewPanel
                  confirmedDocType={page.confirmedDocType}
                  editedFields={page.editedFields}
                  plausibility={page.plausibility}
                  record={page.record}
                  editingFields={page.editingFields}
                  readOnly={page.flow !== 'ready'}
                  canEdit={false}
                  showEntityResolution
                  showActionPreview
                  entityReviewOrgId={orgId}
                  entityReviewVehicleId={page.assignedVehicleId || null}
                  entityReviewExtractionId={page.extractionId}
                  entityReviewT={t}
                  vehicleLookup={page.vehicleLookup}
                  onEntityLinksUpdated={page.handleEntityLinksUpdated}
                  onSchemaReviewUpdated={page.handleSchemaReviewUpdated}
                  onFieldChange={(index, value) => {
                    const updated = [...page.editedFields];
                    updated[index] = { ...updated[index], value };
                    page.setEditedFields(updated);
                  }}
                  fieldsTitle={t('docUpload.detectedFields')}
                  plausibilityTitle={t('docUpload.plausibilityTitle')}
                  isDarkMode={isDarkMode}
                />

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => void page.handleConfirm()}
                    disabled={page.flow === 'applying' || !page.canConfirm || !page.record?.allowedActions?.includes('confirm')}
                    title={!page.canConfirm ? t('docUpload.assignVehicleBeforeConfirm') : page.blockerPresent ? t('docUpload.blockerHint') : undefined}
                    className={`w-full sm:flex-1 min-h-11 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-green-600 hover:bg-green-500 text-white transition-all shadow-sm ${(page.flow === 'applying' || !page.canConfirm) ? 'opacity-60 cursor-not-allowed' : ''}`}
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

function uploadContextBannerNode(
  label: string,
  conflict: boolean,
  conflicts: Array<{ message: string }> | undefined,
  isDarkMode: boolean,
) {
  return (
    <div
      className={`mb-3 rounded-lg border px-3 py-2 text-left text-xs ${
        conflict
          ? isDarkMode
            ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
            : 'border-amber-200 bg-amber-50 text-amber-900'
          : isDarkMode
            ? 'border-brand/30 bg-brand-soft/40 text-brand'
            : 'border-status-info/30 bg-status-info-soft text-status-info'
      }`}
    >
      <p className="font-semibold break-words">{label}</p>
      {conflict && conflicts && conflicts.length > 0 ? (
        <ul className="mt-1.5 space-y-1 text-[11px] opacity-90">
          {conflicts.map((entry, index) => (
            <li key={`${entry.message}-${index}`} className="break-words">
              {entry.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
