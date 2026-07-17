import { useMemo, type ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import { formatUploadContextBanner, hasUploadContextConflict } from '../../../lib/document-upload-context';
import type { DocumentUploadDuplicateError } from '../../../lib/document-upload-duplicate';
import type { PublicDocumentExtraction, PublicUploadContextDisplay, PublicUploadDuplicate } from '../../lib/document-extraction.types';
import {
  buildIntakeProcessingSteps,
  formatProcessingElapsed,
  shouldShowProcessingSteps,
  type IntakeProcessingStepId,
} from '../../lib/document-intake-processing-steps';
import { DocumentIntakeProcessingSteps } from './DocumentIntakeProcessingSteps';
import { FLOW_STATUS_LABEL_DE, type FlowStatus } from './document-extraction.shared';
import { DocumentUploadDuplicatePanel } from './DocumentUploadDuplicatePanel';

interface Props {
  flow: FlowStatus;
  uploadedFileName?: string;
  errorMessage?: string | null;
  validationError?: string | null;
  uploadContext?: PublicUploadContextDisplay | null;
  record?: PublicDocumentExtraction | null;
  duplicateBlocked?: DocumentUploadDuplicateError | null;
  uploadDuplicateWarning?: PublicUploadDuplicate | null;
  pollNetworkWarning?: boolean;
  showLongRunningHint?: boolean;
  processingStartedAt?: number | null;
  processingStepLabels?: Record<IntakeProcessingStepId, string>;
  awaitingTypeDetail?: string | null;
  retryDetail?: string | null;
  elapsedPrefix?: string;
  longRunningHint?: string | null;
  safeLeaveHint?: string | null;
  networkWarning?: string | null;
  isDarkMode?: boolean;
  flowStatusLabel?: (flow: FlowStatus) => string;
  onRetry?: () => void;
  onReset?: () => void;
  onCancel?: () => void;
  onAuthorizedReupload?: (reason: string) => void;
  children?: ReactNode;
}

export function DocumentExtractionFlowStatus({
  flow,
  uploadedFileName,
  errorMessage,
  validationError,
  uploadContext,
  record = null,
  duplicateBlocked,
  uploadDuplicateWarning,
  pollNetworkWarning,
  showLongRunningHint,
  processingStartedAt = null,
  processingStepLabels,
  awaitingTypeDetail,
  retryDetail,
  elapsedPrefix = 'Laufzeit',
  longRunningHint,
  safeLeaveHint,
  networkWarning,
  isDarkMode = false,
  flowStatusLabel = (status) => FLOW_STATUS_LABEL_DE[status] ?? status,
  onRetry,
  onReset,
  onCancel,
  onAuthorizedReupload,
  children,
}: Props) {
  const uploadContextLabel = formatUploadContextBanner(uploadContext ?? null);
  const uploadContextConflict = hasUploadContextConflict(uploadContext ?? null);

  const contextBanner = uploadContextLabel ? (
    <div
      className={`rounded-lg border px-3 py-2 text-[11px] ${
        uploadContextConflict
          ? 'border-[color:var(--status-watch)]/40 bg-[color:var(--status-watch)]/[0.08] text-[color:var(--status-watch)]'
          : 'border-primary/30 bg-primary/[0.06] text-primary'
      }`}
    >
      <p className="font-semibold break-words">{uploadContextLabel}</p>
      {uploadContextConflict && uploadContext?.conflicts?.length ? (
        <ul className="mt-1.5 space-y-1 opacity-90">
          {uploadContext.conflicts.map((entry, index) => (
            <li key={`${entry.message}-${index}`} className="break-words">
              {entry.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  ) : null;

  const processingSteps = useMemo(() => {
    if (!processingStepLabels || !shouldShowProcessingSteps(flow)) return null;
    return buildIntakeProcessingSteps({
      flow,
      status: record?.status,
      processingStage: record?.processingStage,
      errorPhase: record?.errorPhase,
      labels: processingStepLabels,
      awaitingTypeDetail,
      retryDetail: flow === 'failed' ? retryDetail ?? errorMessage : retryDetail,
    });
  }, [
    awaitingTypeDetail,
    errorMessage,
    flow,
    processingStepLabels,
    record?.errorPhase,
    record?.processingStage,
    record?.status,
    retryDetail,
  ]);

  const elapsedLabel = useMemo(() => {
    const started =
      processingStartedAt ??
      (record?.queuedAt ? Date.parse(record.queuedAt) : null) ??
      (record?.createdAt ? Date.parse(record.createdAt) : null);
    if (!started || Number.isNaN(started)) return null;
    return `${elapsedPrefix}: ${formatProcessingElapsed(Date.now() - started)}`;
  }, [elapsedPrefix, processingStartedAt, record?.createdAt, record?.queuedAt]);

  if (validationError && flow === 'idle') {
    return <p className="text-[11px] text-[color:var(--status-critical)]">{validationError}</p>;
  }

  if (flow === 'duplicate_blocked' && duplicateBlocked && onAuthorizedReupload && onReset) {
    return (
      <DocumentUploadDuplicatePanel
        payload={duplicateBlocked.payload}
        onCancel={onReset}
        onReupload={onAuthorizedReupload}
      />
    );
  }

  if (uploadDuplicateWarning) {
    return (
      <div className="space-y-3">
        {contextBanner}
        <div className="rounded-xl border border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.05] p-4">
          <p className="text-[12px] font-semibold text-foreground">Mögliches Business-Duplikat</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Rechnungs- oder Aktenzeichen-Hinweis passt zu einem bestehenden Dokument in dieser Organisation.
            Der Upload wurde dennoch gestartet.
          </p>
        </div>
        {children}
      </div>
    );
  }

  if (processingSteps) {
    const failedStep = processingSteps.find((step) => step.state === 'failed');
    const footerSlot =
      flow === 'failed' ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          {onRetry && record?.allowedActions?.includes('retry') !== false ? (
            <button
              type="button"
              onClick={() => void onRetry()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
            >
              <Icon name="rotate-ccw" className="h-4 w-4" />
              {retryDetail && failedStep ? `Erneut ab „${failedStep.label}“` : 'Erneut versuchen'}
            </button>
          ) : null}
          {onReset ? (
            <button
              type="button"
              onClick={onReset}
              className={`inline-flex min-h-11 items-center justify-center rounded-lg border px-3 py-2 text-xs font-semibold ${
                isDarkMode ? 'border-neutral-700 text-gray-300' : 'border-gray-200 text-gray-600'
              }`}
            >
              Abbrechen
            </button>
          ) : null}
        </div>
      ) : record?.allowedActions?.includes('cancel') && onCancel ? (
        <button
          type="button"
          onClick={() => void onCancel()}
          className={`inline-flex min-h-11 items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold ${
            isDarkMode ? 'surface-premium text-gray-300' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Abbrechen
        </button>
      ) : null;

    return (
      <div className={`rounded-lg p-4 sm:p-6 min-w-0 ${isDarkMode ? '' : ''}`}>
        {contextBanner ? <div className="mb-4">{contextBanner}</div> : null}
        <DocumentIntakeProcessingSteps
          steps={processingSteps}
          uploadedFileName={uploadedFileName}
          elapsedLabel={elapsedLabel}
          longRunningHint={showLongRunningHint ? longRunningHint ?? undefined : undefined}
          safeLeaveHint={showLongRunningHint ? safeLeaveHint ?? undefined : undefined}
          networkWarning={pollNetworkWarning ? networkWarning ?? undefined : undefined}
          isDarkMode={isDarkMode}
          footerSlot={footerSlot}
        />
      </div>
    );
  }

  if (flow === 'failed') {
    return (
      <div className="rounded-xl border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.05] p-5 text-center">
        <Icon name="alert-triangle" className="mx-auto mb-2 h-7 w-7 text-[color:var(--status-critical)]" />
        <p className="text-[13px] font-semibold text-foreground">{flowStatusLabel(flow)}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{errorMessage}</p>
        <div className="mt-4 flex justify-center gap-2">
          {onRetry ? (
            <button
              type="button"
              onClick={() => void onRetry()}
              className="sq-press inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[11px] font-semibold text-primary-foreground"
            >
              <Icon name="rotate-ccw" className="w-3.5 h-3.5" />
              Erneut versuchen
            </button>
          ) : null}
          {onReset ? (
            <button
              type="button"
              onClick={onReset}
              className="sq-press rounded-lg border border-border px-3 py-2 text-[11px] font-semibold text-muted-foreground"
            >
              Abbrechen
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {contextBanner}
      {children}
    </div>
  );
}
