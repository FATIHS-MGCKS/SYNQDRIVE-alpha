import { Icon } from '../ui/Icon';
import { TripStatusBadge } from './TripStatusBadge';
import { RENTAL_COPY, tv } from './trips-view-ui';
import { alignmentToChipTone, type TripRentalContextView } from './utils/tripRentalContext';
import { formatTripTime } from './utils/tripFormatters';
import type { TripTimelineTrip } from './timeline.types';

interface TripRentalContextPanelProps {
  trip: TripTimelineTrip;
  context: TripRentalContextView;
  loading?: boolean;
  detailLoading?: boolean;
  bookingsError?: string | null;
  onOpenBooking?: (bookingId: string) => void;
  onReview?: () => void;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[11px]">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-foreground text-right tabular-nums">{value}</span>
    </div>
  );
}

export function TripRentalContextPanel({
  trip,
  context,
  loading,
  detailLoading,
  bookingsError,
  onOpenBooking,
  onReview,
}: TripRentalContextPanelProps) {
  const { booking, bookingDetail, alignment, needsReview, reviewReason } = context;
  const vehicleStatus = bookingDetail?.vehicle.vehicleStatus;
  const pickupAt = bookingDetail?.handover.pickup?.completedAt;

  return (
    <div className="space-y-3">
      {loading && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" />
          {RENTAL_COPY.loadingBookings}
        </div>
      )}

      {bookingsError && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">{bookingsError}</p>
      )}

      {detailLoading && booking && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" />
          {RENTAL_COPY.loadingBookingDetail}
        </div>
      )}

      <div className="surface-solid rounded-xl border border-border/50 p-3 space-y-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              {RENTAL_COPY.bookingContext}
            </p>
            {booking ? (
              <>
                <p className="text-[12px] font-semibold text-foreground mt-0.5 truncate">
                  {booking.bookingNumber} · {booking.customerName}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {booking.pickupStationName ?? '—'}
                  {booking.returnStationName && booking.returnStationName !== booking.pickupStationName
                    ? ` → ${booking.returnStationName}`
                    : ''}
                </p>
              </>
            ) : (
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <TripStatusBadge label={RENTAL_COPY.noBookingLinked} tone="watch" />
                {needsReview && onReview && (
                  <button
                    type="button"
                    onClick={onReview}
                    className={`${tv.actionBtn} py-1 px-2 text-[10px]`}
                  >
                    {RENTAL_COPY.reviewAction}
                  </button>
                )}
              </div>
            )}
          </div>
          {booking && onOpenBooking && (
            <button
              type="button"
              onClick={() => onOpenBooking(booking.id)}
              className={`${tv.actionBtn} py-1.5 px-2.5 text-[10px] shrink-0`}
            >
              <Icon name="external-link" className="w-3 h-3" />
              {RENTAL_COPY.openBooking}
            </button>
          )}
        </div>

        {booking && (
          <div className="grid gap-1.5 pt-1 border-t border-border/35">
            <MetaRow
              label={RENTAL_COPY.rentalPeriod}
              value={`${formatTripTime(booking.startDate)} – ${formatTripTime(booking.endDate)}`}
            />
            {pickupAt && (
              <MetaRow label={RENTAL_COPY.pickupHandover} value={formatTripTime(pickupAt)} />
            )}
            {vehicleStatus && (
              <MetaRow label={RENTAL_COPY.vehicleStatusAtTrip} value={vehicleStatus} />
            )}
            {trip.driverName && (
              <MetaRow label={RENTAL_COPY.driverContext} value={trip.driverName} />
            )}
            {trip.assignmentSubjectType === 'BOOKING_CUSTOMER' && !trip.driverName && (
              <MetaRow label={RENTAL_COPY.customerContext} value={booking.customerName} />
            )}
          </div>
        )}

        {reviewReason && (
          <p className="text-[10px] text-amber-700 dark:text-amber-300/90 leading-relaxed border-t border-border/35 pt-2">
            {reviewReason}
          </p>
        )}
      </div>

      {alignment.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card/50 p-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {RENTAL_COPY.rentalAlignment}
          </p>
          <div className="space-y-2">
            {alignment.map((hint) => (
              <div key={hint.kind} className="flex items-start gap-2">
                <TripStatusBadge label={hint.label} tone={alignmentToChipTone(hint.tone)} />
                <p className="text-[10px] text-muted-foreground leading-relaxed min-w-0 flex-1 pt-0.5">
                  {hint.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
