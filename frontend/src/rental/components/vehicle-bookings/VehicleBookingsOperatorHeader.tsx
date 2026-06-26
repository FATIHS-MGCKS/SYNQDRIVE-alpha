import { StatusChip } from '../../../components/patterns';
import type { VehicleData } from '../../data/vehicles';
import { formatFreeDurationLabel } from '../../lib/vehicle-availability-intelligence.utils';
import type { VehicleBookingRiskItem } from '../../lib/vehicle-booking-risk.utils';
import {
  deriveVehicleBookingOperatorSnapshot,
  formatOperatorDate,
  formatOperatorTime,
  type VehicleBookingHorizon,
  type VehicleBookingOperatorInput,
  type VehicleBookingOperatorSnapshot,
} from '../../lib/vehicle-booking-operator.utils';
import { formatCents } from '../bookings/bookingUtils';
import { Icon } from '../ui/Icon';
import { VehicleBookingSummaryCard } from './VehicleBookingSummaryCard';
import { vb } from './vehicle-bookings-ui';
import { VehicleBookingRiskChips } from './VehicleBookingRiskChips';

interface VehicleBookingsOperatorHeaderProps {
  vehicle?: VehicleData | null;
  vehicleLabel: string;
  bookings: VehicleBookingOperatorInput[];
  horizon: VehicleBookingHorizon;
  loading?: boolean;
  horizonDays: number;
  systemRisks?: VehicleBookingRiskItem[];
  onCreateBooking?: () => void;
}

export function VehicleBookingsOperatorHeader({
  vehicle,
  vehicleLabel,
  bookings,
  horizon,
  loading,
  horizonDays,
  systemRisks = [],
}: VehicleBookingsOperatorHeaderProps) {
  const snapshot = deriveVehicleBookingOperatorSnapshot(bookings, horizon, vehicle);

  const pickupAt =
    snapshot.nextPickup?.startDate ??
    (vehicle?.reservedPickupAt ? new Date(vehicle.reservedPickupAt) : null);
  const pickupCustomer =
    snapshot.nextPickup?.customerName ?? vehicle?.reservedCustomerName ?? null;
  const pickupStation =
    snapshot.nextPickup?.pickupLocation ?? vehicle?.reservedPickupStationName ?? null;

  const returnAt =
    snapshot.nextReturn?.endDate ??
    (vehicle?.activeReturnAt
      ? new Date(vehicle.activeReturnAt)
      : vehicle?.reservedReturnAt
        ? new Date(vehicle.reservedReturnAt)
        : null);
  const returnCustomer =
    snapshot.nextReturn?.customerName ??
    vehicle?.activeCustomerName ??
    vehicle?.reservedCustomerName ??
    null;
  const returnStation =
    snapshot.nextReturn?.returnLocation ?? vehicle?.activeReturnStationName ?? null;

  return (
    <section className={vb.section} aria-labelledby="vb-operator-title">
      <header className={vb.sectionHeader}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-1.5">
            <p className="sq-section-label">Fahrzeugbetrieb</p>
            <h2 id="vb-operator-title" className={vb.title}>
              Buchungen &amp; Verfügbarkeit
            </h2>
            <p className={`${vb.subtitle} max-w-xl`}>{vehicleLabel}</p>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
            <StatusChip
              tone={snapshot.operatorTone}
              dot={snapshot.operatorState === 'active'}
              className="px-3 py-1 text-[11px] font-semibold"
            >
              {snapshot.operatorLabel}
            </StatusChip>
            <p className={`${vb.meta} max-w-[300px] text-left leading-relaxed sm:text-right`}>
              {snapshot.operatorDetail}
            </p>
          </div>
        </div>
      </header>

      <div className={`${vb.sectionBody} space-y-4`}>
        <div className={vb.gridMetrics}>
          <VehicleBookingSummaryCard
            label="Aktueller Status"
            value={loading ? '—' : snapshot.operatorNowLabel}
            valueVariant="text"
            status={snapshot.operatorTone}
            hint="Live-Zustand des Fahrzeugs im Horizont"
            loading={loading}
            icon={<Icon name="activity" className="h-4 w-4 text-muted-foreground" aria-hidden />}
          />
          <HandoverSummaryCard
            label="Nächster Pickup"
            booking={snapshot.nextPickup}
            at={pickupAt && Number.isFinite(pickupAt.getTime()) ? pickupAt : null}
            customer={pickupCustomer}
            station={pickupStation}
            loading={loading}
            emptyLabel="Kein Pickup geplant"
            emptyHint="Keine anstehende Übergabe im gewählten Zeitraum."
          />
          <HandoverSummaryCard
            label="Nächste Rückgabe"
            booking={snapshot.nextReturn}
            at={returnAt && Number.isFinite(returnAt.getTime()) ? returnAt : null}
            customer={returnCustomer}
            station={returnStation}
            loading={loading}
            emptyLabel="Keine Rückgabe offen"
            emptyHint="Keine anstehende Rückgabe im gewählten Zeitraum."
          />
          <RevenueSummaryCard snapshot={snapshot} loading={loading} />
        </div>

        <div className={vb.gridAvailability}>
          <VehicleBookingSummaryCard
            label={`Auslastung · ${horizonDays} Tage`}
            value={loading ? '—' : `${snapshot.utilizationPct}`}
            unit="%"
            valueVariant="numeric"
            status={
              snapshot.utilizationPct >= 75
                ? 'info'
                : snapshot.utilizationPct >= 40
                  ? 'watch'
                  : 'neutral'
            }
            hint={buildUtilizationHint(snapshot)}
            loading={loading}
            icon={<Icon name="gauge" className="h-4 w-4 text-muted-foreground" aria-hidden />}
          />
          <VehicleBookingSummaryCard
            label="Frei im Zeitraum"
            value={
              loading ? '—' : formatFreeDurationLabel(snapshot.freeDays, snapshot.freeHours)
            }
            valueVariant="text"
            status="neutral"
            hint="Ungebuchte Zeit im sichtbaren Horizont"
            loading={loading}
            icon={<Icon name="calendar-range" className="h-4 w-4 text-muted-foreground" aria-hidden />}
          />
          <VehicleBookingSummaryCard
            label="Nächster freier Slot"
            value={loading ? '—' : snapshot.nextFreeSlotLabel ?? 'Kein Slot'}
            valueVariant="text"
            status={snapshot.nextFreeSlotLabel ? 'success' : 'neutral'}
            hint="Ab jetzt im gewählten Zeitraum"
            loading={loading}
            icon={<Icon name="calendar-clock" className="h-4 w-4 text-muted-foreground" aria-hidden />}
          />
        </div>

        {!loading && systemRisks.length > 0 && (
          <div className={`${vb.inset} px-3 py-2.5`} role="note" aria-label="Planungshinweise">
            <p className="sq-section-label mb-1.5">Planungshinweise</p>
            <VehicleBookingRiskChips items={systemRisks} />
          </div>
        )}
      </div>
    </section>
  );
}

