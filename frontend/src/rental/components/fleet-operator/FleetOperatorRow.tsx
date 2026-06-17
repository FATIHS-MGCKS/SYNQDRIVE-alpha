import type { MouseEvent } from 'react';
import { Icon } from '../ui/Icon';
import { StatusChip, HealthStatusChip } from '../../../components/patterns';
import { VehicleData, VEHICLE_OFFLINE_LABEL } from '../../data/vehicles';
import { getShortModel } from '../../data/vehicles';
import {
  formatFleetDateTime,
  formatFuelPercentCeil,
  formatMaintenanceReason,
  formatOdometerKmFloor,
} from '../../../lib/formatVehicleDisplay';
import { useEffectiveHealth } from '../../FleetContext';
import { RentalHealthBadge } from '../rental-health/RentalHealthBadge';
import {
  formatLastSignalAge,
  hasCriticalOrWarningDtc,
  type FleetVehicleContext,
} from '../../lib/fleet-operator-panel';
import {
  fleetChipToneToStatusChip,
  fleetRowClassName,
  FleetVisualDot,
} from './fleetOperatorUi';

function fleetVehicleTitle(v: VehicleData): string {
  const model = typeof v.model === 'string' ? v.model : '';
  const shortModel = model ? getShortModel(model) : '';
  return [v.make, shortModel].filter(Boolean).join(' ') || model || 'Unknown vehicle';
}

function HealthPill({ vehicleId }: { vehicleId: string }) {
  const { status, health } = useEffectiveHealth(vehicleId);
  const reasons: string[] = [];
  if (health?.rental_blocked && health.blocking_reasons.length > 0) {
    reasons.push(`Blocked: ${health.blocking_reasons.join(' · ')}`);
  }
  if (health) {
    for (const [name, mod] of Object.entries(health.modules)) {
      if (mod.state === 'critical' || mod.state === 'warning') {
        reasons.push(`${name.replace(/_/g, ' ')}: ${mod.reason}`);
      }
    }
  }
  const title = reasons.join(' · ') || undefined;
  if (status === 'Good Health') {
    return <HealthStatusChip state="good" label="Healthy" dot={false} title={title} />;
  }
  if (status === 'Warning') {
    return <HealthStatusChip state="warning" label="Warning" dot={false} title={title} />;
  }
  if (status === 'Critical') {
    return <HealthStatusChip state="critical" label="Critical" dot={false} title={title} />;
  }
  return null;
}

function StatusChipForRow({
  ctx,
  isDarkMode,
}: {
  ctx: FleetVehicleContext;
  isDarkMode?: boolean;
}) {
  const { vehicle: v, visual, health } = ctx;
  if (visual.isBlocked && health) {
    return (
      <RentalHealthBadge
        health={health}
        isDarkMode={isDarkMode}
        size="sm"
        showBlockingLabel
      />
    );
  }
  if (!visual.hasLocation && v.status !== 'Maintenance') {
    return (
      <StatusChip tone="warning" className="text-[9px] font-bold uppercase tracking-wide">
        No location
      </StatusChip>
    );
  }
  if (visual.isOffline) {
    return (
      <StatusChip tone="neutral" title={visual.reason ?? VEHICLE_OFFLINE_LABEL} className="text-[9px] font-bold uppercase tracking-wide">
        {visual.shortLabel}
      </StatusChip>
    );
  }
  if (v.status === 'Active Rented' && v.activeIsOverdue) {
    return (
      <StatusChip tone="critical" className="text-[9px] font-bold uppercase tracking-wide">
        Overdue
      </StatusChip>
    );
  }
  if (v.status === 'Reserved' && v.reservedIsOverdue) {
    return (
      <StatusChip tone="critical" className="text-[9px] font-bold uppercase tracking-wide">
        Pickup overdue
      </StatusChip>
    );
  }
  if (visual.isReady && v.status === 'Available') {
    return (
      <StatusChip tone="success" className="text-[9px] font-bold uppercase tracking-wide">
        Ready
      </StatusChip>
    );
  }
  return (
    <StatusChip
      tone={fleetChipToneToStatusChip(visual.chipTone)}
      title={visual.reason}
      className="text-[9px] font-bold uppercase tracking-wide"
    >
      {visual.shortLabel}
    </StatusChip>
  );
}

