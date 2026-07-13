import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { VehicleHealthResponse } from '../../../lib/api';
import { getShortModel, type VehicleData } from '../../data/vehicles';
import { FleetEnergyIndicator } from '../fleet/FleetEnergyIndicator';
import { resolveFleetVehicleDisplayState } from '../../lib/fleetVehicleDisplay';
import { bookingRef } from '../bookings/bookingUtils';
import {
  resolveDrawerVehicleReasonBadge,
  resolveHandoverVehicleReasonBadge,
} from './dashboardDrilldownRowDisplay';
import type { DashboardSliceRow, VehicleRuntimeState } from './runtime';
import {
  activeRentalKmBarFillPercent,
  activeRentalKmBarTone,
  activeRentalRentedTillText,
  formatKmRemainingLabel,
} from './activeRentalDrawer.utils';

function fleetVehicleTitle(v: VehicleData): string {
  const model = typeof v.model === 'string' ? v.model : '';
  const shortModel = model ? getShortModel(model) : '';
  return [v.make, shortModel, v.year].filter(Boolean).join(' ') || model || '';
}

function vehicleStationLabel(v: VehicleData): string {
  const named = (v as { stationName?: string | null }).stationName;
  return named ?? v.station ?? v.activeReturnStationName ?? '';
}

function reasonChipClass(tone: 'success' | 'watch' | 'warning' | 'critical' | 'neutral'): string {
  if (tone === 'critical') {
    return 'bg-[color:color-mix(in_srgb,var(--status-critical)_10%,transparent)] text-[color:var(--status-critical)]';
  }
  if (tone === 'watch' || tone === 'warning') {
    return 'bg-[color:color-mix(in_srgb,var(--status-watch)_12%,transparent)] text-[color:var(--status-watch)]';
  }
  return 'bg-muted text-muted-foreground';
}

function kmBarClass(tone: 'success' | 'watch' | 'critical'): string {
  if (tone === 'critical') return 'bg-[color:var(--status-critical)]';
  if (tone === 'watch') return 'bg-[color:var(--status-watch)]';
  return 'bg-[color:var(--status-success)]';
}

export interface ActiveRentalDrawerRowCardProps {
  row: DashboardSliceRow;
  vehicle: VehicleData;
  health?: VehicleHealthResponse | null;
  runtimeState?: VehicleRuntimeState;
  locale: string;
  onOpenVehicle?: (vehicleId: string) => void;
  onOpenBooking?: (bookingId: string) => void;
  onClose: () => void;
}

