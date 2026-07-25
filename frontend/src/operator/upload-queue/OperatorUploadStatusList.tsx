import { AlertTriangle, Check, Loader2, Upload, X } from 'lucide-react';
import type { OperatorUploadQueueItem, OperatorUploadStatus } from './operatorUploadQueue.types';

const LABELS: Record<OperatorUploadStatus, string> = {
  pending: 'Ausstehend',
  uploading: 'Wird hochgeladen…',
  uploaded: 'Hochgeladen',
  processing: 'Verarbeitung…',
  failed: 'Fehler',
  cancelled: 'Abgebrochen',
};

interface OperatorUploadStatusListProps {
  items: OperatorUploadQueueItem[];
  onCancel?: (clientUploadId: string) => void;
}

export function OperatorUploadStatusList({ items, onCancel }: OperatorUploadStatusListProps) {
  if (items.length === 0) return null;

  return (
    <ul className="space-y-2" aria-label="Upload-Status">
      {items.map((item) => (
        <li
          key={item.clientUploadId}
          className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-xs"
        >
          <StatusIcon status={item.status} />
          <span className="min-w-0 flex-1 truncate font-medium">{item.fileName}</span>
          <span className="shrink-0 text-muted-foreground">{LABELS[item.status]}</span>
          {item.status === 'uploading' && (
            <span className="shrink-0 tabular-nums text-muted-foreground">{item.progressPercent}%</span>
          )}
          {onCancel && (item.status === 'pending' || item.status === 'uploading' || item.status === 'failed') && (
            <button
              type="button"
              onClick={() => onCancel(item.clientUploadId)}
              className="sq-press flex h-7 w-7 items-center justify-center rounded-lg border border-border/60"
              aria-label="Upload abbrechen"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {item.status === 'failed' && item.errorMessage && (
            <span className="sr-only">{item.errorMessage}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function StatusIcon({ status }: { status: OperatorUploadStatus }) {
  if (status === 'uploading' || status === 'processing') {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-[color:var(--brand)]" aria-hidden />;
  }
  if (status === 'uploaded') {
    return <Check className="h-3.5 w-3.5 text-[color:var(--status-success)]" aria-hidden />;
  }
  if (status === 'failed') {
    return <AlertTriangle className="h-3.5 w-3.5 text-[color:var(--status-critical)]" aria-hidden />;
  }
  if (status === 'cancelled') {
    return <X className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />;
  }
  return <Upload className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />;
}