function vehicleStationLabel(v: VehicleData): string {
  const named = (v as { stationName?: string | null }).stationName;
  return named ?? v.station ?? '';
}

function buildSecondaryLine(ctx: FleetVehicleContext): string {
  const { vehicle: v, visual } = ctx;
  const station = vehicleStationLabel(v);
  if (v.status === 'Active Rented') {
    const customer = v.activeCustomerName ?? 'Unassigned';
    const ret = v.activeReturnAt ? formatFleetDateTime(v.activeReturnAt) : null;
    return [customer, ret ? `Return ${ret}` : null].filter(Boolean).join(' · ');
  }
  if (v.status === 'Reserved') {
    const customer = v.reservedCustomerName ?? 'Unassigned';
    const pickup = v.reservedPickupAt ? formatFleetDateTime(v.reservedPickupAt) : null;
    const stationLabel = v.reservedPickupStationName || station;
    return [pickup ? `Pickup ${pickup}` : null, customer, stationLabel]
      .filter(Boolean)
      .join(' · ');
  }
  if (v.status === 'Maintenance') {
    return formatMaintenanceReason(
      v.maintenanceReasonCode,
      v.maintenanceReason ?? 'Maintenance',
    );
  }
  if (!visual.hasLocation) {
    return 'No valid GPS/location available';
  }
  return station || '—';
}

function buildTertiaryLine(ctx: FleetVehicleContext): string {
  const { vehicle: v, visual, health } = ctx;
  const parts: string[] = [];

  if (v.isLiveTracking) {
    parts.push('Live');
  } else if (visual.isOffline) {
    parts.push(VEHICLE_OFFLINE_LABEL);
  } else {
    const age = formatLastSignalAge(v.lastSignal);
    parts.push(visual.isStale ? `Last signal ${age} (stale)` : `Last signal ${age}`);
  }

  const fuel = v.isElectric
    ? v.evSoc ?? v.fuelPercent
    : v.fuelPercent ?? v.evSoc;
  if (fuel != null && Number.isFinite(fuel)) {
    parts.push(`${v.isElectric ? 'Battery' : 'Fuel'} ${formatFuelPercentCeil(fuel)}`);
  }

  const km = v.odometerKm;
  if (km != null && Number.isFinite(km)) {
    parts.push(formatOdometerKmFloor(km));
  }

  if (visual.reason && (visual.isAttention || visual.isBlocked)) {
    parts.push(visual.reason);
  } else if (hasCriticalOrWarningDtc(health)) {
    parts.push('DTC warning');
  }

  return parts.join(' · ');
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
  isDarkMode,
}: FleetOperatorRowProps) {
  const { vehicle: v, visual } = ctx;
  const dimmed = visual.isOffline && v.status === 'Available';

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
      className={fleetRowClassName(selected, dimmed ? 'opacity-70' : undefined)}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-baseline gap-1.5 min-w-0 flex-1">
          <FleetVisualDot mapTone={visual.mapTone} />
          <span className="text-[11px] font-bold leading-tight shrink-0 text-foreground">
            {v.license}
          </span>
          <span className="text-[10px] text-muted-foreground truncate">
            {fleetVehicleTitle(v)}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <HealthPill vehicleId={v.id} />
          <StatusChipForRow ctx={ctx} isDarkMode={isDarkMode} />
          <button
            type="button"
            onClick={onDetailClick}
            className="p-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Open vehicle details"
          >
            <Icon name="chevron-right" className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <p className="mt-1 text-[10px] text-foreground/85 truncate" title={buildSecondaryLine(ctx)}>
        {buildSecondaryLine(ctx)}
      </p>
      <p className="mt-0.5 text-[9.5px] text-muted-foreground truncate" title={buildTertiaryLine(ctx)}>
        {buildTertiaryLine(ctx)}
      </p>
    </div>
  );
}
