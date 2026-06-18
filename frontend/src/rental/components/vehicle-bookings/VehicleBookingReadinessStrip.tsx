import { useMemo } from 'react';
import { StatusChip } from '../../../components/patterns';
import { useHandover } from '../../HandoverContext';
import { useRentalOrg } from '../../RentalContext';
import type { VehicleAgendaBooking } from '../../lib/vehicle-booking-agenda.utils';
import {
  buildReadinessCheckpoints,
  pickNextHandoverBooking,
  readinessStateLabel,
  type ReadinessCheckpoint,
  type ReadinessCheckpointState,
} from '../../lib/vehicle-booking-readiness.utils';
import { risksFromReadinessCheckpoints } from '../../lib/vehicle-booking-risk.utils';
import { getBookingActionMatrix } from '../booking-detail/bookingActionRules';
import { useBookingDetail } from '../booking-detail/useBookingDetail';
import { BookingStatusBadge } from '../bookings/bookingStatus';
import { bookingRef } from '../bookings/bookingUtils';
import { Icon } from '../ui/Icon';
import { vb, vbActionClass } from './vehicle-bookings-ui';
import { VehicleBookingRiskChips } from './VehicleBookingRiskChips';

interface VehicleBookingReadinessStripProps {
  bookings: VehicleAgendaBooking[];
  loading?: boolean;
  onOpenFullBooking?: (bookingId: string) => void;
  onOpenVehicleTasks?: () => void;
}

export function VehicleBookingReadinessStrip({
  bookings,
  loading,
  onOpenFullBooking,
  onOpenVehicleTasks,
}: VehicleBookingReadinessStripProps) {
  const { orgId } = useRentalOrg();
  const { openHandover } = useHandover();
  const nextBooking = useMemo(() => pickNextHandoverBooking(bookings), [bookings]);
  const { detail, loading: detailLoading, error: detailError } = useBookingDetail(
    orgId,
    nextBooking?.id ?? null,
  );

  const matrix = useMemo(() => (detail ? getBookingActionMatrix(detail) : null), [detail]);

  const checkpoints = useMemo(
    () => (nextBooking ? buildReadinessCheckpoints(detail, nextBooking) : []),
    [detail, nextBooking],
  );

  const readinessRisks = useMemo(
    () => risksFromReadinessCheckpoints(checkpoints),
    [checkpoints],
  );

  if (loading) {
    return (
      <div className={`${vb.section} ${vb.sectionBody} animate-pulse`} aria-hidden>
        <div className="h-4 w-44 bg-muted rounded mb-3" />
        <div className="h-3 w-full max-w-md bg-muted/70 rounded" />
      </div>
    );
  }

  if (!nextBooking) {
    return (
      <div
        className={`${vb.section} ${vb.sectionBodyTight} border-dashed border-border/60`}
        role="status"
      >
        <p className={`${vb.meta} font-medium`}>
          Keine anstehende Übergabe im gewählten Zeitraum.
        </p>
      </div>
    );
  }

  const ref = bookingRef(nextBooking.id);
  const when = formatHandoverWhen(nextBooking);
  const station =
    nextBooking.status === 'active' ? nextBooking.returnLocation : nextBooking.pickupLocation;

  const showPickupPrep = Boolean(matrix?.pickup.allowed && nextBooking.id);
  const showTasks = Boolean(detail && detail.tasks.openCount > 0 && onOpenVehicleTasks);
  const showDocuments = Boolean(detail && onOpenFullBooking);

  return (
    <section className={vb.section} aria-labelledby="vb-readiness-title">
      <header className={`${vb.sectionHeader} ${vb.sectionBodyTight}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="sq-section-label">Nächste Übergabe</p>
            <h3 id="vb-readiness-title" className={`${vb.titleSm} mt-0.5`}>
              {nextBooking.customerName}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[11px] font-mono font-semibold text-foreground">{ref}</span>
              <BookingStatusBadge status={nextBooking.status} />
            </div>
            <p className={`${vb.meta} mt-1`}>
              {when}
              <span className="mx-1.5 text-border" aria-hidden>
                ·
              </span>
              {station}
            </p>
            {detailError && (
              <p className="text-[11px] text-[color:var(--status-attention)] mt-1.5" role="alert">
                Detail teilweise nicht geladen — Checkpoints eingeschränkt.
              </p>
            )}
            {!detailLoading && readinessRisks.length > 0 && (
              <div className="mt-2.5">
                <VehicleBookingRiskChips items={readinessRisks} maxVisible={4} />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 shrink-0" role="group" aria-label="Übergabe-Aktionen">
            {onOpenFullBooking && (
              <button
                type="button"
                className={vbActionClass(true, true)}
                onClick={() => onOpenFullBooking(nextBooking.id)}
              >
                Booking öffnen
              </button>
            )}
            {showDocuments && (
              <button
                type="button"
                className={vbActionClass(false, true)}
                onClick={() => onOpenFullBooking!(nextBooking.id)}
              >
                Dokumente prüfen
              </button>
            )}
            {showPickupPrep && (
              <button
                type="button"
                className={vbActionClass(false, true)}
                onClick={() => openHandover({ bookingId: nextBooking.id, kind: 'PICKUP' })}
              >
                Pickup vorbereiten
              </button>
            )}
            {showTasks && (
              <button type="button" className={vbActionClass(false, true)} onClick={onOpenVehicleTasks!}>
                Tasks öffnen
              </button>
            )}
          </div>
        </div>
      </header>

      <div className={vb.sectionBodyTight}>
        {detailLoading && !detail ? (
          <div className={vb.scrollRow} aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 w-28 shrink-0 rounded-xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : checkpoints.length === 0 ? (
          <p className={vb.meta}>Keine Readiness-Checkpoints verfügbar.</p>
        ) : (
          <div
            className={vb.scrollRow}
            role="list"
            aria-label="Readiness-Checkpoints"
          >
            {checkpoints.map((cp) => (
              <CheckpointPill key={cp.id} checkpoint={cp} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function CheckpointPill({ checkpoint }: { checkpoint: ReadinessCheckpoint }) {
  const tone = stateTone(checkpoint.state);

  return (
    <div
      role="listitem"
      className="snap-start shrink-0 min-w-[8rem] max-w-[10rem] rounded-xl border border-border/50 bg-background/50 px-3 py-2.5 transition-colors duration-[var(--dur-fast)] hover:bg-muted/20"
      title={checkpoint.hint}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon name={checkpoint.icon} className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden />
        <span className="text-[11px] font-semibold text-foreground truncate">{checkpoint.label}</span>
      </div>
      <StatusChip tone={tone} className="text-[10px] px-1.5 py-0">
        {readinessStateLabel(checkpoint.state)}
      </StatusChip>
      {checkpoint.hint && (
        <p className="text-[10px] text-muted-foreground mt-1.5 line-clamp-2 leading-snug">{checkpoint.hint}</p>
      )}
    </div>
  );
}

function stateTone(state: ReadinessCheckpointState): 'success' | 'warning' | 'critical' | 'info' | 'neutral' {
  switch (state) {
    case 'ok':
      return 'success';
    case 'warning':
      return 'warning';
    case 'blocked':
      return 'critical';
    case 'open':
      return 'info';
    default:
      return 'neutral';
  }
}

function formatHandoverWhen(booking: VehicleAgendaBooking): string {
  const date = booking.status === 'active' ? booking.endDate : booking.startDate;
  return date.toLocaleString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
