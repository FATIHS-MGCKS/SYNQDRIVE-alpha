import type {
  BatteryHealthDetail,
  BatteryHealthStatus,
  BatteryHealthSummary,
  BatteryRestingVoltageStatus,
  BatteryRuntimeStatus,
} from '../../lib/api';
import { normalizeLvBatteryVoltage } from './battery-display.utils';
import {
  formatBatteryAgeShort,
  formatIsoRelative,
  type BatteryVoltageContext,
  voltageContextI18nKey,
} from './battery-ui-formatters';
import { resolveCanonicalRestingVoltage, resolveCurrentLiveVoltage } from './battery-health-detail-ui';
import { ESTIMATED_LV_HEALTH_SCORE_LABEL_DE } from './battery-lv-semantics';
import type { BatteryDataQualityStatus } from './battery-data-quality';

export interface BatteryLvEstimatedHealthVm {
  label: string;
  status: BatteryHealthStatus;
  bars: 0 | 1 | 2 | 3;
  confidence: string | null;
  dataQualityStatus: BatteryDataQualityStatus | null;
  isCalibrating: boolean;
  isStabilizing: boolean;
  tooltipKey: string;
}

export interface BatteryLvVoltageVm {
  currentV: number | null;
  context: BatteryVoltageContext;
  contextKey: string;
  observedAt: string | null;
  ageLabel: string | null;
  isStale: boolean;
}

export interface BatteryLvRestingVm {
  valueV: number | null;
  status: BatteryRestingVoltageStatus;
  batteryTypeLabel: string | null;
  measurementContext: string | null;
  observedAt: string | null;
  ageLabel: string | null;
  dataQualityStatus: BatteryDataQualityStatus | null;
}

export interface BatteryLvStartBehaviorVm {
  available: boolean;
  label: string;
  classification: 'PROXY' | 'EXPERIMENTAL' | null;
  dataQualityStatus: BatteryDataQualityStatus | null;
  valueText: string | null;
  ageLabel: string | null;
  unsupportedReason: string | null;
}

export interface BatteryLvSummaryVm {
  unsupported: boolean;
  unsupportedReasonKey: string | null;
  runtimeStatus: BatteryRuntimeStatus | null;
  estimatedHealth: BatteryLvEstimatedHealthVm;
  voltage: BatteryLvVoltageVm;
  resting: BatteryLvRestingVm;
  aggregateDataQuality: BatteryDataQualityStatus | null;
  lastCheckedLabel: string | null;
  condition: string | null;
}

export interface BatteryLvDetailVm extends BatteryLvSummaryVm {
  startBehavior: BatteryLvStartBehaviorVm | null;
  exteriorAmbient: { value: string; hint: string | null };
  calibrationProgress: BatteryHealthSummary['lv']['calibrationProgress'] | null;
  watchpoints: string[];
  recommendations: string[];
  sliceQualities: {
    estimatedHealth: BatteryDataQualityStatus | null;
    restingVoltage: BatteryDataQualityStatus | null;
    crank: BatteryDataQualityStatus | null;
  };
}

function resolveLvRuntimeStatus(summary: BatteryHealthSummary | null | undefined): BatteryRuntimeStatus | null {
  return summary?.lv?.status ?? null;
}

export function isLvBatteryUnsupported(summary: BatteryHealthSummary | null | undefined): boolean {
  const status = resolveLvRuntimeStatus(summary);
  const hasAnyVoltage =
    resolveCurrentLiveVoltage(summary) != null || resolveCanonicalRestingVoltage(summary) != null;
  return status === 'estimate_unavailable' && !hasAnyVoltage;
}

export function resolveLvVoltageContext(summary: BatteryHealthSummary | null | undefined): BatteryVoltageContext {
  const lv = summary?.lv;
  const chargingV = normalizeLvBatteryVoltage(lv?.telemetry?.chargingVoltage);
  const isCharging =
    summary?.currentTelemetry?.chargingState === 'charging' || lv?.telemetry?.chargingVoltage != null;
  if (chargingV != null && isCharging) return 'charging';

  const crank = normalizeLvBatteryVoltage(lv?.telemetry?.crankingVoltage);
  const crankKind = lv?.telemetry?.crank?.measurementKind?.toLowerCase() ?? '';
  if (crank != null || crankKind.includes('crank') || crankKind.includes('start')) return 'under_load';

  const resting = normalizeLvBatteryVoltage(lv?.telemetry?.restingVoltage);
  const source = (lv?.telemetry?.voltageSource ?? '').toLowerCase();
  if (resting != null && (source.includes('rest') || source.includes('resting'))) return 'resting';

  return 'live';
}

