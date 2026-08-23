import { ArrowDownLeft, ArrowUpRight, CalendarPlus } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import type { BookingHandoverGate } from '../../rental/lib/bookingHandoverGates';
import { resolveHandoverGateReason } from '../../rental/components/handover/handover-i18n';
import {
  operatorVehicleQuickViewQuickActionCreateBookingLabel,
  operatorVehicleQuickViewQuickActionPickupLabel,
  operatorVehicleQuickViewQuickActionReturnLabel,
} from '../lib/operator-vehicle-quick-view-i18n';

export interface OperatorVehicleQuickViewQuickActionsProps {
  pickupVisible: boolean;
  pickupDisabled: boolean;
  pickupCustomerName: string;
  pickupGate: BookingHandoverGate | null;
  returnVisible: boolean;
  returnDisabled: boolean;
  returnCustomerName: string;
  returnGate: BookingHandoverGate | null;
  vehicleLabel: string;
  onPickup: () => void;
  onReturn: () => void;
  onCreateBooking: () => void;
}

function gateReasonSuffix(locale: string, gate: BookingHandoverGate | null): string {
  if (!gate || gate.allowed) return '';
  const reason = resolveHandoverGateReason(locale, gate);
  return reason ? ` · ${reason}` : '';
}

export function OperatorVehicleQuickViewQuickActions({
  pickupVisible,
  pickupDisabled,
  pickupCustomerName,
  pickupGate,
  returnVisible,
  returnDisabled,
  returnCustomerName,
  returnGate,
  vehicleLabel,
  onPickup,
  onReturn,
  onCreateBooking,
}: OperatorVehicleQuickViewQuickActionsProps) {
  const { locale } = useLanguage();

  return (
    <div className="grid gap-2">
      {pickupVisible && (
        <button
          type="button"
          disabled={pickupDisabled}
          onClick={onPickup}
          className="sq-press flex min-h-[52px] items-center gap-3 rounded-2xl border border-[color:var(--brand)]/30 bg-[color:var(--brand-soft)] px-4 text-left disabled:opacity-50"
        >
          <ArrowUpRight className="h-5 w-5 shrink-0 text-[color:var(--brand-ink)]" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              {operatorVehicleQuickViewQuickActionPickupLabel(locale)}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {pickupCustomerName}
              {gateReasonSuffix(locale, pickupGate)}
            </span>
          </span>
        </button>
      )}
      {returnVisible && (
        <button
          type="button"
          disabled={returnDisabled}
          onClick={onReturn}
          className="sq-press flex min-h-[52px] items-center gap-3 rounded-2xl border border-border/60 surface-premium px-4 text-left disabled:opacity-50"
        >
          <ArrowDownLeft className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              {operatorVehicleQuickViewQuickActionReturnLabel(locale)}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {returnCustomerName}
              {gateReasonSuffix(locale, returnGate)}
            </span>
          </span>
        </button>
      )}
      <button
        type="button"
        onClick={onCreateBooking}
        className="sq-press flex min-h-[52px] items-center gap-3 rounded-2xl border border-border/60 surface-premium px-4 text-left"
      >
        <CalendarPlus className="h-5 w-5 shrink-0 text-[color:var(--brand-ink)]" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">
            {operatorVehicleQuickViewQuickActionCreateBookingLabel(locale)}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">{vehicleLabel}</span>
        </span>
      </button>
    </div>
  );
}
