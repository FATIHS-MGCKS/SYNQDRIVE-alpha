import type { ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import { formatUploadContextBanner, hasUploadContextConflict } from '../../../lib/document-upload-context';
import type { DocumentUploadDuplicateError } from '../../../lib/document-upload-duplicate';
import type { PublicUploadContextDisplay, PublicUploadDuplicate } from '../../lib/document-extraction.types';
import { FLOW_STATUS_LABEL_DE, type FlowStatus } from './document-extraction.shared';
import { DocumentUploadDuplicatePanel } from './DocumentUploadDuplicatePanel';

interface Props {
  flow: FlowStatus;
  uploadedFileName?: string;
  errorMessage?: string | null;
  validationError?: string | null;
  uploadContext?: PublicUploadContextDisplay | null;
  duplicateBlocked?: DocumentUploadDuplicateError | null;
  uploadDuplicateWarning?: PublicUploadDuplicate | null;
  pollNetworkWarning?: boolean;
  showLongRunningHint?: boolean;
  flowStatusLabel?: (flow: FlowStatus) => string;
  onRetry?: () => void;
  onReset?: () => void;
  onAuthorizedReupload?: (reason: string) => void;
  children?: ReactNode;
}

export function DocumentExtractionFlowStatus({
  flow,
  uploadedFileName,
  errorMessage,
  validationError,
  uploadContext,
  duplicateBlocked,
  uploadDuplicateWarning,
  pollNetworkWarning,
  showLongRunningHint,
  flowStatusLabel = (status) => FLOW_STATUS_LABEL_DE[status] ?? status,
  onRetry,
  onReset,
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

  const busy =
    flow === 'validating' ||
    flow === 'uploading' ||
    flow === 'queued' ||
    flow === 'retrying' ||
    flow === 'processing' ||
    flow === 'ocr' ||
    flow === 'classifying' ||
    flow === 'extracting' ||
    flow === 'validating_plausibility' ||
    flow === 'stored' ||
    flow === 'awaiting_type' ||
    flow === 'applying';

  if (busy) {
    return (
      <div className="surface-premium rounded-xl border border-border bg-muted/20 p-8 text-center">
        {contextBanner ? <div className="mb-4 text-left">{contextBanner}</div> : null}
        <Icon name="loader-2" className="mx-auto mb-3 h-8 w-8 animate-spin text-primary" />
        <p className="text-[13px] font-semibold text-foreground">{flowStatusLabel(flow)}</p>
        {uploadedFileName ? (
          <p className="mt-1 truncate text-[11px] text-muted-foreground">{uploadedFileName}</p>
        ) : null}
        {pollNetworkWarning ? (
          <p className="mt-2 text-[11px] text-[color:var(--status-watch)]">Netzwerk instabil — Polling läuft weiter.</p>
        ) : null}
        {showLongRunningHint ? (
          <p className="mt-1 text-[11px] text-muted-foreground">Die Verarbeitung dauert länger als üblich.</p>
        ) : null}
      </div>
    );
  }

  if (flow === 'failed') {
    return (
      <div className="rounded-xl border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.05] p-5 text-center">
        <Icon name="alert-triangle" className="mx-auto mb-2 h-7 w-7 text-[color:var(--status-critical)]" />
        <p className="text-[13px] font-semibold text-foreground">Verarbeitung fehlgeschlagen</p>
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
