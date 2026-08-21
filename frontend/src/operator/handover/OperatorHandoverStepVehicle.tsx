import { Car, Clock, MapPin, User } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import type { HandoverDialogBookingInfo, HandoverDialogKind } from '../../rental/components/handover/HandoverProtocolDialog';
import { stationLabel } from '../../rental/lib/stationBookingUtils';
import type { OperatorHandoverFormApi } from './useOperatorHandoverForm';
import { formatOperatorDateTime, oh } from './operator-handover-i18n';
import { operatorFieldClass, OperatorHandoverField } from './operatorHandoverUi';

interface Props {
  kind: HandoverDialogKind;
  booking: HandoverDialogBookingInfo;
  form: OperatorHandoverFormApi;
}

export function OperatorHandoverStepVehicle({ kind, booking, form }: Props) {
  const { locale, t } = useLanguage();
  const scheduled = kind === 'PICKUP' ? booking.startDate : booking.endDate;
  const stationName =
    kind === 'PICKUP'
      ? booking.pickupLocation || '—'
      : booking.returnLocation || booking.pickupLocation || '—';
  const instructions =
    kind === 'PICKUP' ? booking.handoverInstructions : booking.returnInstructions;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/60 surface-premium p-4 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {kind === 'PICKUP'
            ? oh(locale, 'handover.operator.vehicle.pickupSection')
            : oh(locale, 'handover.operator.vehicle.returnSection')}
        </p>
        <div className="grid gap-3">
          <Fact
            icon={Car}
            label={t('handover.protocol.vehicle')}
            value={`${booking.vehicleName} · ${booking.plate}`}
          />
          <Fact icon={User} label={t('handover.protocol.customer')} value={booking.customerName} />
          <Fact icon={MapPin} label={oh(locale, 'handover.operator.vehicle.station')} value={stationName} />
          <Fact
            icon={Clock}
            label={
              kind === 'PICKUP'
                ? oh(locale, 'handover.operator.vehicle.pickupTimeLabel')
                : oh(locale, 'handover.operator.vehicle.returnTimeLabel')
            }
            value={formatOperatorDateTime(locale, scheduled)}
          />
        </div>
        {instructions && (
          <p className="border-t border-border/40 pt-3 text-xs text-muted-foreground whitespace-pre-wrap">
            {instructions}
          </p>
        )}
      </div>

      {form.stationOptions.length > 0 && (
        <OperatorHandoverField label={t('handover.protocol.actualStation')}>
          <select
            value={form.state.actualStationId}
            onChange={(e) => form.patchState({ actualStationId: e.target.value })}
            className={operatorFieldClass}
          >
            <option value="">{t('handover.protocol.usePlannedStation')}</option>
            {form.stationOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {stationLabel(s)}
              </option>
            ))}
          </select>
        </OperatorHandoverField>
      )}

      {kind === 'PICKUP' && (
        <OperatorHandoverField
          label={t('handover.protocol.actualPickupTime')}
          hint={oh(locale, 'handover.operator.vehicle.actualPickupHint')}
        >
          <input
            type="datetime-local"
            value={form.state.performedAtLocal}
            max={new Date().toISOString().slice(0, 16)}
            onChange={(e) => form.patchState({ performedAtLocal: e.target.value })}
            className={operatorFieldClass}
          />
        </OperatorHandoverField>
      )}
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Car;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}
