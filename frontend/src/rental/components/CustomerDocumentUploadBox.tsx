import { Icon } from './ui/Icon';
import { useCallback, useEffect, useRef, useState } from 'react';

import { toast } from 'sonner';
import { api } from '../../lib/api';
import type { CustomerDocumentApiType } from '../lib/entityMappers';

// ------------------------------------------------
// CustomerDocumentUploadBox
//
// For existing customers: uploads via CustomerDocument API.
// For registration wizards (no customerId yet): holds File locally until
// the customer row exists, then parent calls uploadPendingCustomerDocuments.
// ------------------------------------------------

export type CustomerDocumentSlot =
  | 'id-front'
  | 'id-back'
  | 'license-front'
  | 'license-back';

export interface CustomerDocumentRecord {
  id: string;
  type: string;
  status: string;
  fileKey: string;
  createdAt?: string;
  reviewedAt?: string | null;
  reviewedByUserId?: string | null;
  rejectedReason?: string | null;
  expiresAt?: string | null;
}

export interface CustomerDocumentUploadBoxProps {
  label: string;
  documentType: CustomerDocumentApiType;
  orgId: string | undefined;
  customerId?: string;
  document?: CustomerDocumentRecord | null;
  /** Wizard mode — file selected before customer exists */
  pendingFile?: File | null;
  /** Legacy read-only preview URL when no CustomerDocument row exists */
  legacyPreviewUrl?: string | null;
  errorMessage?: string;
  onDocumentUploaded?: (doc: CustomerDocumentRecord) => void;
  onPendingFileChange?: (file: File | null) => void;
}

function resolvePreviewUrl(
  document: CustomerDocumentRecord | null | undefined,
  pendingFile: File | null | undefined,
  legacyPreviewUrl: string | null | undefined,
): string | null {
  if (document?.fileKey) {
    return document.fileKey.startsWith('http') || document.fileKey.startsWith('/')
      ? document.fileKey
      : `/uploads/${document.fileKey}`;
  }
  if (pendingFile) return URL.createObjectURL(pendingFile);
  return legacyPreviewUrl ?? null;
}

export function CustomerDocumentUploadBox({
  label,
  documentType,
  orgId,
  customerId,
  document,
  pendingFile,
  legacyPreviewUrl,
  errorMessage,
  onDocumentUploaded,
  onPendingFileChange,
}: CustomerDocumentUploadBoxProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  const previewUrl = resolvePreviewUrl(document, pendingFile, legacyPreviewUrl) ?? objectUrl;
  const hasContent = Boolean(document || pendingFile || legacyPreviewUrl || objectUrl);

  useEffect(() => {
    if (!pendingFile) {
      setObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

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

      if (!customerId) {
        onPendingFileChange?.(file);
        if (inputRef.current) inputRef.current.value = '';
        return;
      }

      setUploading(true);
      try {
        const res = await api.customers.customerDocuments.upload(
          orgId,
          customerId,
          documentType,
          file,
        );
        onDocumentUploaded?.(res as unknown as CustomerDocumentRecord);
        toast.success('Dokument hochgeladen');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Upload fehlgeschlagen';
        setLocalError(msg);
        toast.error('Upload fehlgeschlagen', { description: msg });
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [orgId, customerId, documentType, onDocumentUploaded, onPendingFileChange],
  );

  const isImage = hasContent && previewUrl && !/\.pdf($|\?)/i.test(previewUrl);

  const dropzoneClass = uploading
    ? 'border-[color:var(--brand)]/40 bg-[color:var(--brand-soft)]'
    : hasContent
      ? 'border-[color:var(--status-positive)]/40 bg-[color:var(--status-positive-soft)]'
      : errorMessage || localError
        ? 'border-[color:var(--status-critical)]/40 bg-[color:var(--status-critical-soft)]'
        : 'border-border bg-muted/30 hover:border-[color:var(--brand)]/40 hover:bg-[color:var(--brand-soft)]';

  const clearSelection = () => {
    if (inputRef.current) inputRef.current.value = '';
    if (!customerId) {
      onPendingFileChange?.(null);
    }
  };

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
        ) : hasContent ? (
          <div className="flex flex-col items-center gap-2">
            {isImage && previewUrl ? (
              <img
                src={previewUrl}
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
                {customerId ? 'Hochgeladen' : 'Ausgewählt'}
              </span>
              {!customerId && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--status-critical)] hover:opacity-80"
                >
                  <Icon name="trash-2" className="w-3 h-3" />
                  Entfernen
                </button>
              )}
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
