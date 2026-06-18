import { useMemo } from 'react';
import { DetailDrawer, ErrorState, SkeletonCard, StatusChip } from '../../../components/patterns';
import type { BookingDetailDto } from '../../../lib/api';
import { useHandover } from '../../HandoverContext';
import { useRentalOrg } from '../../RentalContext';
import type { VehicleAgendaBooking } from '../../lib/vehicle-booking-agenda.utils';
import { getBookingActionMatrix } from '../booking-detail/bookingActionRules';
import {
  depositStatusLabel,
  documentsShortStatus,
  EM_DASH,
  financeShortStatus,
  formatCurrencyCents,
  formatDateRange,
  formatDateTime,
  handoverShortStatus,
  paymentStatusLabel,
} from '../booking-detail/bookingDetailUtils';
import { useBookingDetail } from '../booking-detail/useBookingDetail';
import { BookingStatusBadge, normalizeBookingStatus } from '../bookings/bookingStatus';
import { bookingRef, formatCents } from '../bookings/bookingUtils';
import { Icon } from '../ui/Icon';
import { vb, vbActionClass } from './vehicle-bookings-ui';

interface VehicleBookingQuickDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string | null;
  fallback: VehicleAgendaBooking | null;
  onOpenFullBooking?: (bookingId: string) => void;
}

export function VehicleBookingQuickDrawer({
  open,
  onOpenChange,
  bookingId,
  fallback,
  onOpenFullBooking,
}: VehicleBookingQuickDrawerProps) {
  const { orgId } = useRentalOrg();
  const { openHandover } = useHandover();
  const activeId = open ? bookingId : null;
  const { detail, loading, error, refresh } = useBookingDetail(orgId, activeId);

  const matrix = useMemo(() => (detail ? getBookingActionMatrix(detail) : null), [detail]);

  const uiStatus = detail
    ? normalizeBookingStatus(detail.core.statusEnum, detail.core.status)
    : fallback?.status ?? 'pending';

  const title = detail?.customer.fullName ?? fallback?.customerName ?? 'Buchung';
  const refLabel = detail?.core.bookingNumber ?? (fallback?.id ? bookingRef(fallback.id) : '—');

  const close = () => onOpenChange(false);

  const handleOpenFull = () => {
    if (!bookingId || !onOpenFullBooking) return;
    onOpenFullBooking(bookingId);
    close();
  };

  const handlePickup = () => {
    if (!bookingId || !matrix?.pickup.allowed) return;
    openHandover({ bookingId, kind: 'PICKUP' });
  };

  const handleReturn = () => {
    if (!bookingId || !matrix?.return.allowed) return;
    openHandover({ bookingId, kind: 'RETURN' });
  };

  const documentsAllowed =
    detail &&
    uiStatus !== 'cancelled' &&
    uiStatus !== 'no_show';

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="Vehicle Booking"
      title={title}
      description={refLabel}
      status={<BookingStatusBadge status={uiStatus} />}
      widthClassName="sm:max-w-md lg:max-w-lg transition-transform duration-[var(--dur-base)]"
      footer={
        <DrawerFooter
          bookingId={bookingId}
          matrix={matrix}
          onClose={close}
          onOpenFull={handleOpenFull}
          onPickup={handlePickup}
          onReturn={handleReturn}
          onDocuments={documentsAllowed ? handleOpenFull : undefined}
          canOpenFull={Boolean(onOpenFullBooking && bookingId)}
        />
      }
    >
      {loading && !detail ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : error && !detail ? (
        <div className="space-y-4">
          <ErrorState
            compact
            title="Detail nicht geladen"
            description={error}
            onRetry={refresh}
            retryLabel="Erneut laden"
          />
          {fallback && <FallbackSummary fallback={fallback} />}
        </div>
      ) : (
        <div className="space-y-4">
          {detail ? (
            <DetailSummary detail={detail} />
          ) : fallback ? (
            <FallbackSummary fallback={fallback} />
          ) : null}
        </div>
      )}
    </DetailDrawer>
  );
}

