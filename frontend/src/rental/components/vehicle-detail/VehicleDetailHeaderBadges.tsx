import { Icon } from '../ui/Icon';
import { HealthStatusChip, StatusChip } from '../../../components/patterns';
import { useVehicleLiveMapStore } from '../../stores/useVehicleLiveMapStore';
import { resolveTelemetryFreshness } from '../../lib/telemetryFreshness';
import { useEffectiveHealth } from '../../FleetContext';
import { useRentalOrg } from '../../RentalContext';
import { useFleetObdPlugIndex } from '../../hooks/useFleetObdPlugIndex';
import { shouldShowObdUnpluggedBadge } from '../../lib/obd-plug-status';
import { formatUserFacingReasonLabel } from '../../lib/operational-issues';
import { ObdUnpluggedBadge } from '../ObdUnpluggedBadge';
import {
  mapDataCoverageDisplay,
  mapHealthSeverityDisplay,
} from './vehicle-health-display.mapper';
import { useShallow } from 'zustand/react/shallow';

export function VehicleConnectionBadge({
  compact = false,
  vehicleId,
}: {
  compact?: boolean;
  vehicleId?: string | null;
}) {
  const { orgId } = useRentalOrg();
  const obdPlugByVehicleId = useFleetObdPlugIndex(orgId);
  const { onlineStatus, lastSignal, boundVehicleId } = useVehicleLiveMapStore(
    useShallow((state) => ({
      onlineStatus: state.onlineStatus,
      lastSignal: state.lastSignal,
      boundVehicleId: state.boundVehicleId,
    })),
  );

  const resolvedVehicleId = vehicleId ?? boundVehicleId;
  const showObdUnplugged = resolvedVehicleId
    ? shouldShowObdUnpluggedBadge(obdPlugByVehicleId.get(resolvedVehicleId))
    : false;

  const freshness = resolveTelemetryFreshness({ lastSignal, onlineStatus });
  let timeAgo = '—';
  if (freshness.signalAgeMs != null) {
    const mins = Math.floor(freshness.signalAgeMs / 60000);
    if (mins < 1) timeAgo = 'just now';
    else if (mins < 60) timeAgo = `${mins}m ago`;
    else {
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) timeAgo = `${hrs}h ago`;
      else timeAgo = `${Math.floor(hrs / 24)}d ago`;
    }
  }

  const dotColor = freshness.isLive
    ? 'text-[color:var(--status-positive)] fill-[color:var(--status-positive)] animate-online-pulse'
    : freshness.isSignalDelayed
      ? 'text-[color:var(--status-watch)] fill-[color:var(--status-watch)]'
      : freshness.isStandby
        ? 'text-muted-foreground fill-[color:var(--muted-foreground)]'
        : 'text-muted-foreground fill-[color:var(--status-nodata)]';
  const labelColor = freshness.isLive
    ? 'text-[color:var(--status-positive)]'
    : freshness.isSignalDelayed
      ? 'text-[color:var(--status-watch)]'
      : 'text-muted-foreground';

  if (compact) {
    return (
      <div
        className="inline-flex max-w-[52vw] flex-wrap items-center justify-end gap-1 sm:max-w-none"
        title={`${freshness.label} · Last signal ${timeAgo}${showObdUnplugged ? ' · OBD unplugged' : ''}`}
      >
        <div className="inline-flex max-w-full items-center gap-1 rounded-md border border-border surface-premium px-1.5 py-0.5 shadow-sm">
          <Icon name="circle" className={`h-1.5 w-1.5 shrink-0 ${dotColor}`} />
          <span className={`truncate text-[9.5px] font-semibold leading-none ${labelColor}`}>
            {freshness.shortLabel}
          </span>
          <span className="text-[9px] text-muted-foreground/70">·</span>
          <span className="truncate text-[9.5px] font-bold tabular-nums leading-none text-foreground">
            {timeAgo}
          </span>
        </div>
        {showObdUnplugged ? <ObdUnpluggedBadge /> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <div className="flex items-center gap-2 rounded-md border border-border surface-premium px-2.5 py-1 shadow-sm">
        <div className="flex items-center gap-1.5">
          <Icon name="circle" className={`h-2 w-2 ${dotColor}`} />
          <span className={`text-[10px] font-semibold tracking-[-0.003em] ${labelColor}`}>
            {freshness.shortLabel}
          </span>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-1">
          <span className="text-[10.5px] font-semibold text-muted-foreground">Last Signal</span>
          <span className="text-[10.5px] font-bold tabular-nums text-foreground">{timeAgo}</span>
        </div>
      </div>
      {showObdUnplugged ? <ObdUnpluggedBadge className="text-[9.5px]" /> : null}
    </div>
  );
}

export function VehicleHealthChip({ vehicleId }: { vehicleId: string | null }) {
  const { health, loading } = useEffectiveHealth(vehicleId);
  const reasons: string[] = [];
  if (health?.rental_blocked && health.blocking_reasons.length > 0) {
    reasons.push(
      ...health.blocking_reasons.map((reason) =>
        formatUserFacingReasonLabel(
          { title: reason, category: 'rental', issueType: 'rental_blocked' },
          'de',
        ),
      ),
    );
  }
  if (health) {
    for (const [name, mod] of Object.entries(health.modules)) {
      if (mod.state === 'critical' || mod.state === 'warning') {
        reasons.push(
          formatUserFacingReasonLabel(
            {
              title: mod.reason,
              source: `rental-health:${name}`,
              category: name === 'error_codes' ? 'dtc' : name,
            },
            'de',
          ),
        );
      }
    }
  }
  const title = reasons.join(' · ') || undefined;

  if (loading && !health) {
    return (
      <HealthStatusChip
        state="unknown"
        label="Loading…"
        icon={<Icon name="heart" className="h-3 w-3" />}
        title="Loading rental health…"
      />
    );
  }

  const severity = mapHealthSeverityDisplay({
    rentalHealth: health,
    rentalHealthLoading: loading,
    healthError: null,
  });
  const coverage = mapDataCoverageDisplay({ rentalHealth: health });

  const severityChip = (() => {
    if (severity.severity === 'critical') {
      return (
        <HealthStatusChip
          state="critical"
          label="Critical"
          icon={<Icon name="heart" className="h-3 w-3" />}
          title={severity.title ?? title}
        />
      );
    }
    if (severity.severity === 'warning') {
      return (
        <HealthStatusChip
          state="warning"
          label="Warning"
          icon={<Icon name="heart" className="h-3 w-3" />}
          title={severity.title ?? title}
        />
      );
    }
    if (severity.severity === 'good') {
      return (
        <HealthStatusChip
          state="good"
          label="Good"
          icon={<Icon name="heart" className="h-3 w-3" />}
          title={severity.title ?? title}
        />
      );
    }
    return (
      <HealthStatusChip
        state="no_data"
        label={severity.label}
        icon={<Icon name="heart" className="h-3 w-3" />}
        title={severity.title ?? title ?? 'Insufficient rental health data'}
      />
    );
  })();

  if (!coverage?.label) {
    return severityChip;
  }

  return (
    <div className="inline-flex max-w-full items-center gap-1">
      {severityChip}
      <StatusChip
        tone="neutral"
        className="!hidden !px-1.5 !py-0.5 !text-[9px] !font-semibold sm:!inline-flex"
        title="Data coverage — not a health severity"
      >
        {coverage.label}
      </StatusChip>
    </div>
  );
}
