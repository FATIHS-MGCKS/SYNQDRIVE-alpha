import { Icon } from '../ui/Icon';
import { HealthStatusChip, StatusChip } from '../../../components/patterns';
import { useEffectiveHealth } from '../../FleetContext';
import { useRentalOrg } from '../../RentalContext';
import { useFleetObdPlugIndex } from '../../hooks/useFleetObdPlugIndex';
import { shouldShowObdUnpluggedBadge } from '../../lib/obd-plug-status';
import { formatUserFacingReasonLabel } from '../../lib/operational-issues';
import { ObdUnpluggedBadge } from '../ObdUnpluggedBadge';
import { VehicleDrivingAssessmentQualityChip } from './VehicleDrivingAssessmentQualityCard';
import {
  mapDataCoverageDisplay,
  mapHealthSeverityDisplay,
} from './vehicle-health-display.mapper';
import type { FleetProjectionVehicle } from '../../lib/fleet-vehicle-ui-projection';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  resolveVehicleDetailConnectivityPresentation,
} from '../../lib/vehicle-detail-operational-display';
import { resolveHealthDisplayFromUi } from '../../lib/fleet-p1-3-display';
import { buildFleetVehicleUiProjection } from '../../lib/fleet-vehicle-ui-projection';
import type { StatusTone } from '../../../components/patterns';

function healthChipStateFromTone(
  tone: StatusTone,
  status: 'good' | 'warning' | 'critical' | 'unknown',
): 'good' | 'warning' | 'critical' | 'unknown' | 'no_data' {
  if (!status || status === 'unknown') return 'no_data';
  if (status === 'good') return 'good';
  if (status === 'warning') return 'warning';
  if (status === 'critical') return 'critical';
  if (tone === 'success') return 'good';
  if (tone === 'watch' || tone === 'warning') return 'warning';
  if (tone === 'critical') return 'critical';
  return 'no_data';
}

export function VehicleConnectionBadge({
  compact = false,
  vehicle,
}: {
  compact?: boolean;
  vehicle: FleetProjectionVehicle;
}) {
  const { orgId } = useRentalOrg();
  const { locale, t } = useLanguage();
  const obdPlugByVehicleId = useFleetObdPlugIndex(orgId);
  const resolvedVehicleId = vehicle.id;
  const showObdUnplugged = resolvedVehicleId
    ? shouldShowObdUnpluggedBadge(obdPlugByVehicleId.get(resolvedVehicleId))
    : false;

  const connectivity = resolveVehicleDetailConnectivityPresentation(vehicle, {
    locale: locale === 'en' ? 'en' : 'de',
  });
  const lastTelemetryCaption = t('fleetConnectivity.detail.lastTelemetry');

  if (compact) {
    return (
      <div
        className="inline-flex max-w-[52vw] flex-wrap items-center justify-end gap-1 sm:max-w-none"
        title={`${connectivity.title}${showObdUnplugged ? ` · ${t('fleetConnectivity.physicalDevice.UNPLUGGED_CONFIRMED')}` : ''}`}
      >
        <div className="inline-flex max-w-full items-center gap-1 rounded-md surface-premium px-1.5 py-0.5">
          <Icon name="circle" className={`h-1.5 w-1.5 shrink-0 ${connectivity.dotColorClass}`} />
          <span className={`truncate text-[9.5px] font-semibold leading-none ${connectivity.labelColorClass}`}>
            {connectivity.shortLabel}
          </span>
          <span className="text-[9px] text-muted-foreground/70">·</span>
          <span className="truncate text-[9.5px] font-bold tabular-nums leading-none text-foreground">
            {connectivity.lastDataLabel}
          </span>
        </div>
        {showObdUnplugged ? <ObdUnpluggedBadge /> : null}
        <VehicleDrivingAssessmentQualityChip vehicleId={resolvedVehicleId} compact />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <div className="flex items-center gap-2 rounded-md surface-premium px-2.5 py-1">
        <div className="flex items-center gap-1.5">
          <Icon name="circle" className={`h-2 w-2 ${connectivity.dotColorClass}`} />
          <span className={`text-[10px] font-semibold tracking-[-0.003em] ${connectivity.labelColorClass}`}>
            {connectivity.shortLabel}
          </span>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-1">
          <span className="text-[10.5px] font-semibold text-muted-foreground">{lastTelemetryCaption}</span>
          <span className="text-[10.5px] font-bold tabular-nums text-foreground">
            {connectivity.lastDataLabel}
          </span>
        </div>
      </div>
      {showObdUnplugged ? <ObdUnpluggedBadge className="text-[9.5px]" /> : null}
      <VehicleDrivingAssessmentQualityChip vehicleId={resolvedVehicleId} />
    </div>
  );
}

export function VehicleHealthChip({ vehicle }: { vehicle: FleetProjectionVehicle }) {
  const { locale } = useLanguage();
  const { health, loading } = useEffectiveHealth(vehicle.id ?? null);
  const localeCode = locale === 'en' ? 'en' : 'de';

  const canonicalHealth = vehicle.healthEvaluation
    ? resolveHealthDisplayFromUi(buildFleetVehicleUiProjection(vehicle, { locale: localeCode }))
    : null;

  const reasons: string[] = [];
  if (health?.rental_blocked && health.blocking_reasons.length > 0) {
    reasons.push(
      ...health.blocking_reasons.map((reason) =>
        formatUserFacingReasonLabel(
          { title: reason, category: 'rental', issueType: 'rental_blocked' },
          localeCode,
        ),
      ),
    );
  }
  if (health && canonicalHealth?.isEvaluable) {
    for (const [name, mod] of Object.entries(health.modules)) {
      if (mod.state === 'critical' || mod.state === 'warning') {
        reasons.push(
          formatUserFacingReasonLabel(
            {
              title: mod.reason,
              source: `rental-health:${name}`,
              category: name === 'error_codes' ? 'dtc' : name,
            },
            localeCode,
          ),
        );
      }
    }
  }
  const title = (canonicalHealth?.tooltip ?? reasons.join(' · ')) || undefined;

  if (canonicalHealth) {
    const chipState = healthChipStateFromTone(canonicalHealth.tone, canonicalHealth.status);
    return (
      <HealthStatusChip
        state={chipState}
        label={canonicalHealth.label}
        icon={<Icon name="heart" className="h-3 w-3" />}
        title={title}
      />
    );
  }

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
