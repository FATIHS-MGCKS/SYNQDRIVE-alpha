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
  isDarkMode: boolean;
  errorMessage?: string;
  onUploaded: (url: string) => void;
  onCleared: () => void;
}

export function CustomerDocumentUploadBox({
  label,
  url,
  slot,
  orgId,
  isDarkMode,
  errorMessage,
  onUploaded,
  onCleared,
}: CustomerDocumentUploadBoxProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const labelClass = `block text-xs font-semibold uppercase tracking-wider mb-1.5 ${
    isDarkMode ? 'text-gray-500' : 'text-gray-400'
  }`;

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

  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div
        className={`relative rounded-lg border-2 border-dashed p-3 text-center transition-all ${
          uploading
            ? isDarkMode
              ? 'border-blue-500/40 bg-blue-500/5'
              : 'border-blue-300 bg-blue-50/50'
            : hasUrl
              ? isDarkMode
                ? 'border-emerald-500/40 bg-emerald-500/5'
                : 'border-emerald-300 bg-emerald-50/50'
              : errorMessage || localError
                ? 'border-red-300 bg-red-50/30'
                : isDarkMode
                  ? 'border-neutral-700/50 bg-neutral-800/30 hover:border-blue-500/40 hover:bg-blue-500/5'
                  : 'border-gray-200 bg-gray-50/50 hover:border-blue-300 hover:bg-blue-50/30'
        }`}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-1.5 py-1">
            <Icon name="loader-2" className="w-5 h-5 text-blue-500 animate-spin" />
            <span
              className={`text-xs font-semibold ${
                isDarkMode ? 'text-blue-300' : 'text-blue-600'
              }`}
            >
              Wird hochgeladen…
            </span>
          </div>
        ) : hasUrl ? (
          <div className="flex flex-col items-center gap-2">
            {isImage ? (
              <img
                src={url || ''}
                alt={label}
                className="h-16 w-auto max-w-full rounded-md object-contain border border-emerald-500/20"
              />
            ) : (
              <div className="flex items-center gap-2">
                <Icon name="file-text" className="w-5 h-5 text-emerald-500" />
                <span
                  className={`text-xs font-semibold ${
                    isDarkMode ? 'text-emerald-400' : 'text-emerald-600'
                  }`}
                >
                  PDF hochgeladen
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Icon name="check-circle" className="w-3.5 h-3.5 text-emerald-500" />
              <span
                className={`text-[11px] font-semibold ${
                  isDarkMode ? 'text-emerald-400' : 'text-emerald-600'
                }`}
              >
                Hochgeladen
              </span>
              <button
                type="button"
                onClick={() => {
                  if (inputRef.current) inputRef.current.value = '';
                  onCleared();
                }}
                className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                  isDarkMode
                    ? 'text-red-400 hover:text-red-300'
                    : 'text-red-500 hover:text-red-600'
                }`}
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
            <Icon name="camera"
              className={`w-5 h-5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}
            />
            <span
              className={`text-xs font-medium ${
                isDarkMode ? 'text-gray-400' : 'text-gray-500'
              }`}
            >
              Klicken zum Hochladen
            </span>
            <span
              className={`text-[10px] ${
                isDarkMode ? 'text-gray-600' : 'text-gray-400'
              }`}
            >
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
        <p className="text-[11px] text-red-500 mt-1">
          {errorMessage || localError}
        </p>
      )}
    </div>
  );
}
