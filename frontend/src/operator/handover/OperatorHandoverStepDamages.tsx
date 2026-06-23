import { Camera, Loader2, ShieldAlert } from 'lucide-react';
import { formatDamageType } from '../../rental/lib/damage.types';
import { useOperatorDamageCapture } from '../damages/OperatorDamageCaptureProvider';
import type { OperatorHandoverFormApi } from './useOperatorHandoverForm';

interface Props {
  form: OperatorHandoverFormApi;
}

export function OperatorHandoverStepDamages({ form }: Props) {
  const { openDamageCapture } = useOperatorDamageCapture();
  const { booking, kind } = form;

  const handleCapture = () => {
    if (!booking) return;
    openDamageCapture({
      vehicleId: booking.vehicleId,
      vehicleName: booking.vehicleName,
      plate: booking.plate,
      bookingId: booking.id,
      customerId: booking.customerId ?? undefined,
      customerName: booking.customerName,
      bookingLabel: `${booking.customerName} · ${booking.startDate}`,
      handoverKind: kind,
      reportedBy: form.state.staffName || 'Handover',
      skipVehicleConfirm: true,
      onCreated: (damage) => {
        form.registerCapturedDamage(damage);
        void form.reloadDamages();
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold">
            Schäden ({form.state.selectedDamageIds.size}/{form.damages.length})
          </p>
        </div>
        <button
          type="button"
          onClick={handleCapture}
          disabled={!booking}
          className="sq-press inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[color:var(--brand)]/30 bg-[color:var(--brand-soft)] px-3 text-xs font-semibold text-[color:var(--brand-ink)] disabled:opacity-50"
        >
          <Camera className="h-4 w-4" />
          Neuen Schaden erfassen
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        {kind === 'PICKUP'
          ? 'Bestehende Schäden beim Pickup bestätigen oder neue mit Foto erfassen.'
          : 'Beim Return Schäden mit Foto dokumentieren oder bestehende markieren.'}
      </p>

      {form.damageError && (
        <p className="text-xs text-[color:var(--status-critical)]">{form.damageError}</p>
      )}

      {form.loadingDamages ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Laden…
        </div>
      ) : form.damages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine aktiven Schäden dokumentiert.</p>
      ) : (
        <div className="space-y-2">
          {form.damages.map((d) => {
            const selected = form.state.selectedDamageIds.has(d.id);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => form.toggleDamage(d.id)}
                className={`sq-press w-full rounded-xl border px-4 py-3 text-left ${
                  selected
                    ? 'border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)]'
                    : 'border-border bg-card'
                }`}
              >
                <p className="text-sm font-semibold">
                  {formatDamageType(d.damageType)} · {d.severity}
                </p>
                {d.locationLabel && (
                  <p className="text-xs text-muted-foreground">{d.locationLabel}</p>
                )}
                {d.description && (
                  <p className="mt-1 text-xs text-muted-foreground">{d.description}</p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
