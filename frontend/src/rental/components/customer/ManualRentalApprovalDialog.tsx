import { useState } from 'react';
import { Icon } from '../ui/Icon';
import type { TripDecisionSummary } from '../trips/trip-decision.types';

export interface ManualRentalApprovalDialogProps {
  open: boolean;
  onClose: () => void;
  subjectType: 'CUSTOMER' | 'BOOKING' | 'TRIP';
  subjectId: string;
  orgId: string;
  dimensionsSnapshot: TripDecisionSummary | Record<string, unknown>;
  recommendationAtDecision: TripDecisionSummary['recommendation']['level'];
  onSubmit: (input: {
    decision: 'APPROVE' | 'CONDITIONAL' | 'REJECT' | 'DISMISS' | 'INSPECTION_REQUESTED';
    reason: string;
  }) => Promise<void>;
}

export function ManualRentalApprovalDialog({
  open,
  onClose,
  subjectType,
  subjectId,
  dimensionsSnapshot,
  recommendationAtDecision,
  onSubmit,
}: ManualRentalApprovalDialogProps) {
  const [decision, setDecision] = useState<'APPROVE' | 'CONDITIONAL' | 'REJECT'>('APPROVE');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const canSubmit = reason.trim().length >= 20 && !submitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-background p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Manuelle Mietfreigabe</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {subjectType} · {subjectId.slice(0, 8)}… · Empfehlung: {recommendationAtDecision}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-[12px] font-medium">Entscheidung</label>
          <select
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={decision}
            onChange={(e) => setDecision(e.target.value as typeof decision)}
          >
            <option value="APPROVE">Freigeben</option>
            <option value="CONDITIONAL">Bedingt freigeben</option>
            <option value="REJECT">Ablehnen</option>
          </select>

          <label className="block text-[12px] font-medium">Begründung (mind. 20 Zeichen)</label>
          <textarea
            className="min-h-[96px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Operative Begründung für die manuelle Entscheidung…"
          />

          {error && <p className="text-[12px] text-red-600">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            onClick={onClose}
            disabled={submitting}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={!canSubmit}
            onClick={async () => {
              setSubmitting(true);
              setError(null);
              try {
                await onSubmit({ decision, reason: reason.trim() });
                onClose();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
              } finally {
                setSubmitting(false);
              }
            }}
          >
            Entscheidung speichern
          </button>
        </div>

        <p className="mt-3 text-[10px] text-muted-foreground">
          Snapshot der Dimensionen wird im Audit-Trail gespeichert. Keine automatische Kundensperre.
        </p>
        <pre className="mt-2 hidden">{JSON.stringify(dimensionsSnapshot, null, 2)}</pre>
      </div>
    </div>
  );
}