export function ActiveRentalDrawerRowCard({
  row,
  vehicle,
  health = null,
  runtimeState,
  locale,
  onOpenVehicle,
  onOpenBooking,
  onClose,
}: ActiveRentalDrawerRowCardProps) {
  const de = locale === 'de';
  const display = resolveFleetVehicleDisplayState(vehicle, {
    rentalHealth: health,
    locale,
  });
  const bookingId = vehicle.activeBookingId ?? row.bookingId;
  const bookingNumber = bookingId ? bookingRef(bookingId) : row.bookingRef;
  const customer = vehicle.activeCustomerName?.trim();
  const station = vehicleStationLabel(vehicle) || row.stationLabel || runtimeState?.stationLabel;
  const canOpenBooking = Boolean(bookingId && onOpenBooking);
  const canOpenVehicle = Boolean(vehicle.id && onOpenVehicle);

  const reasonBadge = resolveHandoverVehicleReasonBadge(row, vehicle, health, locale)
    ?? resolveDrawerVehicleReasonBadge(row, locale, display.reasonBadge);
  const reasonTone: 'critical' | 'watch' | 'warning' | 'neutral' =
    reasonBadge?.tone === 'critical'
      ? 'critical'
      : reasonBadge?.tone === 'watch' || reasonBadge?.tone === 'warning'
        ? 'watch'
        : 'neutral';

  const kmRemainingLabel = formatKmRemainingLabel(
    vehicle.activeKmDriven,
    vehicle.activeKmIncluded,
    locale,
  );
  const kmBarTone = activeRentalKmBarTone(vehicle.activeKmDriven, vehicle.activeKmIncluded);
  const kmBarFill = activeRentalKmBarFillPercent(vehicle.activeKmDriven, vehicle.activeKmIncluded);
  const showKmRow = vehicle.activeKmIncluded != null && vehicle.activeKmIncluded > 0;
  const rentedTill = activeRentalRentedTillText(vehicle.activeReturnAt, locale);

  const hasEnergy = display.energy.percent != null;
  const hasOdometer = Boolean(display.odometerLabel);
  const showOpsMeta = hasEnergy || hasOdometer || display.telemetryLabel;

  return (
    <article className="rounded-lg border border-border/45 surface-premium/45 px-2.5 py-2 shadow-sm shadow-black/[0.02] transition-colors hover:border-border/65 hover:bg-muted/10">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className="shrink-0 text-[12px] font-bold tabular-nums tracking-[-0.01em] text-foreground">
              {vehicle.license || row.title}
            </span>
            <span className="truncate text-[10.5px] text-muted-foreground">{fleetVehicleTitle(vehicle)}</span>
          </div>

          <div className="space-y-0.5 text-[10.5px] text-muted-foreground">
            {customer ? (
              <p className="truncate">
                {de ? 'Kunde:' : 'Customer:'} {customer}
              </p>
            ) : null}
            {bookingNumber ? (
              <p className="truncate">
                {de ? 'Buchungsnummer:' : 'Booking no.:'} {bookingNumber}
              </p>
            ) : null}
            {station ? (
              <p className="flex min-w-0 items-center gap-1 text-[10px]">
                <Icon name="map-pin" className="h-3 w-3 shrink-0" />
                <span className="truncate">{station}</span>
              </p>
            ) : null}
          </div>

          {showOpsMeta ? (
            <div className="flex min-w-0 items-center gap-x-1 overflow-hidden text-[10px] tabular-nums text-muted-foreground">
              {hasEnergy ? (
                <span className="inline-flex shrink-0 items-center whitespace-nowrap">
                  <FleetEnergyIndicator
                    percent={display.energy.percent}
                    isElectric={display.energy.kind === 'battery'}
                    tone={display.energy.tone}
                  />
                </span>
              ) : null}
              {hasEnergy && display.telemetryLabel ? (
                <span aria-hidden className="shrink-0 text-muted-foreground/50">·</span>
              ) : null}
              {display.telemetryLabel ? (
                <span
                  className={cn(
                    'min-w-0 shrink truncate',
                    display.showTelemetryWarning && 'text-[color:var(--status-watch)]',
                  )}
                >
                  {display.telemetryLabel}
                </span>
              ) : null}
              {hasOdometer ? (
                <>
                  {display.telemetryLabel ? (
                    <span aria-hidden className="shrink-0 text-muted-foreground/50">·</span>
                  ) : null}
                  <span className="shrink-0 whitespace-nowrap">{display.odometerLabel}</span>
                </>
              ) : null}
            </div>
          ) : null}

          {showKmRow ? (
            <div className="flex items-center gap-2 pt-0.5">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                  <span className="truncate">{kmRemainingLabel}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted/80">
                  <div
                    className={cn('h-full rounded-full transition-[width]', kmBarClass(kmBarTone))}
                    style={{ width: `${kmBarFill}%` }}
                  />
                </div>
              </div>
              <p className="max-w-[46%] shrink-0 text-right text-[10px] font-medium leading-snug text-foreground">
                {rentedTill}
              </p>
            </div>
          ) : (
            <p className="text-[10px] font-medium text-foreground">{rentedTill}</p>
          )}

          {reasonBadge ? (
            <span
              className={cn(
                'inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                reasonChipClass(reasonTone),
              )}
            >
              <span className="truncate">{reasonBadge.text}</span>
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5 self-stretch justify-between">
          <div className="flex flex-wrap items-center justify-end gap-1">
            <StatusChip
              tone={display.healthDisplay.tone}
              icon={<Icon name="heart" className="h-3 w-3" />}
              className="px-1.5 py-0.5 text-[9.5px] font-semibold"
            >
              {display.healthDisplay.label}
            </StatusChip>
            <StatusChip tone="info" className="px-1.5 py-0.5 text-[9.5px] font-semibold">
              {display.rentalDisplay.label}
            </StatusChip>
          </div>

          <div className="mt-auto flex flex-col items-end gap-1">
            {canOpenBooking ? (
              <button
                type="button"
                onClick={() => {
                  if (bookingId && onOpenBooking) onOpenBooking(bookingId);
                  onClose();
                }}
                className="sq-btn sq-btn-secondary min-h-8 shrink-0 px-2.5 text-[11px]"
              >
                {de ? 'Zur Buchung' : 'To booking'}
                <Icon name="arrow-right" className="h-3.5 w-3.5 opacity-70" />
              </button>
            ) : null}
            {canOpenVehicle ? (
              <button
                type="button"
                onClick={() => {
                  if (vehicle.id && onOpenVehicle) onOpenVehicle(vehicle.id);
                  onClose();
                }}
                className="sq-press inline-flex min-h-8 items-center gap-1 rounded-md border border-border/50 px-2.5 text-[10.5px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              >
                {de ? 'Zum Fahrzeug' : 'To vehicle'}
                <Icon name="arrow-right" className="h-3 w-3 opacity-70" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
