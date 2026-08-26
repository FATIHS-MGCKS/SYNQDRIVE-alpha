import type { VehicleHealthResponse } from '../../lib/api';
import type { BookingUiRow } from '../components/bookings/bookingTypes';
import { cn } from '../../components/ui/utils';
import type { VehicleData } from '../data/vehicles';
import { resolveBookingVehiclePreflight } from './booking-vehicle-preflight';
import { Icon } from '../components/ui/Icon';

export interface BookingVehiclePreflightBannerProps {
  vehicle: VehicleData;
  health: VehicleHealthResponse | null | undefined;
  hasTariff: boolean;
  catalogLoading: boolean;
  locale?: 'de' | 'en';
  bookingRows?: BookingUiRow[];
  pickupAt?: string | null;
  returnAt?: string | null;
  excludeBookingId?: string | null;
  healthLoading?: boolean;
  healthRecordAbsent?: boolean;
  allowHealthBypass?: boolean;
  className?: string;
}

/**
 * Surfaces booking preflight hints before checkout — backend gates remain authoritative.
 */
export function BookingVehiclePreflightBanner({
  vehicle,
  health,
  hasTariff,
  catalogLoading,
  locale = 'de',
  bookingRows,
  pickupAt,
  returnAt,
  excludeBookingId,
  healthLoading = false,
  healthRecordAbsent = false,
  allowHealthBypass = false,
  className,
}: BookingVehiclePreflightBannerProps) {
  const preflight = resolveBookingVehiclePreflight(vehicle, health, hasTariff, catalogLoading, {
    locale,
    bookingRows,
    pickupAt,
    returnAt,
    excludeBookingId,
    healthLoading,
    healthRecordAbsent,
    allowHealthBypass,
  });

  const items: Array<{ tone: 'critical' | 'warning' | 'info'; text: string }> = [];

  if (!preflight.isSelectable && preflight.blockingReason) {
    items.push({ tone: 'critical', text: preflight.blockingReason });
  } else if (preflight.cautionReason) {
    items.push({
      tone: preflight.noTariff || preflight.healthWarningOnly ? 'warning' : 'info',
      text: preflight.cautionReason,
    });
  }

  if (items.length === 0) return null;

  const toneClass = (tone: 'critical' | 'warning' | 'info') => {
    if (tone === 'critical') return 'sq-tone-critical border-border';
    if (tone === 'warning') return 'sq-tone-warning border-border';
    return 'sq-tone-info border-border';
  };

  return (
    <div className={cn('space-y-2', className)}>
      {items.map((item) => (
        <div
          key={item.text}
          className={cn('flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs', toneClass(item.tone))}
        >
          <Icon
            name={item.tone === 'critical' ? 'alert-circle' : item.tone === 'warning' ? 'alert-triangle' : 'info'}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span className="text-foreground">{item.text}</span>
        </div>
      ))}
    </div>
  );
}
