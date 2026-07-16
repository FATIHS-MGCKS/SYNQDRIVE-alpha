import { RefreshCw } from 'lucide-react';

export interface BatteryHealthQueryErrorPanelProps {
  error: string;
  onRetry: () => void;
  retrying?: boolean;
  className?: string;
}

export function BatteryHealthQueryErrorPanel({
  error,
  onRetry,
  retrying = false,
  className = '',
}: BatteryHealthQueryErrorPanelProps) {
  return (
    <div
      className={`rounded-lg border border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground flex items-center justify-between gap-3 ${className}`}
      role="alert"
    >
      <span>{error}</span>
      <button
        type="button"
        onClick={() => void onRetry()}
        disabled={retrying}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
        Erneut laden
      </button>
    </div>
  );
}
