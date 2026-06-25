import { ArrowDownLeft, ArrowUpRight, Calendar } from 'lucide-react';
import { StatusChip } from '../../components/patterns';
import {
  bookingStatusLabel,
  bookingStatusTone,
  normalizeBookingStatus,
} from '../../rental/components/bookings/bookingStatus';
import type { OperatorScanBookingHit } from '../hooks/useOperatorScanSearch';
import { OperatorGlassCard } from './OperatorGlassCard';

interface Props {
  booking: OperatorScanBookingHit;
  highlighted?: boolean;
  onDetails?: () => void;
  onOpenVehicle?: () => void;
  onPickup?: () => void;
  onReturn?: () => void;
}

export function OperatorScanBookingCard({
  booking,
  highlighted,
  onDetails,
  onOpenVehicle,
  onPickup,
  onReturn,
}: Props) {
  const status = normalizeBookingStatus(booking.statusEnum, booking.status);

  return (
    <OperatorGlassCard
      className={`sq-glass overflow-hidden p-0 ${
        highlighted ? 'ring-2 ring-[color:var(--brand)]/40' : ''
      }`}
    >
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Calendar className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              Buchung · {booking.bookingId.slice(0, 8)}…
            </p>
            <p className="mt-0.5 text-sm text-foreground">
              {booking.vehicleName}
              {booking.plate ? ` · ${booking.plate}` : ''}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{booking.customerName}</p>
            <div className="mt-2">
              <StatusChip tone={bookingStatusTone(status)} dot>
                {bookingStatusLabel(status)}
              </StatusChip>
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px border-t border-border/50 bg-border/50">
        {onDetails && (
          <button
            type="button"
            onClick={onDetails}
            className="sq-press min-h-[48px] bg-card text-[11px] font-semibold"
          >
            Details
          </button>
        )}
        {onOpenVehicle && (
          <button
            type="button"
            onClick={onOpenVehicle}
            className="sq-press min-h-[48px] bg-card text-[11px] font-semibold"
          >
            Fahrzeug
          </button>
        )}
        {onPickup && (
          <button
            type="button"
            onClick={onPickup}
            className="sq-press flex min-h-[48px] items-center justify-center gap-1 bg-card text-[11px] font-semibold"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            Pickup
          </button>
        )}
        {onReturn && (
          <button
            type="button"
            onClick={onReturn}
            className="sq-press flex min-h-[48px] items-center justify-center gap-1 bg-card text-[11px] font-semibold"
          >
            <ArrowDownLeft className="h-3.5 w-3.5" />
            Return
          </button>
        )}
      </div>
    </OperatorGlassCard>
  );
}
