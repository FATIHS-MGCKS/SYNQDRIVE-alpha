import { CheckCircle2 } from 'lucide-react';
import type { HandoverDialogKind } from '../../rental/components/handover/HandoverProtocolDialog';

interface OperatorHandoverSuccessScreenProps {
  kind: HandoverDialogKind;
  vehicleLabel: string;
  onDone: () => void;
}

export function OperatorHandoverSuccessScreen({
  kind,
  vehicleLabel,
  onDone,
}: OperatorHandoverSuccessScreenProps) {
  const title = kind === 'PICKUP' ? 'Übergabe abgeschlossen' : 'Rückgabe abgeschlossen';
  const detail =
    kind === 'PICKUP'
      ? 'Die Buchung wurde aktiviert. Der Entwurf ist geschlossen und kann nicht mehr bearbeitet werden.'
      : 'Die Rückgabe wurde verbucht. Der Entwurf ist geschlossen und kann nicht mehr bearbeitet werden.';

  return (
    <div
      className="fixed inset-0 z-[125] flex flex-col items-center justify-center bg-background px-6 text-center"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      role="status"
      aria-live="polite"
    >
      <CheckCircle2 className="h-16 w-16 text-[color:var(--status-success)]" aria-hidden />
      <h2 className="mt-4 font-display text-xl font-bold">{title}</h2>
      <p className="mt-1 text-sm font-semibold text-foreground">{vehicleLabel}</p>
      <p className="mt-3 max-w-sm text-sm text-muted-foreground">{detail}</p>
      <button
        type="button"
        onClick={onDone}
        className="sq-3d-btn sq-3d-btn--primary mt-8 min-h-[52px] w-full max-w-xs font-semibold"
      >
        Fertig
      </button>
    </div>
  );
}
