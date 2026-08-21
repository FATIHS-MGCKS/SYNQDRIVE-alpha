import { Camera, Loader2, ShieldAlert } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { HANDOVER_REPORTED_BY_FALLBACK } from '../../rental/components/handover/handover-i18n';
import { useOperatorDamageCapture } from '../damages/OperatorDamageCaptureProvider';
import type { OperatorHandoverFormApi } from './useOperatorHandoverForm';
import { labelOperatorDamageSeverity, labelOperatorDamageType, oh } from './operator-handover-i18n';

interface Props {
  form: OperatorHandoverFormApi;
}

export function OperatorHandoverStepDamages({ form }: Props) {
  const { locale, t } = useLanguage();
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
      reportedBy: form.state.staffName || HANDOVER_REPORTED_BY_FALLBACK,
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
            {oh(locale, 'handover.operator.damages.title', {
              selected: form.state.selectedDamageIds.size,
              total: form.damages.length,
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={handleCapture}
          disabled={!booking}
          className="sq-press inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[color:var(--brand)]/30 bg-[color:var(--brand-soft)] px-3 text-xs font-semibold text-[color:var(--brand-ink)] disabled:opacity-50"
        >
          <Camera className="h-4 w-4" />
          {t('handover.protocol.recordNewDamage')}
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        {kind === 'PICKUP'
          ? oh(locale, 'handover.operator.damages.hintPickup')
          : oh(locale, 'handover.operator.damages.hintReturn')}
      </p>

      {form.damageError && (
        <p className="text-xs text-[color:var(--status-critical)]">{form.damageError}</p>
      )}

      {form.loadingDamages ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {oh(locale, 'handover.operator.damages.loading')}
        </div>
      ) : form.damages.length === 0 ? (
        <p className="text-sm text-muted-foreground">{oh(locale, 'handover.operator.damages.empty')}</p>
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
                    : 'border-border surface-premium'
                }`}
              >
                <p className="text-sm font-semibold">
                  {labelOperatorDamageType(locale, d.damageType)} ·{' '}
                  {labelOperatorDamageSeverity(locale, d.severity)}
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