export function buildBatteryLvSummaryVm(
  summary: BatteryHealthSummary | null | undefined,
  liveMapVoltage?: number | null,
  locale = 'de-DE',
): BatteryLvSummaryVm {
  const unsupported = isLvBatteryUnsupported(summary);
  const pub = summary?.lv?.publicationState ?? summary?.currentState?.publicationState;
  const runtimeStatus = resolveLvRuntimeStatus(summary);
  const isCalibrating = !unsupported && (runtimeStatus === 'calibrating' || pub === 'INITIAL_CALIBRATION');
  const isStabilizing = !unsupported && (runtimeStatus === 'stabilizing' || pub === 'STABILIZING');

  const estimated = summary?.lv?.estimatedHealth;
  const condition = summary?.lv?.condition ?? summary?.condition ?? null;
  const estimatedStatus: BatteryHealthStatus =
    estimated?.status ??
    (condition === 'good'
      ? 'GOOD'
      : condition === 'watch'
        ? 'WATCH'
        : condition === 'attention'
          ? 'WARNING'
          : 'UNKNOWN');

  const context = resolveLvVoltageContext(summary);
  const observedAt =
    summary?.lv?.telemetry?.voltageObservedAt ??
    summary?.lv?.freshness?.observedAt ??
    summary?.currentTelemetry?.observedAt ??
    null;
  const ageMs = summary?.lv?.freshness?.ageMs ?? null;

  const resting = summary?.lv?.restingVoltage;
  const restingValue = resolveCanonicalRestingVoltage(summary);
  const batteryTypeLabel =
    resting?.batteryType && resting.batteryType !== 'UNKNOWN'
      ? resting.batteryType.replace(/_/g, ' ')
      : summary?.specs?.batteryType ?? null;

  const lc = summary?.lv?.freshness?.observedAt ?? summary?.currentState?.lastChecked;

  return {
    unsupported,
    unsupportedReasonKey: unsupported ? 'health.battery.lv.unsupported' : null,
    runtimeStatus,
    estimatedHealth: {
      label: estimated?.label ?? ESTIMATED_LV_HEALTH_SCORE_LABEL_DE,
      status: estimatedStatus,
      bars:
        estimated?.bars ??
        (estimatedStatus === 'GOOD'
          ? 3
          : estimatedStatus === 'WATCH'
            ? 2
            : estimatedStatus === 'WARNING' || estimatedStatus === 'CRITICAL'
              ? 1
              : 0),
      confidence: estimated?.confidence ?? summary?.lv?.confidence ?? null,
      dataQualityStatus:
        estimated?.dataQualityStatus ?? estimated?.dataQuality?.status ?? summary?.dataQuality?.slices.lvEstimatedHealth.status ?? null,
      isCalibrating,
      isStabilizing,
      tooltipKey: 'health.battery.lv.estimatedHealthTooltip',
    },
    voltage: {
      currentV: resolveCurrentLiveVoltage(summary, liveMapVoltage),
      context,
      contextKey: voltageContextI18nKey(context),
      observedAt,
      ageLabel: formatBatteryAgeShort(ageMs, locale) ?? formatIsoRelative(observedAt, locale),
      isStale: summary?.lv?.freshness?.isFresh === false,
    },
    resting: {
      valueV: restingValue,
      status: resting?.status ?? 'UNKNOWN',
      batteryTypeLabel,
      measurementContext: resting?.measurementContext ?? null,
      observedAt: resting?.dataQuality?.observedAt ?? observedAt,
      ageLabel: formatIsoRelative(resting?.dataQuality?.observedAt ?? observedAt, locale),
      dataQualityStatus: resting?.dataQualityStatus ?? resting?.dataQuality?.status ?? summary?.dataQuality?.slices.lvRestingVoltage.status ?? null,
    },
    aggregateDataQuality: summary?.dataQuality?.status ?? null,
    lastCheckedLabel: formatIsoRelative(lc, locale),
    condition,
  };
}

export function buildBatteryLvDetailVm(
  detail: BatteryHealthDetail | null | undefined,
  summary: BatteryHealthSummary | null | undefined,
  options?: {
    liveMapVoltage?: number | null;
    exteriorAmbient?: { value: string; hint: string | null };
    locale?: string;
  },
): BatteryLvDetailVm {
  const base = buildBatteryLvSummaryVm(summary, options?.liveMapVoltage, options?.locale);
  const startProxy = summary?.lv?.telemetry?.startProxy;
  const latestMeasurement = startProxy?.measurements?.[0] ?? null;

  let startBehavior: BatteryLvStartBehaviorVm | null = null;
  if (startProxy) {
    const availability = startProxy.availability;
    startBehavior = {
      available: availability === 'SUPPORTED' && latestMeasurement != null,
      label: startProxy.uiLabelDe || 'Startverhalten (geschätzt)',
      classification: latestMeasurement?.classification ?? null,
      dataQualityStatus: latestMeasurement?.dataQualityStatus ?? null,
      valueText:
        latestMeasurement?.numericValue != null
          ? `${latestMeasurement.numericValue}${latestMeasurement.unit ? ` ${latestMeasurement.unit}` : ''}`
          : null,
      ageLabel: formatBatteryAgeShort(latestMeasurement?.measurementAgeMs ?? null, options?.locale),
      unsupportedReason:
        availability === 'UNSUPPORTED'
          ? startProxy.availabilityLabelDe
          : availability === 'NOT_EVALUABLE'
            ? startProxy.availabilityLabelDe
            : null,
    };
  }

  return {
    ...base,
    startBehavior,
    exteriorAmbient: options?.exteriorAmbient ?? { value: '—', hint: null },
    calibrationProgress: summary?.lv?.calibrationProgress ?? summary?.currentState?.calibrationProgress ?? null,
    watchpoints: summary?.watchpoints ?? [],
    recommendations: summary?.recommendations ?? [],
    sliceQualities: {
      estimatedHealth: summary?.dataQuality?.slices.lvEstimatedHealth.status ?? null,
      restingVoltage: summary?.dataQuality?.slices.lvRestingVoltage.status ?? null,
      crank: summary?.dataQuality?.slices.lvCrank.status ?? null,
    },
  };
}
