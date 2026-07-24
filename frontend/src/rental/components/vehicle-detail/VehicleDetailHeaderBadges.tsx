import { Icon } from '../ui/Icon';
import { HealthStatusChip, StatusChip } from '../../../components/patterns';
import { useVehicleLiveMapStore } from '../../stores/useVehicleLiveMapStore';
import { resolveVehicleDetailTelemetryState } from '../../lib/vehicle-telemetry-runtime';
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
import { useShallow } from 'zustand/react/shallow';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  translateTelemetryAgeShort,
  translateTelemetryFreshnessShort,
} from '../../lib/vehicle-detail-i18n';

export function VehicleConnectionBadge({
  compact = false,
  vehicleId,
}: {
  compact?: boolean;
  vehicleId?: string | null;
}) {
  const { t, locale } = useLanguage();
  const { orgId } = useRentalOrg();
  const { map: obdPlugByVehicleId, status: obdIndexStatus } = useFleetObdPlugIndex(orgId);
  const { onlineStatus, measuredAt, receivedAt, signalAgeMs, lastSignal, boundVehicleId } =
    useVehicleLiveMapStore(
    useShallow((state) => ({
      onlineStatus: state.onlineStatus,
      measuredAt: state.measuredAt,
      receivedAt: state.receivedAt,
      signalAgeMs: state.signalAgeMs,
      lastSignal: state.lastSignal,
      boundVehicleId: state.boundVehicleId,
    })),
  );

  const resolvedVehicleId = vehicleId ?? boundVehicleId;
  const showObdUnplugged =
    obdIndexStatus === 'ready' && resolvedVehicleId
      ? shouldShowObdUnpluggedBadge(obdPlugByVehicleId.get(resolvedVehicleId))
      : false;

  const freshness = resolveVehicleDetailTelemetryState({
    measuredAt,
    receivedAt,
    lastSignal,
    signalAgeMs,
    onlineStatus,
  });
  const statusLabel = translateTelemetryFreshnessShort(freshness.freshness, t);
  const timeAgo = translateTelemetryAgeShort(freshness.signalAgeMs, freshness.isLive, t);
  const title = t('vehicleDetail.header.signalTitle', {
    status: statusLabel,
    age: timeAgo,
  }) + (showObdUnplugged ? ` · ${t('vehicleDetail.header.obdUnplugged')}` : '');

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
        title={title}
      >
        <div className="inline-flex max-w-full items-center gap-1 rounded-md border border-border surface-premium px-1.5 py-0.5 shadow-sm">
          <Icon name="circle" className={`h-1.5 w-1.5 shrink-0 ${dotColor}`} />
          <span className={`truncate text-[9.5px] font-semibold leading-none ${labelColor}`}>
            {statusLabel}
          </span>
          <span className="text-[9px] text-muted-foreground/70">·</span>
          <span className="truncate text-[9.5px] font-bold tabular-nums leading-none text-foreground">
            {timeAgo}
          </span>
        </div>
        {showObdUnplugged ? <ObdUnpluggedBadge /> : null}
        <VehicleDrivingAssessmentQualityChip vehicleId={resolvedVehicleId} compact />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <div className="flex items-center gap-2 rounded-md border border-border surface-premium px-2.5 py-1 shadow-sm">
        <div className="flex items-center gap-1.5">
          <Icon name="circle" className={`h-2 w-2 ${dotColor}`} />
          <span className={`text-[10px] font-semibold tracking-[-0.003em] ${labelColor}`}>
            {statusLabel}
          </span>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-1">
          <span className="text-[10.5px] font-semibold text-muted-foreground">
            {t('vehicleDetail.header.lastSignal')}
          </span>
          <span className="text-[10.5px] font-bold tabular-nums text-foreground">{timeAgo}</span>
        </div>
      </div>
      {showObdUnplugged ? <ObdUnpluggedBadge className="text-[9.5px]" /> : null}
      <VehicleDrivingAssessmentQualityChip vehicleId={resolvedVehicleId} />
    </div>
  );
}

export function VehicleHealthChip({ vehicleId }: { vehicleId: string | null }) {
  const { t, locale } = useLanguage();
  const { health, loading } = useEffectiveHealth(vehicleId);
  const reasonLocale = locale.startsWith('de') ? 'de' : 'en';
  const reasons: string[] = [];
  if (health?.rental_blocked && health.blocking_reasons.length > 0) {
    reasons.push(
      ...health.blocking_reasons.map((reason) =>
        formatUserFacingReasonLabel(
          { title: reason, category: 'rental', issueType: 'rental_blocked' },
          reasonLocale,
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
            reasonLocale,
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
        label={t('vehicleDetail.health.loading')}
        icon={<Icon name="heart" className="h-3 w-3" />}
        title={t('vehicleDetail.health.loadingTitle')}
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
          label={t('vehicleDetail.health.critical')}
          icon={<Icon name="heart" className="h-3 w-3" />}
          title={severity.title ?? title}
        />
      );
    }
    if (severity.severity === 'warning') {
      return (
        <HealthStatusChip
          state="warning"
          label={t('vehicleDetail.health.warning')}
          icon={<Icon name="heart" className="h-3 w-3" />}
          title={severity.title ?? title}
        />
      );
    }
    if (severity.severity === 'good') {
      return (
        <HealthStatusChip
          state="good"
          label={t('vehicleDetail.health.good')}
          icon={<Icon name="heart" className="h-3 w-3" />}
          title={severity.title ?? title}
        />
      );
    }
    return (
      <HealthStatusChip
        state="no_data"
        label={severity.label === 'No Data' ? t('vehicleDetail.health.noData') : severity.label}
        icon={<Icon name="heart" className="h-3 w-3" />}
        title={severity.title ?? title ?? t('vehicleDetail.health.insufficientData')}
      />
    );
  })();

  if (!coverage?.label) {
    return severityChip;
  }

  const coverageLabel =
    coverage.label === 'Limited Data'
      ? t('vehicleDetail.health.limitedData')
      : coverage.label;

  return (
    <div className="inline-flex max-w-full items-center gap-1">
      {severityChip}
      <StatusChip
        tone="neutral"
        className="!hidden !px-1.5 !py-0.5 !text-[9px] !font-semibold sm:!inline-flex"
        title={t('vehicleDetail.health.dataCoverageTitle')}
      >
        {coverageLabel}
      </StatusChip>
    </div>
  );
}
