import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle, FileUp, Loader2, X } from 'lucide-react';
import { StatusChip } from '../../components/patterns';
import { useDocumentExtractionFlow } from '../../rental/hooks/useDocumentExtractionFlow';
import {
  FLOW_STATUS_LABEL_DE,
} from '../../rental/components/documents/document-extraction.shared';
import type { OperatorSheetAction } from '../lib/operatorTypes';
import { useOperatorShell } from '../context/OperatorShellContext';
import {
  CONTEXT_DEFAULT_DOC_TYPE,
  CONTEXT_MODE_LABELS,
  OPERATOR_DOC_TYPE_OPTIONS,
  OPERATOR_UPLOAD_SOURCE,
  type OperatorAiUploadContextMode,
} from './operatorAiUpload.config';
import { mapOperatorContextModeToEntry } from '../../rental/lib/document-intake-entry';
import { useRentalOrg } from '../../rental/RentalContext';
import { OperatorAiUploadReview } from './OperatorAiUploadReview';
import { extractTreadFromAiReviewFields, parseTreadMm } from '../tire-measure/operatorTireMeasure.utils';

type AiUploadAction = Extract<OperatorSheetAction, { type: 'ai-upload' }>;

interface Props {
  action: AiUploadAction;
}

export function OperatorAiUploadFlow({ action }: Props) {
  const { closeSheet, openSheet } = useOperatorShell();
  const { orgId } = useRentalOrg();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const contextMode: OperatorAiUploadContextMode = action.contextMode ?? 'vehicle';
  const initialDocType = action.initialDocType ?? CONTEXT_DEFAULT_DOC_TYPE[contextMode];
  const operatorContext = mapOperatorContextModeToEntry({
    contextMode,
    vehicleId: action.vehicleId,
    bookingId: action.bookingId,
    customerId: action.customerId,
  });

  const flow = useDocumentExtractionFlow({
    vehicleId: action.vehicleId,
    orgId,
    initialDocType,
    uploadSource: OPERATOR_UPLOAD_SOURCE,
    optionalContextType: operatorContext.optionalContextType,
    optionalContextId: operatorContext.optionalContextId,
    sourceSurface: 'operator_ai_upload',
    onComplete: () => {
      action.onComplete?.();
      setTimeout(closeSheet, 900);
    },
  });

  useEffect(() => {
    flow.setDocumentType(initialDocType);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when action context changes
  }, [action.vehicleId, initialDocType]);

  useEffect(() => {
    return () => {
      if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    };
  }, [pendingPreview]);

  const contextLines = useMemo(() => {
    const lines: string[] = [];
    lines.push(`Fahrzeug: ${action.vehicleLabel}`);
    if (action.bookingId) lines.push(`Buchung: ${action.bookingId.slice(0, 8)}…`);
    if (action.customerName) lines.push(`Kunde: ${action.customerName}`);
    else if (action.customerId) lines.push(`Kunde-ID: ${action.customerId.slice(0, 8)}…`);
    if (action.damageId) lines.push(`Schaden: ${action.damageId.slice(0, 8)}…`);
    lines.push(`Kontext: ${CONTEXT_MODE_LABELS[contextMode]}`);
    return lines;
  }, [action, contextMode]);

  const clearPending = () => {
    setPendingFile(null);
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingPreview(null);
    setPickError(null);
  };

  const handlePick = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setPickError(null);
    clearPending();
    setPendingFile(file);
    if (file.type.startsWith('image/')) {
      setPendingPreview(URL.createObjectURL(file));
    }
  };

  const startAnalysis = () => {
    if (!pendingFile) {
      setPickError('Bitte zuerst ein Foto oder eine Datei wählen.');
      return;
    }
    void flow.handleFile(pendingFile);
    clearPending();
  };

  const handleClose = () => {
    flow.handleReset();
    clearPending();
    closeSheet();
  };

  const showCapture = flow.flow === 'idle' || flow.flow === 'failed';
  const showReview = flow.flow === 'ready' || flow.flow === 'applying';
  const showDone = flow.flow === 'done';
  const isTireDoc = flow.confirmedDocType === 'TIRE' || flow.documentType === 'TIRE';

  const openTireMeasureFromReview = () => {
    const treadForm = extractTreadFromAiReviewFields(
      flow.editedFields.map((f) => ({ key: f.key, value: f.value })),
    );
    const hasAny = [treadForm.fl, treadForm.fr, treadForm.rl, treadForm.rr].some((v) => v.trim());
    if (!hasAny) {
      setPickError('Keine Profiltiefen erkannt — bitte Felder prüfen oder manuell eintragen.');
      return;
    }
    setPickError(null);
    openSheet({
      type: 'tire-measure',
      vehicleId: action.vehicleId,
      vehicleLabel: action.vehicleLabel,
      bookingId: action.bookingId,
      prefilledTread: {
        fl: parseTreadMm(treadForm.fl),
        fr: parseTreadMm(treadForm.fr),
        rl: parseTreadMm(treadForm.rl),
        rr: parseTreadMm(treadForm.rr),
      },
      sourceHint: 'ai_confirmed',
      onSuccess: action.onComplete,
    });
    flow.handleReset();
    clearPending();
    closeSheet();
  };

  return (
    <div
      className="fixed inset-0 z-[140] flex flex-col bg-background"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      role="dialog"
      aria-modal
      aria-labelledby="operator-ai-upload-title"
    >
      <header className="shrink-0 border-b border-border/50 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">AI Upload</p>
            <h2 id="operator-ai-upload-title" className="truncate text-base font-bold text-foreground">
              {action.vehicleLabel}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="sq-press flex h-11 w-11 items-center justify-center rounded-xl border border-border/60"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <StatusChip tone="info">{FLOW_STATUS_LABEL_DE[flow.flow]}</StatusChip>
          <StatusChip tone="neutral">{CONTEXT_MODE_LABELS[contextMode]}</StatusChip>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">
        {showCapture && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border surface-premium p-4 space-y-1">
              {contextLines.map((line) => (
                <p key={line} className="text-xs text-muted-foreground">
                  {line}
                </p>
              ))}
            </div>

            <p className="text-sm text-muted-foreground">
              Dokument fotografieren oder hochladen. Die KI extrahiert Felder — Übernahme erst nach
              deiner Bestätigung.
            </p>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Dokumenttyp</p>
              <div className="flex flex-wrap gap-2">
                {OPERATOR_DOC_TYPE_OPTIONS.map((opt) => {
                  const active = flow.documentType === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => flow.setDocumentType(opt.key)}
                      className={`sq-press min-h-[40px] rounded-full border px-3 py-2 text-xs font-semibold ${
                        active
                          ? 'border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                          : 'border-border surface-premium text-foreground'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {pendingPreview && (
              <img
                src={pendingPreview}
                alt="Vorschau"
                className="max-h-48 w-full rounded-2xl border border-border object-cover"
              />
            )}
            {pendingFile && !pendingPreview && (
              <div className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm">
                {pendingFile.name}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="sq-press flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)]/40"
              >
                <Camera className="h-8 w-8 text-[color:var(--brand)]" />
                <span className="text-sm font-semibold">Kamera</span>
              </button>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="sq-press flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border/70 surface-premium"
              >
                <FileUp className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-semibold">Datei</span>
              </button>
            </div>

            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                handlePick(e.target.files);
                e.target.value = '';
              }}
            />
            <input
              ref={galleryRef}
              type="file"
              accept={flow.acceptAttr}
              className="hidden"
              onChange={(e) => {
                handlePick(e.target.files);
                e.target.value = '';
              }}
            />

            {(pickError || flow.errorMessage) && flow.flow === 'failed' && (
              <p className="text-xs text-[color:var(--status-critical)]">
                {pickError ?? flow.errorMessage}
              </p>
            )}
            {pickError && flow.flow === 'idle' && (
              <p className="text-xs text-[color:var(--status-critical)]">{pickError}</p>
            )}
            {flow.validationError && flow.flow === 'idle' && (
              <p className="text-xs text-[color:var(--status-critical)]">{flow.validationError}</p>
            )}
          </div>
        )}

        {flow.isBusy && (
          <div className="flex flex-col items-center py-16 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-[color:var(--brand)]" />
            <p className="mt-4 text-sm font-semibold">{FLOW_STATUS_LABEL_DE[flow.flow]}</p>
            {flow.uploadedFileName && (
              <p className="mt-1 text-xs text-muted-foreground">{flow.uploadedFileName}</p>
            )}
          </div>
        )}

        {showReview && (
          <OperatorAiUploadReview
            confirmedDocType={flow.confirmedDocType}
            uploadedFileName={flow.uploadedFileName}
            editedFields={flow.editedFields}
            plausibility={flow.plausibility}
            editing={flow.editingFields}
            onToggleEdit={() => flow.setEditingFields(!flow.editingFields)}
            onFieldChange={(index, value) => {
              flow.setEditedFields((prev) =>
                prev.map((f, i) => (i === index ? { ...f, value } : f)),
              );
            }}
          />
        )}

        {showDone && (
          <div className="flex flex-col items-center py-16 text-center">
            <CheckCircle className="h-12 w-12 text-[color:var(--status-success)]" />
            <p className="mt-4 text-base font-semibold">Dokument übernommen</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Daten wurden über die kanonische Bestätigungs-Pipeline angewendet.
            </p>
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-border/50 surface-frosted px-4 py-3">
        <div className="flex gap-2">
          {showCapture && (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="sq-3d-btn sq-3d-btn--neutral min-h-[52px] flex-1 text-sm font-semibold"
              >
                Zurück
              </button>
              {flow.flow === 'failed' ? (
                <button
                  type="button"
                  onClick={() => {
                    flow.handleReset();
                    clearPending();
                  }}
                  className="sq-3d-btn sq-3d-btn--primary min-h-[52px] flex-1 text-sm font-bold"
                >
                  Neu versuchen
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!pendingFile}
                  onClick={startAnalysis}
                  className="sq-3d-btn sq-3d-btn--primary min-h-[52px] flex-[2] text-sm font-bold disabled:opacity-50"
                >
                  Analyse starten
                </button>
              )}
            </>
          )}

          {showReview && (
            <div className="flex w-full flex-col gap-2">
              {isTireDoc && (
                <button
                  type="button"
                  disabled={flow.flow === 'applying'}
                  onClick={openTireMeasureFromReview}
                  className="sq-3d-btn sq-3d-btn--neutral min-h-[48px] w-full text-sm font-semibold disabled:opacity-50"
                >
                  Als Reifenmessung übernehmen
                </button>
              )}
              {pickError && isTireDoc && (
                <p className="text-xs text-[color:var(--status-critical)]">{pickError}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={flow.flow === 'applying'}
                  onClick={() => {
                    flow.handleReset();
                    clearPending();
                  }}
                  className="sq-3d-btn sq-3d-btn--neutral min-h-[52px] flex-1 text-sm font-semibold disabled:opacity-50"
                >
                  Verwerfen
                </button>
                <button
                  type="button"
                  disabled={flow.flow === 'applying' || flow.blockerPresent}
                  onClick={() => void flow.handleConfirm()}
                  className="sq-3d-btn sq-3d-btn--success min-h-[52px] flex-[2] text-sm font-bold disabled:opacity-50"
                >
                  {flow.flow === 'applying' ? (
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  ) : (
                    'Bestätigen & übernehmen'
                  )}
                </button>
              </div>
            </div>
          )}

          {showDone && (
            <button
              type="button"
              onClick={handleClose}
              className="sq-3d-btn sq-3d-btn--primary min-h-[52px] w-full text-sm font-bold"
            >
              Fertig
            </button>
          )}

          {flow.isBusy && (
            <button
              type="button"
              disabled
              className="sq-3d-btn sq-3d-btn--neutral min-h-[52px] w-full text-sm font-semibold opacity-50"
            >
              Bitte warten…
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
