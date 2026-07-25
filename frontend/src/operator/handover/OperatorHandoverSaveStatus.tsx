import { AlertTriangle, Check, CloudOff, Loader2, Save } from 'lucide-react';
import type { HandoverDraftSaveStatus } from './operatorHandoverDraftSync';

interface OperatorHandoverSaveStatusProps {
  status: HandoverDraftSaveStatus;
  isOnline: boolean;
  errorMessage?: string | null;
}

const STATUS_COPY: Record<
  Exclude<HandoverDraftSaveStatus, 'idle' | 'loading'>,
  { label: string; tone: 'muted' | 'brand' | 'success' | 'watch' | 'critical' }
> = {
  saving: { label: 'Wird gespeichert…', tone: 'brand' },
  saved: { label: 'Gespeichert', tone: 'success' },
  offline: { label: 'Offline', tone: 'watch' },
  conflict: { label: 'Konflikt', tone: 'critical' },
  error: { label: 'Fehler', tone: 'critical' },
};

export function OperatorHandoverSaveStatus({
  status,
  isOnline,
  errorMessage,
}: OperatorHandoverSaveStatusProps) {
  if (status === 'idle' || status === 'loading') return null;

  const copy = STATUS_COPY[status];
  const title = errorMessage ?? copy.label;

  const icon =
    status === 'saving' ? (
      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
    ) : status === 'saved' ? (
      <Check className="h-3 w-3" aria-hidden />
    ) : status === 'offline' || !isOnline ? (
      <CloudOff className="h-3 w-3" aria-hidden />
    ) : status === 'conflict' || status === 'error' ? (
      <AlertTriangle className="h-3 w-3" aria-hidden />
    ) : (
      <Save className="h-3 w-3" aria-hidden />
    );

  const toneClass =
    copy.tone === 'success'
      ? 'text-[color:var(--status-success)] bg-[color:var(--status-success)]/10 border-[color:var(--status-success)]/25'
      : copy.tone === 'watch'
        ? 'text-[color:var(--status-watch)] bg-[color:var(--status-watch)]/10 border-[color:var(--status-watch)]/25'
        : copy.tone === 'critical'
          ? 'text-[color:var(--status-critical)] bg-[color:var(--status-critical)]/10 border-[color:var(--status-critical)]/25'
          : 'text-[color:var(--brand-ink)] bg-[color:var(--brand-soft)] border-[color:var(--brand)]/20';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${toneClass}`}
      role="status"
      title={title}
    >
      {icon}
      {copy.label}
    </span>
  );
}
