import type { MouseEvent } from 'react';
import { BrandLogo, getBrandFromModel } from '../BrandLogo';
import { Icon } from '../ui/Icon';
import { StatusChip, type StatusTone } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { VehicleData } from '../../data/vehicles';
import { getShortModel } from '../../data/vehicles';
import { formatFleetDateTime } from '../../../lib/formatVehicleDisplay';
import { useLanguage } from '../../i18n/LanguageContext';
import { useAddress } from '../../../lib/useAddress';
import { FleetEnergyIndicator } from '../fleet/FleetEnergyIndicator';
import { resolveFleetVehicleDisplayState } from '../../lib/fleetVehicleDisplay';
import type { FleetVehicleContext } from '../../lib/fleet-operator-panel';

function reasonChipClass(tone: StatusTone): string {
  if (tone === 'critical') {
    return 'bg-[color:color-mix(in_srgb,var(--status-critical)_10%,transparent)] text-[color:var(--status-critical)]';
  }
  if (tone === 'watch' || tone === 'warning') {
    return 'bg-[color:color-mix(in_srgb,var(--status-watch)_12%,transparent)] text-[color:var(--status-watch)]';
  }
  return 'bg-muted text-muted-foreground';
}

function fleetVehicleTitle(v: VehicleData): string {
  const model = typeof v.model === 'string' ? v.model : '';
  const shortModel = model ? getShortModel(model) : '';
  return [v.make, shortModel, v.year].filter(Boolean).join(' ') || model || 'Unknown vehicle';
}

function vehicleStationLabel(v: VehicleData): string {
  const named = (v as { stationName?: string | null }).stationName;
  return named ?? v.station ?? '';
}

/**
 * A single compact appointment fragment (Return/Pickup) — never the station,
 * so the station + last-known-location line stays clean and unambiguous.
 */
function appointmentFragment(v: VehicleData): string | null {
  if (v.status === 'Active Rented' && v.activeReturnAt) {
    return `Return ${formatFleetDateTime(v.activeReturnAt)}`;
  }
  if (v.status === 'Reserved' && v.reservedPickupAt) {
    return `Pickup ${formatFleetDateTime(v.reservedPickupAt)}`;
  }
  return null;
}

export interface FleetOperatorRowProps {
  ctx: FleetVehicleContext;
  selected: boolean;
  onClick: () => void;
  onDetailClick: (e: MouseEvent) => void;
  rowRef: (el: HTMLDivElement | null) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  isDarkMode?: boolean;
}

export function FleetOperatorRow({
  ctx,
  selected,
  onClick,
  onDetailClick,
  rowRef,
  onMouseEnter,
  onMouseLeave,
  isDarkMode = false,
}: FleetOperatorRowProps) {
  const { vehicle: v, visual, health } = ctx;
  const { locale } = useLanguage();
  const display = resolveFleetVehicleDisplayState(v, {
    rentalHealth: health,
    visual,
    locale,
  });
  const { healthDisplay, rentalDisplay, reasonBadge } = display;

  // Only genuine connectivity problems (offline / no_signal) dim an Available
  // row. Standby + signal_delayed stay at full opacity (normal/secondary).
  const dimmed = display.showTelemetryWarning && v.status === 'Available';

  // Subtle full-row tint by operational status — no left accent bar.
  const tint =
    display.primaryStatus === 'critical' || display.primaryStatus === 'blocked'
      ? 'bg-[color:color-mix(in_srgb,var(--status-critical)_5%,transparent)]'
      : display.primaryStatus === 'warning'
        ? 'bg-[color:color-mix(in_srgb,var(--status-watch)_4%,transparent)]'
        : '';

  // Station = organisational home. Last known location = current/last GPS
  // position resolved via the shared (cached) reverse-geocode helper used on
  // the Fleet Map / Vehicle Detail. No address is fabricated: when no
  // coordinates resolve, the line falls back to the station alone.
  const station = vehicleStationLabel(v);
  const { address } = useAddress(v.lat, v.lng);
  const lastKnownLocation =
    address && address.formatted && address.formatted !== '—' ? address.formatted : null;
  const appointment = appointmentFragment(v);
  const locationParts = [station, lastKnownLocation, appointment].filter(Boolean) as string[];
  const locationLine = locationParts.length > 0 ? locationParts.join(' · ') : '—';

  return (
    <div
      ref={rowRef}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        'group flex cursor-pointer items-start gap-2 px-2.5 py-2 transition-colors hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--brand)]',
        tint,
        selected && 'bg-[color:color-mix(in_srgb,var(--brand)_8%,transparent)]',
      )}
    >
      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/70', dimmed && 'opacity-75')}>
        <BrandLogo
          brand={getBrandFromModel({ make: v.make, model: v.model })}
          size={16}
          isDarkMode={isDarkMode}
          variant="icon"
        />
      </div>

      <div className={cn('min-w-0 flex-1 space-y-1', dimmed && 'opacity-75')}>
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0 text-[12px] font-bold tabular-nums tracking-[-0.01em] text-foreground">
            {v.license}
          </span>
          <span className="truncate text-[10.5px] leading-snug text-muted-foreground">
            {fleetVehicleTitle(v)}
          </span>
        </div>

        <div
          className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground"
          title={locationLine}
        >
          <Icon name="map-pin" className="h-3 w-3 shrink-0 text-muted-foreground/80" />
          <span className="truncate">{locationLine}</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] tabular-nums text-muted-foreground">
          {display.energy.percent != null && (
            <FleetEnergyIndicator
              percent={display.energy.percent}
              isElectric={display.energy.kind === 'battery'}
              tone={display.energy.tone}
            />
          )}
          <>
            {display.energy.percent != null && <span aria-hidden>·</span>}
            <span
              className={cn(
                display.showTelemetryWarning && 'text-[color:var(--status-watch)]',
              )}
            >
              {display.telemetryLabel}
            </span>
          </>
          {display.odometerLabel && (
            <>
              <span aria-hidden>·</span>
              <span>{display.odometerLabel}</span>
            </>
          )}
        </div>

        {reasonBadge && (
          <span
            className={cn(
              'inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
              reasonChipClass(reasonBadge.tone),
            )}
          >
            <span className="truncate">{reasonBadge.text}</span>
          </span>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="flex flex-wrap items-center justify-end gap-1">
          <StatusChip
            tone={healthDisplay.tone}
            icon={<Icon name="heart" className="h-3 w-3" />}
            className="px-1.5 py-0.5 text-[9.5px] font-semibold"
          >
            {healthDisplay.label}
          </StatusChip>
          <StatusChip
            tone={rentalDisplay.tone}
            className="px-1.5 py-0.5 text-[9.5px] font-semibold"
          >
            {rentalDisplay.label}
          </StatusChip>
        </div>

        <button
          type="button"
          onClick={onDetailClick}
          aria-label="Open vehicle details"
          className="sq-press inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[10.5px] font-medium text-muted-foreground opacity-90 transition-colors hover:bg-muted/40 hover:text-foreground group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
        >
          Open
          <Icon name="arrow-right" className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
