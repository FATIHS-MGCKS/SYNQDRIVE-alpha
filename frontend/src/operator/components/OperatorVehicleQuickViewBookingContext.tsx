import { useLanguage } from '../../i18n/LanguageContext';
import {
  formatOperatorVehicleQuickViewDateTime,
  operatorVehicleQuickViewBookingContextAriaLabel,
  operatorVehicleQuickViewBookingKindLabel,
  operatorVehicleQuickViewBookingSectionTitle,
  type OperatorVehicleQuickViewBookingKind,
} from '../lib/operator-vehicle-quick-view-i18n';
import { OperatorGlassCard } from './OperatorGlassCard';

export interface OperatorVehicleQuickViewBookingContextProps {
  kind: OperatorVehicleQuickViewBookingKind;
  customerName: string;
  when: string;
  station: string;
}

export function OperatorVehicleQuickViewBookingContext({
  kind,
  customerName,
  when,
  station,
}: OperatorVehicleQuickViewBookingContextProps) {
  const { locale } = useLanguage();
  const kindLabel = operatorVehicleQuickViewBookingKindLabel(locale, kind);
  const formattedWhen = formatOperatorVehicleQuickViewDateTime(locale, when);

  return (
    <OperatorGlassCard className="space-y-3 p-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {operatorVehicleQuickViewBookingSectionTitle(locale)}
      </h3>
      <div
        className="space-y-1"
        aria-label={operatorVehicleQuickViewBookingContextAriaLabel(locale, kind)}
      >
        <p className="text-sm font-semibold text-foreground">{kindLabel}</p>
        <p className="text-sm text-foreground">{customerName}</p>
        <p className="text-xs text-muted-foreground" title={formattedWhen}>
          {formattedWhen}
          {station ? ` · ${station}` : ''}
        </p>
      </div>
    </OperatorGlassCard>
  );
}
