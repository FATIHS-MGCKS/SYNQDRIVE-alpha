import { Icon } from '../ui/Icon';
import { StatusChip, type StatusTone } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { VehicleHealthResponse } from '../../../lib/api';
import { getShortModel, type VehicleData } from '../../data/vehicles';
import { FleetEnergyIndicator } from '../fleet/FleetEnergyIndicator';
import { resolveFleetVehicleDisplayState } from '../../lib/fleetVehicleDisplay';
import type { DashboardSliceRow, VehicleRuntimeState } from './runtime';

function reasonChipClass(tone: StatusTone): string {
  if (tone === 'critical') {
    return 'bg-[color:color-mix(in_srgb,var(--status-critical)_10%,transparent)] text-[color:var(--status-critical)]';
  }
  if (tone === 'watch' || tone === 'warning') {
    return 'bg-[color:color-mix(in_srgb,var(--status-watch)_12%,transparent)] text-[color:var(--status-watch)]';
  }
  return 'bg-muted text-muted-foreground';
}

function fleetDrawerVehicleTitle(v: VehicleData): string {
  const model = typeof v.model === 'string' ? v.model : '';
  const shortModel = model ? getShortModel(model) : '';
  return [v.make, shortModel, v.year].filter(Boolean).join(' ') || model || '';
}

function vehicleStationLabel(v: VehicleData): string {
  const named = (v as { stationName?: string | null }).stationName;
  return named ?? v.station ?? '';
}

function runtimeTelemetryLabel(state: VehicleRuntimeState, de: boolean): string {
  const labels: Record<VehicleRuntimeState['telemetryState'], [string, string]> = {
    live: ['Live', 'Live'],
    standby: ['Standby', 'Standby'],
    soft_offline: ['Soft Offline', 'Soft Offline'],
    offline: ['Offline', 'Offline'],
    unknown: ['No signal', 'Kein Signal'],
  };
  return de ? labels[state.telemetryState][1] : labels[state.telemetryState][0];
}

function runtimeReadinessLabel(state: VehicleRuntimeState, de: boolean): { label: string; tone: StatusTone } {
  if (state.isBlocked) return { label: de ? 'Blockiert' : 'Blocked', tone: 'critical' };
  if (state.isReadyToRent) return { label: de ? 'Bereit' : 'Ready', tone: 'success' };
  return { label: de ? 'Nicht bereit' : 'Not Ready', tone: 'watch' };
}

function runtimeHealthLabel(state: VehicleRuntimeState, de: boolean): { label: string; tone: StatusTone } | null {
  if (state.isCritical) return { label: de ? 'Kritisch' : 'Critical', tone: 'critical' };
  if (state.isWarning) return { label: de ? 'Warnung' : 'Warning', tone: 'watch' };
  if (state.healthSeverity === 'ok') return { label: de ? 'Gut' : 'Good', tone: 'success' };
  return null;
}

export interface CompactFleetDrawerVehicleRowProps {
  row: DashboardSliceRow;
  vehicle?: VehicleData;
  health?: VehicleHealthResponse | null;
  runtimeState?: VehicleRuntimeState;
  locale: string;
  onOpenVehicle?: (vehicleId: string) => void;
  onClose: () => void;
}

