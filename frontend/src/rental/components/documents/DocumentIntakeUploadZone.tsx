import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from '../ui/Icon';

export interface DocumentIntakeUploadZoneProps {
  acceptAttr: string;
  supportedFormatsLabel: string;
  onFilesSelected: (files: FileList | File[]) => void;
  dropzoneLabel: string;
  dropzoneActiveLabel: string;
  browseLabel: string;
  validationError?: string | null;
  contextHint?: string | null;
  contextConflict?: boolean;
  disabled?: boolean;
  isDarkMode?: boolean;
  compact?: boolean;
  headerSlot?: ReactNode;
}

export function DocumentIntakeUploadZone({
  acceptAttr,
  supportedFormatsLabel,
  onFilesSelected,
  dropzoneLabel,
  dropzoneActiveLabel,
  browseLabel,
  validationError,
  contextHint,
  contextConflict = false,
  disabled = false,
  isDarkMode = false,
  compact = false,
  headerSlot,
}: DocumentIntakeUploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const openPicker = () => {
    if (!disabled) fileInputRef.current?.click();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  };

  const padding = compact ? 'p-6 sm:p-8' : 'p-6 sm:p-10 lg:p-12';
  const iconBox = compact ? 'w-12 h-12' : 'w-12 h-12 sm:w-16 sm:h-16';

  return (
    <div className="space-y-3 min-w-0">
      {headerSlot}

      {contextHint ? (
        <div
          role="note"
          aria-live="polite"
          className={`rounded-lg border px-3 py-2 text-xs ${
            contextConflict
              ? isDarkMode
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                : 'border-amber-200 bg-amber-50 text-amber-900'
              : isDarkMode
                ? 'border-brand/30 bg-brand-soft/40 text-brand'
                : 'border-status-info/30 bg-status-info-soft text-status-info'
          }`}
        >
          <p className="font-semibold break-words">{contextHint}</p>
        </div>
      ) : null}

      {validationError ? (
        <div
          role="alert"
          className={`px-3 py-2 rounded-lg text-xs font-medium ${
            isDarkMode ? 'bg-amber-500/10 text-amber-300' : 'bg-amber-50 text-amber-800'
          }`}
        >
          {validationError}
        </div>
      ) : null}

      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label={dropzoneLabel}
        onKeyDown={onKeyDown}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          if (!disabled && event.dataTransfer.files?.length) {
            onFilesSelected(event.dataTransfer.files);
          }
        }}
        onClick={openPicker}
        className={`rounded-lg ${padding} text-center transition-all duration-300 border-2 border-dashed min-w-0 ${
          disabled
            ? isDarkMode
              ? 'border-neutral-800 bg-neutral-900/30 opacity-60 cursor-not-allowed'
              : 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
            : dragActive
              ? isDarkMode
                ? 'border-brand bg-brand-soft cursor-pointer'
                : 'border-brand bg-brand-soft cursor-pointer'
              : isDarkMode
                ? 'border-neutral-700 bg-neutral-900/60 hover:border-neutral-600 hover:bg-neutral-900/80 cursor-pointer'
                : 'border-gray-300 bg-white/60 hover:border-gray-400 hover:bg-white/80 cursor-pointer'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={acceptAttr}
          disabled={disabled}
          onChange={(event) => {
            if (event.target.files?.length) onFilesSelected(event.target.files);
            event.target.value = '';
          }}
        />
        <div
          className={`${iconBox} rounded-lg mx-auto mb-3 flex items-center justify-center ${
            isDarkMode ? 'bg-brand-soft' : 'bg-brand-soft'
          }`}
        >
          <Icon name="upload" className={`${compact ? 'w-5 h-5' : 'w-6 h-6 sm:w-7 sm:h-7'} ${isDarkMode ? 'text-brand' : 'text-brand'}`} />
        </div>
        <p className={`text-xs font-semibold mb-2 break-words px-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
          {dragActive ? dropzoneActiveLabel : dropzoneLabel}
        </p>
        <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>{supportedFormatsLabel}</p>
        <button
          type="button"
          disabled={disabled}
          className={`mt-5 w-full sm:w-auto min-h-11 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
            isDarkMode ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-brand text-brand-foreground hover:bg-brand-hover'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {browseLabel}
        </button>
      </div>
    </div>
  );
}
