import { StatusChip } from '../../../components/patterns';
import {
  enrichAgendaBooking,
  getVehicleAgendaSafeActions,
  groupVehicleAgendaBookings,
  handoverListStatus,
  vehicleAgendaActionLabel,
  type VehicleAgendaBooking,
  type VehicleAgendaGroup,
} from '../../lib/vehicle-booking-agenda.utils';
import { buildAgendaRiskHints, type BookingAgendaRiskHint } from '../../lib/vehicle-booking-risk.utils';
import {
  BookingStatusBadge,
  bookingStatusAriaLabel,
  bookingStatusIcon,
  bookingStatusTone,
  type BookingUiStatus,
} from '../bookings/bookingStatus';
import { bookingRef, formatCents } from '../bookings/bookingUtils';
import { Icon } from '../ui/Icon';
import { vb, vbActionClass } from './vehicle-bookings-ui';

interface VehicleBookingsAgendaProps {
  bookings: VehicleAgendaBooking[];
  onSelectBooking?: (bookingId: string) => void;
}

export function VehicleBookingsAgenda({ bookings, onSelectBooking }: VehicleBookingsAgendaProps) {
  const enriched = bookings.map((b) => enrichAgendaBooking(b));
  const groups = groupVehicleAgendaBookings(enriched);
  const riskHints = buildAgendaRiskHints(enriched);

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <AgendaGroupSection
          key={group.id}
          group={group}
          riskHints={riskHints}
          onSelectBooking={onSelectBooking}
        />
      ))}
    </div>
  );
}