function buildUtilizationHint(snapshot: VehicleBookingOperatorSnapshot): string {
  const parts = ['Gebuchte Zeit (ohne Storno/No-Show)'];
  if (snapshot.forecastUtilizationPct > 0) {
    parts.push(`Forecast ${snapshot.forecastUtilizationPct} %`);
  }
  if (snapshot.realizedUtilizationPct > 0) {
    parts.push(`Realisiert ${snapshot.realizedUtilizationPct} %`);
  }
  return parts.join(' · ');
}

function RevenueSummaryCard({
  snapshot,
  loading,
}: {
  snapshot: VehicleBookingOperatorSnapshot;
  loading?: boolean;
}) {
  const hasBreakdown =
    snapshot.realizedRevenueCents > 0 || snapshot.pipelineRevenueCents > 0;

  const hintParts: string[] = [];
  if (snapshot.realizedRevenueCents > 0) {
    hintParts.push(`Realisiert: ${formatCents(snapshot.realizedRevenueCents)}`);
  }
  if (snapshot.pipelineRevenueCents > 0) {
    hintParts.push(`Pipeline: ${formatCents(snapshot.pipelineRevenueCents)}`);
  }

  return (
    <VehicleBookingSummaryCard
      label="Gebuchter Umsatz"
      value={loading ? '—' : formatCents(snapshot.bookedRevenueCents)}
      valueVariant="numeric"
      status="neutral"
      hint={
        hasBreakdown
          ? hintParts.join(' · ')
          : 'Summe der Buchungspreise im Horizont'
      }
      loading={loading}
      icon={<Icon name="receipt" className="h-4 w-4 text-muted-foreground" aria-hidden />}
    />
  );
}

function HandoverSummaryCard({
  label,
  booking,
  at,
  customer,
  station,
  loading,
  emptyLabel,
  emptyHint,
}: {
  label: string;
  booking: VehicleBookingOperatorInput | null;
  at: Date | null;
  customer?: string | null;
  station?: string | null;
  loading?: boolean;
  emptyLabel: string;
  emptyHint: string;
}) {
  if (loading) {
    return (
      <VehicleBookingSummaryCard
        label={label}
        value="—"
        loading
        icon={<Icon name="calendar-clock" className="h-4 w-4 text-muted-foreground" aria-hidden />}
      />
    );
  }

  if (!at || !customer) {
    return (
      <VehicleBookingSummaryCard
        label={label}
        value={emptyLabel}
        valueVariant="text"
        status="neutral"
        hint={emptyHint}
        icon={<Icon name="calendar-clock" className="h-4 w-4 text-muted-foreground" aria-hidden />}
      />
    );
  }

  const detail = [formatOperatorTime(at), customer, station].filter(Boolean).join(' · ');

  return (
    <VehicleBookingSummaryCard
      label={label}
      value={formatOperatorDate(at)}
      valueVariant="text"
      status={booking?.status === 'active' ? 'info' : 'watch'}
      hint={detail}
      icon={<Icon name="calendar-clock" className="h-4 w-4 text-muted-foreground" aria-hidden />}
    />
  );
}
