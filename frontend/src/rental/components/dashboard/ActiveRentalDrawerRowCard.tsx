import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { VehicleHealthResponse } from '../../../lib/api';
import { getShortModel, type VehicleData } from '../../data/vehicles';
import { resolveFleetVehicleDisplayState } from '../../lib/fleetVehicleDisplay';
import { bookingRef } from '../bookings/bookingUtils';
import {
  resolveDrawerVehicleReasonBadge,
  resolveHandoverVehicleReasonBadge,
} from './dashboardDrilldownRowDisplay';
import { DrawerRowActionButton } from './dashboardDrawerRowActions';
import {
  DrawerCustomerBnrRow,
  drawerRowActionStackClassName,
} from './dashboardDrawerRowLines';
import type { DashboardSliceRow, VehicleRuntimeState } from './runtime';
import {
  activeRentalKmBarFillPercent,
  activeRentalKmBarTone,
  activeRentalRentedTillText,
  formatFreeKmLabel,
} from './activeRentalDrawer.utils';

function fleetVehicleTitle(v: VehicleData): string {
  const model = typeof v.model === 'string' ? v.model : '';
  const shortModel = model ? getShortModel(model) : '';
  return [v.make, shortModel, v.year].filter(Boolean).join(' ') || model || '';
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

  const freeKmLabel = formatFreeKmLabel(
    vehicle.activeKmDriven,
    vehicle.activeKmIncluded,
    locale,
  );
  const kmBarTone = activeRentalKmBarTone(vehicle.activeKmDriven, vehicle.activeKmIncluded);
  const kmBarFill = activeRentalKmBarFillPercent(vehicle.activeKmDriven, vehicle.activeKmIncluded);
  const showKmRow = vehicle.activeKmIncluded != null && vehicle.activeKmIncluded > 0;
  const rentedTill = activeRentalRentedTillText(vehicle.activeReturnAt, locale);

  return (
    <article className="rounded-lg border border-border/45 surface-premium/45 px-2.5 py-2 shadow-sm shadow-black/[0.02] transition-colors hover:border-border/65 hover:bg-muted/10">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="whitespace-nowrap text-[10.5px] leading-snug">
            <span className="text-[12px] font-bold tabular-nums tracking-[-0.01em] text-foreground">
              {vehicle.license || row.title}
            </span>
            <span className="text-muted-foreground"> {fleetVehicleTitle(vehicle)}</span>
          </p>

          <DrawerCustomerBnrRow
            customerName={customer}
            bookingRef={bookingNumber}
            de={de}
          />

          {showKmRow ? (
            <div className="flex items-center gap-2 pt-0.5">
              <span className="shrink-0 whitespace-nowrap text-[10px] tabular-nums text-muted-foreground">
                {freeKmLabel}
              </span>
              <div className="min-w-0 flex-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted/80">
                  <div
                    className={cn('h-full rounded-full transition-[width]', kmBarClass(kmBarTone))}
                    style={{ width: `${kmBarFill}%` }}
                  />
                </div>
              </div>
              <span className="max-w-[42%] shrink-0 whitespace-nowrap text-right text-[10px] font-medium leading-snug text-foreground">
                {rentedTill}
              </span>
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

          <div className={cn(drawerRowActionStackClassName, 'mt-auto')}>
            {canOpenBooking ? (
              <DrawerRowActionButton
                tone="booking"
                onClick={() => {
                  if (bookingId && onOpenBooking) onOpenBooking(bookingId);
                  onClose();
                }}
              >
                {de ? 'Zur Buchung' : 'To booking'}
              </DrawerRowActionButton>
            ) : null}
            {canOpenVehicle ? (
              <DrawerRowActionButton
                tone="vehicle"
                onClick={() => {
                  if (vehicle.id && onOpenVehicle) onOpenVehicle(vehicle.id);
                  onClose();
                }}
              >
                {de ? 'Zum Fahrzeug' : 'To vehicle'}
              </DrawerRowActionButton>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
