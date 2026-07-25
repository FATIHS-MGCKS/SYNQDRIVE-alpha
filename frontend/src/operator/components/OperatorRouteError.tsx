import { AlertCircle } from 'lucide-react';
import type { OperatorRouteResumeError } from '../lib/operatorRouteResume';

interface OperatorRouteErrorProps {
  error: OperatorRouteResumeError;
  onDismiss: () => void;
}

export function OperatorRouteError({ error, onDismiss }: OperatorRouteErrorProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        role="alertdialog"
        aria-labelledby="operator-route-error-title"
        aria-describedby="operator-route-error-message"
        className="w-full max-w-md rounded-2xl border border-border/70 surface-premium p-5 shadow-[var(--shadow-2)]"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <AlertCircle className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="operator-route-error-title" className="text-base font-semibold text-foreground">
              {error.title}
            </h2>
            <p id="operator-route-error-message" className="mt-1 text-sm text-muted-foreground">
              {error.message}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button type="button" className="sq-btn sq-btn-primary min-h-11 px-4" onClick={onDismiss}>
            Zurück zur Übersicht
          </button>
        </div>
      </div>
    </div>
  );
}
