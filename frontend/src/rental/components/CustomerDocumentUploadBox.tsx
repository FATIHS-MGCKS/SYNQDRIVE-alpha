import { Icon } from './ui/Icon';
import { useCallback, useRef, useState } from 'react';

import { toast } from 'sonner';
import { api } from '../../lib/api';

// ------------------------------------------------
// CustomerDocumentUploadBox (V4.6.65)
//
// Shared KYC upload widget used in:
//   - CustomersView → "Neuer Kunde" wizard (step 3 Dokumente)
//   - NewBookingView → inline "Neuer Kunde" wizard
//
// Declared at module scope on purpose: previously the upload UI was defined
// *inside* the modal render function, which caused React to treat the
// component type as fresh on every parent re-render, remount the hidden
// <input type="file"> and discard the user's file selection — which is why
// clicking upload appeared to do nothing and the user could not proceed
// through registration.
//
// On selection we upload immediately via `api.customers.uploadDocument` so the
// returned URL can be persisted with the Customer row. Files land under
// /uploads/customer-documents/ and survive page reloads.
// ------------------------------------------------

export type CustomerDocumentSlot =
  | 'id-front'
  | 'id-back'
  | 'license-front'
  | 'license-back';

export interface CustomerDocumentUploadBoxProps {
  label: string;
  url: string | null;
  slot: CustomerDocumentSlot;
  orgId: string | undefined;
  errorMessage?: string;
  onUploaded: (url: string) => void;
  onCleared: () => void;
}

export function CustomerDocumentUploadBox({
  label,
  url,
  slot,
  orgId,
  errorMessage,
  onUploaded,
  onCleared,
}: CustomerDocumentUploadBoxProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const labelClass =
    'block text-xs font-semibold uppercase tracking-wider mb-1.5 text-muted-foreground';

  const handleFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      if (!orgId) {
        const msg = 'Keine Organisation geladen';
        setLocalError(msg);
        toast.error(msg);
        return;
      }
      setLocalError(null);
      setUploading(true);
      try {
        const res = await api.customers.uploadDocument(orgId, slot, file);
        onUploaded(res.url);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Upload fehlgeschlagen';
        setLocalError(msg);
        toast.error('Upload fehlgeschlagen', { description: msg });
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [orgId, slot, onUploaded],
  );

  const hasUrl = Boolean(url);
  const isImage = hasUrl && !/\.pdf($|\?)/i.test(url || '');

  const dropzoneClass = uploading
    ? 'border-[color:var(--brand)]/40 bg-[color:var(--brand-soft)]'
    : hasUrl
      ? 'border-[color:var(--status-positive)]/40 bg-[color:var(--status-positive-soft)]'
      : errorMessage || localError
        ? 'border-[color:var(--status-critical)]/40 bg-[color:var(--status-critical-soft)]'
        : 'border-border bg-muted/30 hover:border-[color:var(--brand)]/40 hover:bg-[color:var(--brand-soft)]';

  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div
        className={`relative rounded-lg border-2 border-dashed p-3 text-center transition-all ${dropzoneClass}`}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-1.5 py-1">
            <Icon name="loader-2" className="w-5 h-5 text-[color:var(--brand)] animate-spin" />
            <span className="text-xs font-semibold text-[color:var(--brand-ink)]">
              Wird hochgeladen…
            </span>
          </div>
        ) : hasUrl ? (
          <div className="flex flex-col items-center gap-2">
            {isImage ? (
              <img
                src={url || ''}
                alt={label}
                className="h-16 w-auto max-w-full rounded-md object-contain border border-[color:var(--status-positive)]/20"
              />
            ) : (
              <div className="flex items-center gap-2">
                <Icon name="file-text" className="w-5 h-5 text-[color:var(--status-positive)]" />
                <span className="text-xs font-semibold text-[color:var(--status-positive)]">
                  PDF hochgeladen
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Icon name="check-circle" className="w-3.5 h-3.5 text-[color:var(--status-positive)]" />
              <span className="text-[11px] font-semibold text-[color:var(--status-positive)]">
                Hochgeladen
              </span>
              <button
                type="button"
                onClick={() => {
                  if (inputRef.current) inputRef.current.value = '';
                  onCleared();
                }}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--status-critical)] hover:opacity-80"
              >
                <Icon name="trash-2" className="w-3 h-3" />
                Entfernen
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center gap-1.5 w-full cursor-pointer py-1"
          >
            <Icon name="camera" className="w-5 h-5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              Klicken zum Hochladen
            </span>
            <span className="text-[10px] text-muted-foreground/80">
              JPG, PNG oder PDF (max. 8 MB)
            </span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            void handleFile(file);
          }}
        />
      </div>
      {(errorMessage || localError) && (
        <p className="text-[11px] text-[color:var(--status-critical)] mt-1">
          {errorMessage || localError}
        </p>
      )}
    </div>
  );
}