function DetailSummary({ detail }: { detail: BookingDetailDto }) {
  const uiStatus = normalizeBookingStatus(detail.core.statusEnum, detail.core.status);
  const hasHealthSignal =
    detail.health.rentalBlocked ||
    (detail.health.criticalWarnings?.length ?? 0) > 0 ||
    (detail.health.warningWarnings?.length ?? 0) > 0 ||
    detail.health.overallState;

  return (
    <div className="space-y-3 animate-fade-up">
      <SummaryCard
        icon="car"
        label="Fahrzeug"
        value={`${detail.vehicle.displayName}${detail.vehicle.licensePlate ? ` · ${detail.vehicle.licensePlate}` : ''}`}
      />
      <SummaryCard
        icon="calendar"
        label="Zeitraum"
        value={formatDateRange(detail.core.startDate, detail.core.endDate)}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <SummaryCard
          icon="map-pin"
          label="Pickup"
          value={detail.core.pickupStationName ?? EM_DASH}
          compact
        />
        <SummaryCard
          icon="map-pin"
          label="Return"
          value={detail.core.returnStationName ?? EM_DASH}
          compact
        />
      </div>

      <SummaryCard
        icon="receipt"
        label="Finanzen"
        value={financeShortStatus(detail)}
        hint={
          detail.finance.computed
            ? [
                detail.finance.grossAmountCents != null
                  ? `Brutto: ${formatCurrencyCents(detail.finance.grossAmountCents, detail.core.currency)}`
                  : null,
                detail.finance.paymentStatus
                  ? `Zahlung: ${paymentStatusLabel(detail.finance.paymentStatus)}`
                  : null,
                (detail.finance.openAmountCents ?? 0) > 0
                  ? `Offen: ${formatCurrencyCents(detail.finance.openAmountCents, detail.core.currency)}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ') || undefined
            : 'Finanzdaten werden bei Bedarf berechnet'
        }
      />

      {detail.finance.depositStatus != null || (detail.finance.depositAmountCents ?? 0) > 0 ? (
        <SummaryCard
          icon="shield"
          label="Kaution"
          value={depositStatusLabel(detail.finance.depositStatus)}
          hint={
            detail.finance.depositAmountCents != null
              ? formatCurrencyCents(detail.finance.depositAmountCents, detail.core.currency)
              : undefined
          }
        />
      ) : null}

      <SummaryCard
        icon="file-text"
        label="Dokumente"
        value={documentsShortStatus(detail)}
        hint={
          detail.documents.warnings.length > 0
            ? detail.documents.warnings.slice(0, 2).join(' · ')
            : undefined
        }
      />

      <SummaryCard icon="key" label="Übergabe" value={handoverShortStatus(detail)} />

      {(detail.tasks.openCount > 0 || detail.tasks.overdueCount > 0) && (
        <SummaryCard
          icon="check-square"
          label="Tasks"
          value={`${detail.tasks.openCount} offen${detail.tasks.overdueCount > 0 ? ` · ${detail.tasks.overdueCount} überfällig` : ''}`}
          hint={
            detail.tasks.nextDueAt
              ? `Nächste Fälligkeit: ${formatDateTime(detail.tasks.nextDueAt)}`
              : undefined
          }
        />
      )}

      {hasHealthSignal && (
        <SummaryCard
          icon="activity"
          label="Mietbereitschaft"
          value={
            detail.health.rentalBlocked
              ? 'Vermietung blockiert'
              : detail.health.overallState ?? 'Hinweise vorhanden'
          }
          hint={[...detail.health.blockingReasons, ...detail.health.criticalWarnings]
            .filter(Boolean)
            .slice(0, 2)
            .join(' · ')}
          tone={detail.health.rentalBlocked ? 'critical' : 'watch'}
        />
      )}

      {detail.eligibility && !detail.eligibility.canStartRental && uiStatus !== 'active' && uiStatus !== 'completed' && (
        <SummaryCard
          icon="alert-circle"
          label="Startkriterien"
          value="Pickup eingeschränkt"
          hint={detail.eligibility.blockingReasons.join(' · ') || undefined}
          tone="watch"
        />
      )}

      {detail.activity.length > 0 && (
        <section className="rounded-xl border border-border/70 bg-muted/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Letzte Aktivität
          </p>
          <ul className="space-y-2">
            {detail.activity.slice(0, 3).map((item) => (
              <li key={item.id} className="text-[11px]">
                <p className="text-foreground font-medium">{item.description}</p>
                <p className="text-muted-foreground tabular-nums">{formatDateTime(item.createdAt)}</p>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-muted-foreground mt-2">
            Vollständige Timeline in der Buchungsakte.
          </p>
        </section>
      )}
    </div>
  );
}

function FallbackSummary({ fallback }: { fallback: VehicleAgendaBooking }) {
  const start = formatListDateTime(fallback.startDate);
  const end = formatListDateTime(fallback.endDate);

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-2">
        Basisdaten aus der Liste — Detail wird nachgeladen.
      </p>
      <SummaryCard icon="calendar" label="Zeitraum" value={`${start} → ${end}`} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <SummaryCard icon="map-pin" label="Pickup" value={fallback.pickupLocation} compact />
        <SummaryCard icon="map-pin" label="Return" value={fallback.returnLocation} compact />
      </div>
      {fallback.totalPriceCents != null && (
        <SummaryCard
          icon="receipt"
          label="Gebuchter Betrag"
          value={formatCents(fallback.totalPriceCents)}
        />
      )}
      <SummaryCard
        icon="clock"
        label="Dauer"
        value={`${fallback.days} ${fallback.days === 1 ? 'Tag' : 'Tage'}`}
      />
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
  compact,
  tone = 'neutral',
}: {
  icon: string;
  label: string;
  value: string;
  hint?: string;
  compact?: boolean;
  tone?: 'neutral' | 'watch' | 'critical';
}) {
  return (
    <div className={`rounded-xl border border-border/50 bg-background/40 ${compact ? 'p-2.5' : 'p-3'}`}>
      <div className="flex items-start gap-2.5">
        <div className="sq-tone-neutral w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
          <Icon name={icon} className="w-4 h-4 text-muted-foreground" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-[12px] font-semibold text-foreground mt-0.5 leading-snug">{value}</p>
          {hint && <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{hint}</p>}
          {tone !== 'neutral' && (
            <StatusChip tone={tone} className="mt-1.5 text-[9px]">
              {tone === 'critical' ? 'Kritisch' : 'Beachten'}
            </StatusChip>
          )}
        </div>
      </div>
    </div>
  );
}

function DrawerFooter({
  bookingId,
  matrix,
  onClose,
  onOpenFull,
  onPickup,
  onReturn,
  onDocuments,
  canOpenFull,
}: {
  bookingId: string | null;
  matrix: ReturnType<typeof getBookingActionMatrix> | null;
  onClose: () => void;
  onOpenFull: () => void;
  onPickup: () => void;
  onReturn: () => void;
  onDocuments?: () => void;
  canOpenFull: boolean;
}) {
  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-2" role="group" aria-label="Drawer-Aktionen">
      <button type="button" onClick={onClose} className={vbActionClass(false)}>
        Schließen
      </button>
      {matrix?.pickup.allowed && (
        <button
          type="button"
          onClick={onPickup}
          title={matrix.pickup.reason}
          className={vbActionClass(false)}
        >
          Pickup starten
        </button>
      )}
      {matrix?.return.allowed && (
        <button
          type="button"
          onClick={onReturn}
          title={matrix.return.reason}
          className={vbActionClass(false)}
        >
          Return starten
        </button>
      )}
      {onDocuments && (
        <button type="button" onClick={onDocuments} className={vbActionClass(false)}>
          Dokumente öffnen
        </button>
      )}
      {canOpenFull && bookingId && (
        <button type="button" onClick={onOpenFull} className={vbActionClass(true)}>
          Booking öffnen
        </button>
      )}
    </div>
  );
}

function formatListDateTime(date: Date): string {
  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
