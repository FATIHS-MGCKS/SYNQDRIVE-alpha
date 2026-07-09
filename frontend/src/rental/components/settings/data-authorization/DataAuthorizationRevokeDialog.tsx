import { Loader2, ShieldOff, X } from 'lucide-react';
import { useState } from 'react';
import type { DataAuthorizationDto } from '../../../../lib/api';
import { DIMO_REVOKE_IMPACT, isDimoTelemetryAuth } from './data-authorization.constants';

interface DataAuthorizationRevokeDialogProps {
  open: boolean;
  auth: DataAuthorizationDto | null;
  loading: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export function DataAuthorizationRevokeDialog({
  open,
  auth,
  loading,
  onCancel,
  onConfirm,
}: DataAuthorizationRevokeDialogProps) {
  const [reason, setReason] = useState('');

  if (!open || !auth) return null;

  const dimo = isDimoTelemetryAuth(auth);

  return (
    <div
      className="overlay-scrim fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-3)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="revoke-dialog-title"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-destructive/10">
            <ShieldOff className="w-5 h-5 text-destructive" />
          </div>
          <div className="min-w-0">
            <h3 id="revoke-dialog-title" className="text-base font-bold text-foreground">
              {auth.statusKey === 'PENDING' ? 'Freigabe ablehnen' : 'Freigabe widerrufen'}
            </h3>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {auth.title}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="ml-auto p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
            aria-label="Schließen"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {dimo && (
          <div className="mb-4 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-[12px] text-muted-foreground leading-relaxed">
            <p className="font-semibold text-destructive mb-1">DIMO Telemetry — kritische Auswirkung</p>
            {DIMO_REVOKE_IMPACT}
          </div>
        )}

        <p className="text-[12px] text-muted-foreground mb-3">
          Der Zugriff wird für betroffene Verarbeitungszwecke blockiert. Der Eintrag bleibt im Audit-Verlauf sichtbar.
        </p>

        <label className="block text-[11px] font-semibold text-muted-foreground mb-1.5">
          Begründung (optional)
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="z. B. Vertrag beendet, Zweck entfällt …"
          className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-xs text-foreground outline-none focus:ring-2 focus:ring-[var(--brand-soft)]"
        />

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl text-xs font-medium border border-border hover:bg-muted disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Endgültig widerrufen
          </button>
        </div>
      </div>
    </div>
  );
}