export function CompactFleetDrawerVehicleRow({
  row,
  vehicle,
  health = null,
  runtimeState,
  locale,
  onOpenVehicle,
  onClose,
}: CompactFleetDrawerVehicleRowProps) {
  const de = locale === 'de';
  const canOpen = Boolean(row.vehicleId && onOpenVehicle);
  const ctaLabel = de ? 'Öffnen' : 'Open';

  const fleetDisplay = vehicle
    ? resolveFleetVehicleDisplayState(vehicle, { rentalHealth: health, locale })
    : null;

  const license = vehicle?.license ?? row.title;
  const modelLine = vehicle ? fleetDrawerVehicleTitle(vehicle) : row.subtitle;
  const station = vehicle ? vehicleStationLabel(vehicle) : row.stationLabel ?? runtimeState?.stationLabel;
  const telemetryLabel = fleetDisplay?.telemetryLabel
    ?? (runtimeState ? runtimeTelemetryLabel(runtimeState, de) : null);
  const telemetryWarns = fleetDisplay?.showTelemetryWarning ?? runtimeState?.telemetryState === 'offline';
  const healthChip = fleetDisplay
    ? { label: fleetDisplay.healthDisplay.label, tone: fleetDisplay.healthDisplay.tone }
    : runtimeState
      ? runtimeHealthLabel(runtimeState, de)
      : null;
  const rentalChip = fleetDisplay
    ? { label: fleetDisplay.rentalDisplay.label, tone: fleetDisplay.rentalDisplay.tone }
    : runtimeState
      ? runtimeReadinessLabel(runtimeState, de)
      : null;
  const reasonBadge = fleetDisplay?.reasonBadge ?? null;
  const energy = fleetDisplay?.energy;
  const odometerLabel = fleetDisplay?.odometerLabel ?? null;
  const dimmed = fleetDisplay?.showTelemetryWarning && vehicle?.status === 'Available';

  const showOpsMeta = energy?.percent != null || odometerLabel || telemetryLabel;

  const tint =
    fleetDisplay?.primaryStatus === 'critical' || fleetDisplay?.primaryStatus === 'blocked'
      ? 'bg-[color:color-mix(in_srgb,var(--status-critical)_5%,transparent)]'
      : fleetDisplay?.primaryStatus === 'warning'
        ? 'bg-[color:color-mix(in_srgb,var(--status-watch)_4%,transparent)]'
        : row.severity === 'critical'
          ? 'bg-[color:color-mix(in_srgb,var(--status-critical)_5%,transparent)]'
          : row.severity === 'warning'
            ? 'bg-[color:color-mix(in_srgb,var(--status-watch)_4%,transparent)]'
            : '';

  return (
    <article
      className={cn(
        'rounded-xl border border-border/50 bg-card/50 px-2.5 py-2.5 transition-colors hover:border-border/70 hover:bg-muted/15 dark:bg-card/40',
        tint,
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className={cn('min-w-0 flex-1 space-y-1', dimmed && 'opacity-80')}>
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className="shrink-0 text-[12px] font-bold tabular-nums tracking-[-0.01em] text-foreground">
              {license}
            </span>
            {modelLine ? (
              <span className="truncate text-[10.5px] leading-snug text-muted-foreground">{modelLine}</span>
            ) : null}
          </div>

          {station ? (
            <div
              className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground"
              title={station}
            >
              <Icon name="map-pin" className="h-3 w-3 shrink-0 text-muted-foreground/80" />
              <span className="truncate">{station}</span>
            </div>
          ) : null}

          {showOpsMeta ? (
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] tabular-nums text-muted-foreground">
              {energy?.percent != null ? (
                <FleetEnergyIndicator
                  percent={energy.percent}
                  isElectric={energy.kind === 'battery'}
                  tone={energy.tone}
                />
              ) : null}
              {energy?.percent != null && (odometerLabel || telemetryLabel) ? (
                <span aria-hidden className="text-muted-foreground/50">·</span>
              ) : null}
              {odometerLabel ? <span>{odometerLabel}</span> : null}
              {odometerLabel && telemetryLabel ? (
                <span aria-hidden className="text-muted-foreground/50">·</span>
              ) : null}
              {telemetryLabel ? (
                <span className={cn(telemetryWarns && 'text-[color:var(--status-watch)]')}>
                  {telemetryLabel}
                </span>
              ) : null}
            </div>
          ) : null}

          {reasonBadge ? (
            <span
              className={cn(
                'inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                reasonChipClass(reasonBadge.tone),
              )}
            >
              <span className="truncate">{reasonBadge.text}</span>
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex flex-wrap items-center justify-end gap-1">
            {healthChip ? (
              <StatusChip
                tone={healthChip.tone}
                icon={<Icon name="heart" className="h-3 w-3" />}
                className="px-1.5 py-0.5 text-[9.5px] font-semibold"
              >
                {healthChip.label}
              </StatusChip>
            ) : null}
            {rentalChip ? (
              <StatusChip tone={rentalChip.tone} className="px-1.5 py-0.5 text-[9.5px] font-semibold">
                {rentalChip.label}
              </StatusChip>
            ) : null}
          </div>

          {canOpen ? (
            <button
              type="button"
              onClick={() => {
                if (row.vehicleId && onOpenVehicle) onOpenVehicle(row.vehicleId);
                onClose();
              }}
              className="sq-press inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[10.5px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
            >
              {ctaLabel}
              <Icon name="arrow-right" className="h-3 w-3 opacity-70" />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
