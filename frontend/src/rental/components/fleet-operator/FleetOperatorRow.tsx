import type { KeyboardEvent, MouseEvent } from 'react';
import { BrandLogoMark, getBrandFromModel } from '../BrandLogo';
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
import type {
  FleetCommandRowSeverity,
  FleetVehicleContext,
} from '../../lib/fleet-operator-panel';
import { fleetCommandReasonChipClass, fleetCommandRowSurfaceClass } from './fleetOperatorUi';

function commandSeverityHealthChip(
  severity: FleetCommandRowSeverity,
  locale: string,
): { label: string; tone: StatusTone } {
  const de = locale === 'de';
  if (severity === 'critical') {
    return { label: de ? 'Kritisch' : 'Critical', tone: 'critical' };
  }
  if (severity === 'warning') {
    return { label: de ? 'Warnung' : 'Warning', tone: 'watch' };
  }
  return { label: de ? 'Gut' : 'Good', tone: 'success' };
}

function commandSeverityRentalTone(severity: FleetCommandRowSeverity): StatusTone {
  if (severity === 'critical') return 'critical';
  if (severity === 'warning') return 'watch';
  return 'success';
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

function appointmentFragment(v: VehicleData): string | null {
  if (v.status === 'Active Rented' && v.activeReturnAt) {
    return `Return ${formatFleetDateTime(v.activeReturnAt)}`;
  }
  if (v.status === 'Reserved' && v.reservedPickupAt) {
    return `Pickup ${formatFleetDateTime(v.reservedPickupAt)}`;
  }
  return null;
}

function MetaDot() {
  return <span className="shrink-0 text-muted-foreground/70" aria-hidden>·</span>;
}

export interface FleetOperatorRowProps {
  ctx: FleetVehicleContext;
  /** Canonical Fleet Command severity — drives row background tint and status chips. */
  commandSeverity: FleetCommandRowSeverity;
  selected: boolean;
  onClick: () => void;
  onDetailClick: (e: MouseEvent | KeyboardEvent) => void;
  rowRef: (el: HTMLDivElement | null) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  isDarkMode?: boolean;
}

export function FleetOperatorRow({
  ctx,
  commandSeverity,
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
  const severityHealth = commandSeverityHealthChip(commandSeverity, locale);
  const rowHealth =
    commandSeverity === 'good'
      ? healthDisplay
      : { label: severityHealth.label, tone: severityHealth.tone };
  const rowRental =
    commandSeverity === 'good'
      ? rentalDisplay
      : {
          ...rentalDisplay,
          tone: commandSeverityRentalTone(commandSeverity),
        };

  const dimmed = display.showTelemetryWarning && v.status === 'Available';

  const station = vehicleStationLabel(v);
  const { address } = useAddress(v.lat, v.lng);
  const lastKnownLocation =
    address && address.formatted && address.formatted !== '—' ? address.formatted : null;
  const appointment = appointmentFragment(v);
  const locationParts = [station, lastKnownLocation, appointment].filter(Boolean) as string[];
  const locationLine = locationParts.length > 0 ? locationParts.join(' · ') : '—';

  const hasEnergy = display.energy.percent != null;
  const hasOdometer = Boolean(display.odometerLabel);
  const reasonTone: 'critical' | 'watch' | 'warning' | 'neutral' =
    reasonBadge?.tone === 'critical'
      ? 'critical'
      : reasonBadge?.tone === 'watch' || reasonBadge?.tone === 'warning'
        ? 'watch'
        : 'neutral';

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
        'group flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 transition-colors',
        'hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--brand)]',
        fleetCommandRowSurfaceClass(commandSeverity),
        selected &&
          'ring-1 ring-inset ring-[color:color-mix(in_srgb,var(--brand)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--brand)_6%,transparent)]',
      )}
    >
      <BrandLogoMark
        brand={getBrandFromModel({ make: v.make, model: v.model })}
        isDarkMode={isDarkMode}
        boxClassName={cn('shrink-0 self-start', dimmed && 'opacity-75')}
      />

      <div className={cn('min-w-0 flex-1', dimmed && 'opacity-75')}>
        {/* Line 1 — plate + model */}
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-[12px] font-bold tabular-nums tracking-[-0.01em] text-foreground">
            {v.license}
          </span>
          <span
            className="min-w-0 truncate text-[10.5px] leading-snug text-muted-foreground"
            title={fleetVehicleTitle(v)}
          >
            {fleetVehicleTitle(v)}
          </span>
        </div>

        {/* Line 2 — location */}
        <div className="mt-0.5 flex min-w-0 items-center gap-1">
          <Icon name="map-pin" className="h-3 w-3 shrink-0 text-muted-foreground/80" />
          <span
            className="min-w-0 truncate text-[10px] text-muted-foreground"
            title={locationLine}
          >
            {locationLine}
          </span>
        </div>

        {/* Line 3 — fuel · telemetry · odometer (left-aligned, km directly after signal) */}
        <div className="mt-0.5 flex min-w-0 items-center gap-x-1 overflow-hidden text-[10px] tabular-nums text-muted-foreground">
          {hasEnergy && (
            <span className="inline-flex shrink-0 items-center whitespace-nowrap">
              <FleetEnergyIndicator
                percent={display.energy.percent}
                isElectric={display.energy.kind === 'battery'}
                tone={display.energy.tone}
              />
            </span>
          )}
          {hasEnergy && <MetaDot />}
          <span
            className={cn(
              'min-w-0 shrink truncate',
              display.showTelemetryWarning && 'text-[color:var(--status-watch)]',
            )}
            title={display.telemetryLabel}
          >
            {display.telemetryLabel}
          </span>
          {hasOdometer && (
            <>
              <MetaDot />
              <span className="shrink-0 whitespace-nowrap">{display.odometerLabel}</span>
            </>
          )}
        </div>

        {/* Line 4 — optional reason chip alone (only when present) */}
        {reasonBadge && (
          <div className="mt-0.5 flex min-w-0 items-start">
            <span
              className={cn(
                'inline-block max-w-full truncate rounded-full px-1.5 py-px text-[9.5px] font-medium leading-tight',
                fleetCommandReasonChipClass(reasonTone),
              )}
              title={reasonBadge.text}
            >
              {reasonBadge.text}
            </span>
          </div>
        )}
      </div>

      {/* Right CTA column — badges + Open only */}
      <div className="flex shrink-0 flex-col items-end gap-1 self-start pt-0.5">
        <div className="flex items-center gap-1">
          <StatusChip
            tone={rowHealth.tone}
            icon={<Icon name="heart" className="h-3 w-3" />}
            className="px-1.5 py-0.5 text-[9.5px] font-semibold"
          >
            {rowHealth.label}
          </StatusChip>
          <StatusChip
            tone={rowRental.tone}
            className="px-1.5 py-0.5 text-[9.5px] font-semibold"
          >
            {rentalDisplay.label}
          </StatusChip>
        </div>
        <button
          type="button"
          onClick={onDetailClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onDetailClick(e);
            }
          }}
          aria-label="Open vehicle details"
          className="sq-press inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground opacity-90 transition-colors hover:bg-muted/40 hover:text-foreground group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
        >
          Open
          <Icon name="arrow-right" className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