function AgendaGroupSection({
  group,
  riskHints,
  onSelectBooking,
}: {
  group: VehicleAgendaGroup;
  riskHints: ReturnType<typeof buildAgendaRiskHints>;
  onSelectBooking?: (bookingId: string) => void;
}) {
  const muted = group.id === 'terminal';

  return (
    <section aria-labelledby={`agenda-group-${group.id}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4
              id={`agenda-group-${group.id}`}
              className={`text-[12px] font-semibold tracking-[-0.01em] ${muted ? 'text-muted-foreground' : 'text-foreground'}`}
            >
              {group.label}
            </h4>
            <span className="sq-chip sq-tone-neutral text-[10px] tabular-nums">{group.bookings.length}</span>
          </div>
          <p className={`${vb.meta} mt-0.5`}>{group.description}</p>
        </div>
      </div>

      <div className={`space-y-2 ${muted ? 'opacity-80' : ''}`}>
        {group.bookings.map((booking) => (
          <AgendaBookingCard
            key={booking.id || `${booking.customerName}-${booking.startDate.toISOString()}`}
            booking={booking}
            groupId={group.id}
            hints={riskHints[booking.id] ?? []}
            onSelectBooking={onSelectBooking}
          />
        ))}
      </div>
    </section>
  );
}

function AgendaBookingCard({
  booking,
  groupId,
  hints,
  onSelectBooking,
}: {
  booking: VehicleAgendaBooking;
  groupId: VehicleAgendaGroup['id'];
  hints: BookingAgendaRiskHint[];
  onSelectBooking?: (bookingId: string) => void;
}) {
  const icon = bookingStatusIcon(booking.status);
  const tone = bookingStatusTone(booking.status);
  const ref = booking.id ? bookingRef(booking.id) : null;
  const handover = handoverListStatus(booking);
  const actions = getVehicleAgendaSafeActions(booking);
  const canSelect = Boolean(onSelectBooking && booking.id);

  return (
    <article
      className={`${vb.inset} overflow-hidden transition-colors duration-[var(--dur-fast)] ${
        booking.isOverdue ? 'border-l-2 border-l-[color:var(--status-critical)]/70' : ''
      } ${groupId === 'terminal' ? 'border-dashed opacity-85' : ''}`}
    >
      <div className="p-3 sm:p-3.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <button
            type="button"
            disabled={!canSelect}
            onClick={canSelect ? () => onSelectBooking!(booking.id) : undefined}
            className={`flex min-w-0 flex-1 items-start gap-2.5 text-left rounded-lg -m-1 p-1 ${
              canSelect ? `sq-press hover:bg-muted/25 cursor-pointer ${vb.focusRing}` : 'cursor-default'
            }`}
            aria-label={bookingStatusAriaLabel(booking.status, booking.customerName)}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${toneTileClass(tone)}`}>
              <Icon name={icon} className="w-4 h-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {ref && (
                  <span className="text-[10px] font-mono font-semibold text-foreground">{ref}</span>
                )}
                <BookingStatusBadge status={booking.status} />
                {booking.isOverdue && (
                  <StatusChip tone="critical" className="text-[9px]">
                    Überfällig
                  </StatusChip>
                )}
              </div>
              <p className="text-[13px] font-semibold text-foreground truncate mt-1">{booking.customerName}</p>
              <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                {formatAgendaDateTime(booking.startDate)} – {formatAgendaDateTime(booking.endDate)}
                <span className="mx-1.5 text-border">·</span>
                {booking.days} {booking.days === 1 ? 'Tag' : 'Tage'}
              </p>
            </div>
          </button>

          <div className="text-right shrink-0 lg:pt-0.5">
            <p className="text-[12px] font-semibold tabular-nums text-foreground">
              {booking.totalPriceCents != null ? formatCents(booking.totalPriceCents) : '—'}
            </p>
            <p className="text-[9px] text-muted-foreground">Gebuchter Betrag</p>
          </div>
        </div>

        <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
          <MetaRow icon="map-pin" label="Pickup" value={booking.pickupLocation} />
          <MetaRow icon="map-pin" label="Return" value={booking.returnLocation} />
        </div>

        {handover && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[9px] font-medium text-muted-foreground">
              <Icon name="key" className="w-3 h-3" aria-hidden />
              Übergabe: {handover}
            </span>
          </div>
        )}

        {hints.length > 0 && (
          <div className="mt-2 space-y-1">
            {hints.map((hint) => (
              <p
                key={`${booking.id}-${hint.message}`}
                className={`text-[10px] leading-relaxed flex items-start gap-1.5 ${
                  hint.severity === 'critical'
                    ? 'text-[color:var(--status-critical)]'
                    : hint.severity === 'watch'
                      ? 'text-muted-foreground'
                      : 'text-muted-foreground/80'
                }`}
              >
                <Icon
                  name={hint.category === 'preparation_open' ? 'clipboard-list' : 'info'}
                  className="w-3 h-3 shrink-0 mt-0.5 opacity-70"
                  aria-hidden
                />
                <span>{hint.message}</span>
              </p>
            ))}
          </div>
        )}

        {actions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/50 pt-2.5">
            {actions.map((action) => (
              <button
                key={action}
                type="button"
                disabled={!canSelect}
                onClick={(e) => {
                  e.stopPropagation();
                  if (canSelect) onSelectBooking!(booking.id);
                }}
                className={vbActionClass(action === 'open', true)}
              >
                <ActionIcon action={action} status={booking.status} />
                {vehicleAgendaActionLabel(action)}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function MetaRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-1.5 min-w-0 text-muted-foreground">
      <Icon name={icon} className="w-3 h-3 shrink-0 mt-0.5" aria-hidden />
      <div className="min-w-0">
        <span className="text-[9px] font-semibold uppercase tracking-wider opacity-70">{label}</span>
        <p className="truncate text-foreground/90">{value}</p>
      </div>
    </div>
  );
}

function ActionIcon({ action, status }: { action: string; status: BookingUiStatus }) {
  if (action === 'pickup') return <Icon name="key" className="w-3 h-3" aria-hidden />;
  if (action === 'return') return <Icon name="log-out" className="w-3 h-3" aria-hidden />;
  if (action === 'documents') return <Icon name="file-text" className="w-3 h-3" aria-hidden />;
  return <Icon name={status === 'active' ? 'external-link' : 'eye'} className="w-3 h-3" aria-hidden />;
}

function toneTileClass(tone: ReturnType<typeof bookingStatusTone>): string {
  switch (tone) {
    case 'info':
      return 'sq-tone-info';
    case 'success':
      return 'sq-tone-success';
    case 'warning':
      return 'sq-tone-warning';
    case 'critical':
      return 'sq-tone-critical';
    default:
      return 'sq-tone-neutral';
  }
}

function formatAgendaDateTime(date: Date): string {
  return (
    date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) +
    ' ' +
    date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  );
}
