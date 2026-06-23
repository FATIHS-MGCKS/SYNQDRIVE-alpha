import { AlertTriangle } from 'lucide-react';
import type { HandoverDialogBookingInfo, HandoverDialogKind } from '../../rental/components/handover/HandoverProtocolDialog';
import type { OperatorHandoverFormApi } from './useOperatorHandoverForm';
import type { OperatorHandoverValidationIssue } from './operatorHandoverPayload';

interface Props {
  kind: HandoverDialogKind;
  booking: HandoverDialogBookingInfo;
  form: OperatorHandoverFormApi;
  issues: OperatorHandoverValidationIssue[];
}

export function OperatorHandoverStepReview({ kind, booking, form, issues }: Props) {
  const primaryLabel =
    kind === 'PICKUP' ? 'Pickup bestätigen & Buchung aktivieren' : 'Rückgabe bestätigen & abschließen';

  const rows = [
    { label: 'Fahrzeug', value: `${booking.vehicleName} · ${booking.plate}` },
    { label: 'Kunde', value: booking.customerName },
    { label: 'Kilometerstand', value: `${form.state.odometerKm || '—'} km` },
    {
      label: 'Tank / SoC',
      value: form.state.fuelFull ? 'Voll' : `${form.state.fuelPercent}%`,
    },
    { label: 'Schäden markiert', value: String(form.state.selectedDamageIds.size) },
    {
      label: 'Dokumente bestätigt',
      value: form.state.checks.documentsAcknowledged ? 'Ja' : 'Nein',
    },
    { label: 'Kundenunterschrift', value: form.state.customerSigData ? 'Erfasst' : 'Fehlt' },
    { label: 'Mitarbeiterunterschrift', value: form.state.staffSigData ? 'Erfasst' : 'Fehlt' },
    { label: 'Mitarbeiter', value: form.state.staffName || form.state.staffId || '—' },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Prüfe alle Angaben vor dem Abschluss. Der Server setzt den Buchungsstatus (
        {kind === 'PICKUP' ? 'CONFIRMED → ACTIVE' : 'ACTIVE → COMPLETED'}).
      </p>

      <div className="rounded-2xl border border-border/60 bg-card/80 divide-y divide-border/40">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="font-medium text-right">{row.value}</span>
          </div>
        ))}
      </div>

      {issues.length > 0 && (
        <div className="rounded-2xl border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.06] p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[color:var(--status-critical)]">
            <AlertTriangle className="h-4 w-4" />
            Noch offen
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {issues.map((i) => (
              <li key={`${i.field}-${i.message}`}>{i.message}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-center text-sm font-semibold text-foreground">{primaryLabel}</p>
    </div>
  );
}
