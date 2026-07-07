import type { VehicleData } from '../../data/vehicles';
import { buildMMY } from '../../lib/vehicleMmy';
import { Icon } from '../ui/Icon';
import { BookingStepCard } from './BookingStepCard';
import { formatEuroAmount } from './format';
import type { BookingCustomer } from './types';

export interface BookingSuccessStateProps {
  selectedCustomer: BookingCustomer | null;
  selectedVehicle: VehicleData | null;
  rentalDays: number;
  grandTotal: number | null;
  redirectCountdown: number | null;
  onBack: () => void;
  onNewBooking: () => void;
}

export function BookingSuccessState({
  selectedCustomer,
  selectedVehicle,
  rentalDays,
  grandTotal,
  redirectCountdown,
  onBack,
  onNewBooking,
}: BookingSuccessStateProps) {
  return (
    <div className="flex items-center justify-center py-16">
      <BookingStepCard>
        <div className="max-w-lg p-12 text-center">
          <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full sq-tone-success">
            <Icon name="check-circle" className="h-5 w-5 text-[color:var(--status-positive)]" />
          </div>
          <h2 className="mb-2 text-lg text-foreground">Buchung erstellt!</h2>
          <p className="mb-2 text-xs text-muted-foreground">
            Buchung #{`BK-${Date.now().toString().slice(-6)}`} wurde erfolgreich angelegt.
          </p>
          {redirectCountdown !== null && redirectCountdown > 0 && (
            <p className="mb-3 text-xs text-muted-foreground">
              Weiterleitung zur Übersicht in {redirectCountdown}s…
            </p>
          )}
          <div className="mb-3 space-y-2 rounded-lg bg-muted/50 p-4 text-left">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Customer</span>
              <span className="text-foreground">{selectedCustomer?.name}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Vehicle</span>
              <span className="text-foreground">{selectedVehicle ? buildMMY(selectedVehicle) : '—'}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Period</span>
              <span className="text-foreground">{rentalDays} Days</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-xs">
              <span className="text-muted-foreground">Total Amount</span>
              <span className="text-[color:var(--status-positive)]">{formatEuroAmount(grandTotal)}</span>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onBack}
              className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground transition-all hover:bg-muted"
            >
              Zur Übersicht
            </button>
            <button
              type="button"
              onClick={onNewBooking}
              className="sq-3d-btn sq-3d-btn--primary flex-1 px-3 py-2 text-xs"
            >
              Neue Buchung
            </button>
          </div>
        </div>
      </BookingStepCard>
    </div>
  );
}
