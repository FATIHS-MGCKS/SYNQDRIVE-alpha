import { useCallback, useEffect, useRef } from 'react';
import { Icon } from '../ui/Icon';
import { DetailDrawer } from '../../../components/patterns';
import { StatusChip } from '../../../components/patterns';
import { useDocumentExtractionFlow } from '../../hooks/useDocumentExtractionFlow';
import {
  DOC_TYPE_LABELS,
  EXTRACTION_TEMPLATES,
  FLOW_STATUS_LABEL_DE,
} from './document-extraction.shared';
import { DocumentExtractionFlowStatus } from './DocumentExtractionFlowStatus';
import { DocumentExtractionReviewPanel } from './DocumentExtractionReviewPanel';
import type { VehicleDocumentCategoryId } from '../../lib/vehicle-file-summary.types';
import { CATEGORY_TO_DOC_TYPE } from './vehicle-file.constants';

export type DocumentDrawerMode = 'upload' | 'review' | 'view';

export interface VehicleDocumentUploadDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  vehicleLabel: string;
  categoryId?: VehicleDocumentCategoryId;
  mode?: DocumentDrawerMode;
  extractionId?: string | null;
  fileName?: string | null;
  onComplete?: () => void;
}

export function VehicleDocumentUploadDrawer({
  open,
  onOpenChange,
  vehicleId,
  vehicleLabel,
  categoryId,
  mode = 'upload',
  extractionId: initialExtractionId,
  fileName,
  onComplete,
}: VehicleDocumentUploadDrawerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialDocType = categoryId ? CATEGORY_TO_DOC_TYPE[categoryId] : 'SERVICE';

  const handleComplete = useCallback(() => {
    onComplete?.();
  }, [onComplete]);

  const flow = useDocumentExtractionFlow({
    vehicleId,
    initialDocType,
    onComplete: handleComplete,
  });

  useEffect(() => {
    if (!open) {
      flow.handleReset();
      return;
    }
    if ((mode === 'review' || mode === 'view') && initialExtractionId) {
      void flow.openReview(initialExtractionId, fileName);
    } else {
      flow.handleReset();
      flow.setDocumentType(initialDocType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open/mode driven
  }, [open, mode, initialExtractionId, initialDocType, fileName]);

  const close = () => onOpenChange(false);

  const footer =
    flow.flow === 'ready' || flow.flow === 'applying' ? (
      <div className="flex w-full items-center gap-2">
        <button
          type="button"
          onClick={close}
          disabled={flow.flow === 'applying'}
          className="sq-press rounded-lg border border-border px-3 py-2 text-[11px] font-semibold text-muted-foreground"
        >
          Schließen
        </button>
        <button
          type="button"
          onClick={() => void flow.handleConfirm()}
          disabled={flow.flow === 'applying' || flow.blockerPresent}
          className="sq-press ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--status-success)] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50"
        >
          {flow.flow === 'applying' ? (
            <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Icon name="check-circle" className="w-3.5 h-3.5" />
          )}
          Bestätigen & anwenden
        </button>
      </div>
    ) : flow.flow === 'done' ? (
      <button
        type="button"
        onClick={close}
        className="sq-press rounded-lg bg-primary px-3 py-2 text-[11px] font-semibold text-primary-foreground"
      >
        Fertig
      </button>
    ) : undefined;

  const showReview =
    flow.flow === 'ready' || flow.flow === 'applying' || (mode === 'view' && flow.flow === 'done');

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="AI Document Upload"
      title={mode === 'review' ? 'Dokument prüfen' : mode === 'view' ? 'Dokument ansehen' : 'Dokument hochladen'}
      description={vehicleLabel}
      widthClassName="sm:max-w-xl"
      status={
        <StatusChip tone={flow.flow === 'failed' ? 'critical' : flow.flow === 'duplicate_blocked' ? 'watch' : flow.flow === 'ready' ? 'watch' : 'info'}>
          {FLOW_STATUS_LABEL_DE[flow.flow]}
        </StatusChip>
      }
      footer={footer}
    >
      <div className="space-y-4">
        {mode === 'upload' && flow.flow === 'idle' && (
          <>
            <div>
              <label className="sq-section-label mb-1.5 block">Dokumenttyp</label>
              <select
                value={flow.documentType}
                onChange={(e) => flow.setDocumentType(e.target.value)}
                className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-[12px] font-medium text-foreground"
              >
                {Object.keys(EXTRACTION_TEMPLATES).map((k) => (
                  <option key={k} value={k}>
                    {DOC_TYPE_LABELS[k] || k}
                  </option>
                ))}
              </select>
            </div>

            <div
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void flow.handleFile(f);
              }}
              className="surface-elevated cursor-pointer rounded-xl border-2 border-dashed border-border/80 bg-muted/20 p-8 text-center transition-colors hover:border-primary/40 hover:bg-muted/30"
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={flow.acceptAttr}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void flow.handleFile(f);
                }}
              />
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl sq-tone-brand">
                <Icon name="upload" className="w-5 h-5" />
              </div>
              <p className="text-[13px] font-semibold text-foreground">Datei hier ablegen oder klicken</p>
              <p className="mt-1 text-[11px] text-muted-foreground">PDF, JPG, PNG, WebP, TXT · max. 10 MB</p>
            </div>
          </>
        )}

        <DocumentExtractionFlowStatus
          flow={flow.flow}
          uploadedFileName={flow.uploadedFileName}
          errorMessage={flow.errorMessage}
          validationError={flow.validationError}
          uploadContext={flow.uploadContext}
          duplicateBlocked={flow.duplicateBlocked}
          uploadDuplicateWarning={flow.uploadDuplicateWarning}
          onRetry={() => void flow.handleRetry()}
          onReset={flow.handleReset}
          onAuthorizedReupload={(reason) => void flow.handleAuthorizedReupload(reason)}
        />

        {showReview && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
              <Icon name="file-text" className="w-4 h-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate text-[12px] font-medium text-foreground">
                {flow.uploadedFileName || 'Dokument'}
              </span>
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                {DOC_TYPE_LABELS[flow.confirmedDocType] || flow.confirmedDocType}
              </span>
            </div>

            {flow.errorMessage ? (
              <p className="text-[11px] text-[color:var(--status-critical)]">{flow.errorMessage}</p>
            ) : null}

            <DocumentExtractionReviewPanel
              confirmedDocType={flow.confirmedDocType}
              editedFields={flow.editedFields}
              plausibility={flow.plausibility}
              record={flow.record}
              editingFields={flow.editingFields}
              readOnly={flow.flow !== 'ready'}
              canEdit={flow.flow === 'ready'}
              onToggleEdit={() => flow.setEditingFields(!flow.editingFields)}
              onFieldChange={(index, value) => {
                const next = [...flow.editedFields];
                next[index] = { ...next[index], value };
                flow.setEditedFields(next);
              }}
              footerSlot={
                flow.flow === 'ready' && flow.record?.allowedActions?.includes('reextract') !== false ? (
                  <button
                    type="button"
                    onClick={() => void flow.handleReextract()}
                    className="text-[10px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Erneut extrahieren
                  </button>
                ) : null
              }
            />
          </div>
        )}

        {flow.flow === 'done' && mode === 'upload' && (
          <div className="rounded-xl border border-[color:var(--status-success)]/30 bg-[color:var(--status-success)]/[0.06] p-6 text-center">
            <Icon name="check-circle" className="mx-auto mb-2 h-8 w-8 text-[color:var(--status-success)]" />
            <p className="text-[13px] font-semibold text-foreground">Dokument angewendet</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {DOC_TYPE_LABELS[flow.confirmedDocType] || flow.confirmedDocType}
            </p>
          </div>
        )}
      </div>
    </DetailDrawer>
  );
}
