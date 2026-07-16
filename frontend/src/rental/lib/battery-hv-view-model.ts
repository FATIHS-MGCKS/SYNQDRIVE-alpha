import type {
  BatteryHealthDetail,
  BatteryHealthStatus,
  BatteryHealthSummary,
  HvSohSource,
  SohPublicationState,
} from '../../lib/api';
import type { BatteryDataQualityStatus } from './battery-data-quality';
import { shouldShowBatteryHealthClaim } from './battery-data-quality';
import {
  formatConfidenceLabel,
  formatIsoRelative,
  formatKwh,
  formatMethodLabel,
  formatPercent,
  maskInternalId,
} from './battery-ui-formatters';

export interface BatteryHvSohVm {
  /** Never label LV-style — only true HV SOH when source allows. */
  showPrimarySoh: boolean;
  primaryLabelKey: string;
  primaryValue: string;
  prefixApproximate: boolean;
  healthStatus: BatteryHealthStatus;
  method: string | null;
  confidence: string | null;
  dataQualityStatus: BatteryDataQualityStatus | null;
  sohSource: HvSohSource | null;
  interpretationLabel: string | null;
  interpretationDescription: string | null;
}

export interface BatteryHvProviderSohVm {
  show: boolean;
  value: string;
  observedAtLabel: string | null;
  dataQualityStatus: BatteryDataQualityStatus | null;
}

export interface BatteryHvLiveVm {
  socPercent: number | null;
  currentEnergyKwh: number | null;
  rangeKm: number | null;
  isCharging: boolean | null;
  cableConnected: boolean | null;
  chargingPowerKw: number | null;
  chargingStateKey: string;
  observedAtLabel: string | null;
}

export interface BatteryHvCapacityVm {
  showUsableCapacity: boolean;
  usableCapacityText: string;
  usableCapacityHintKey: string | null;
  referenceCapacityText: string;
  referenceVerificationKey: string | null;
  referenceSource: string | null;
  grossCapacityText: string;
  legacyUnverified: boolean;
}

export interface BatteryHvSessionVm {
  id: string;
  label: string;
  timeRange: string;
  socRange: string | null;
  energyKwh: string | null;
  powerKw: string | null;
  durationMin: string | null;
  isOngoing: boolean;
}

export interface BatteryHvSummaryVm {
  supported: boolean;
  publicationState: SohPublicationState;
  isCalibrating: boolean;
  isStabilizing: boolean;
  soh: BatteryHvSohVm;
  live: BatteryHvLiveVm;
}

export interface BatteryHvDetailVm extends BatteryHvSummaryVm {
  providerSoh: BatteryHvProviderSohVm;
  capacity: BatteryHvCapacityVm;
  sessions: BatteryHvSessionVm[];
  sliceQualities: {
    hvSoh: BatteryDataQualityStatus | null;
    hvLegacyCapacity: BatteryDataQualityStatus | null;
  };
  snapshotCount: number;
}

function resolveHvHealthStatus(
  hv: BatteryHealthSummary['hv'] | null | undefined,
  sohPct: number | null,
): BatteryHealthStatus {
  if (hv?.healthStatus) return hv.healthStatus;
  if (sohPct == null) return 'UNKNOWN';
  if (sohPct >= 80) return 'GOOD';
  if (sohPct >= 70) return 'WATCH';
  if (sohPct >= 60) return 'WARNING';
  return 'CRITICAL';
}

function resolvePublishedSoh(
  summary: BatteryHealthSummary | null | undefined,
): { percent: number | null; source: HvSohSource | null; gatePassed: boolean } {
  const hv = summary?.hv;
  const canonicalHv = summary?.canonical?.hv;
  const gatePassed = canonicalHv?.sohAssessment?.sohGatePassed === true;
  const percent = hv?.sohPct ?? canonicalHv?.providerSoh.percent ?? null;
  const source = hv?.sohSource ?? canonicalHv?.providerSoh.percent != null ? 'PROVIDER' : null;
  return { percent, source: source ?? null, gatePassed };
}

export function buildBatteryHvSohVm(summary: BatteryHealthSummary | null | undefined): BatteryHvSohVm {
  const hv = summary?.hv;
  const pub = hv?.publicationState ?? 'INITIAL_CALIBRATION';
  const { percent, source, gatePassed } = resolvePublishedSoh(summary);
  const dq = hv?.dataQualityStatus ?? summary?.dataQuality?.slices.hvSoh.status ?? null;
  const decisionCapable = shouldShowBatteryHealthClaim(dq);
  const noFallback = hv?.noFallbackSoh === true;

  const isCalibrating = pub === 'INITIAL_CALIBRATION';
  const isStabilizing = pub === 'STABILIZING';

  let showPrimarySoh = false;
  let primaryLabelKey = 'health.battery.hv.sohUnavailable';
  let prefixApproximate = isStabilizing;

  if (!isCalibrating && percent != null && decisionCapable) {
    if (source === 'PROVIDER' || source === 'DOCUMENT' || source === 'MANUAL') {
      showPrimarySoh = true;
      primaryLabelKey =
        source === 'PROVIDER' ? 'health.battery.hv.providerSoh' : 'health.battery.hv.verifiedSoh';
    } else if (source === 'CAPACITY_ESTIMATE' && gatePassed && pub === 'STABLE') {
      showPrimarySoh = true;
      primaryLabelKey = 'health.battery.hv.estimatedSoh';
      prefixApproximate = true;
    } else if (!noFallback && pub === 'STABLE') {
      showPrimarySoh = true;
      primaryLabelKey = 'health.battery.hv.estimatedSoh';
    }
  } else if (isCalibrating && percent != null) {
    showPrimarySoh = true;
    primaryLabelKey = 'health.battery.hv.provisionalSoh';
    prefixApproximate = true;
  }

  return {
    showPrimarySoh,
    primaryLabelKey,
    primaryValue: percent != null ? formatPercent(percent, 1).replace('%', '') : '—',
    prefixApproximate,
    healthStatus: resolveHvHealthStatus(hv, percent),
    method: hv?.method ?? null,
    confidence: hv?.confidence ?? null,
    dataQualityStatus: dq,
    sohSource: source,
    interpretationLabel: hv?.interpretation?.label ?? null,
    interpretationDescription: hv?.interpretation?.description ?? null,
  };
}

export function buildBatteryHvLiveVm(summary: BatteryHealthSummary | null | undefined, locale = 'de-DE'): BatteryHvLiveVm {
  const hv = summary?.hv?.telemetry;
  const live = summary?.currentTelemetry;
  const canonicalLive = summary?.canonical?.liveState?.hv?.values;

  const isCharging = hv?.isCharging ?? (live?.chargingState === 'charging' ? true : live?.chargingState === 'not_charging' ? false : null);
  const chargingStateKey =
    isCharging === true
      ? 'health.battery.hv.charging.active'
      : isCharging === false
        ? 'health.battery.hv.charging.idle'
        : 'health.battery.hv.charging.unknown';

  const observedAt =
    summary?.hv?.freshness?.observedAt ?? live?.observedAt ?? summary?.canonical?.liveState?.hv?.observedAt ?? null;

  return {
    socPercent: hv?.socPercent ?? live?.socPercent ?? canonicalLive?.socPercent ?? null,
    currentEnergyKwh: hv?.currentEnergyKwh ?? canonicalLive?.currentEnergyKwh ?? null,
    rangeKm: hv?.rangeKm ?? live?.rangeKm ?? canonicalLive?.rangeKm ?? null,
    isCharging,
    cableConnected: hv?.chargingCableConnected ?? null,
    chargingPowerKw: hv?.chargingPowerKw ?? live?.chargingPowerKw ?? canonicalLive?.chargingPowerKw ?? null,
    chargingStateKey,
    observedAtLabel: formatIsoRelative(observedAt, locale),
  };
}

export function buildBatteryHvCapacityVm(summary: BatteryHealthSummary | null | undefined): BatteryHvCapacityVm {
  const hv = summary?.hv;
  const canonicalHv = summary?.canonical?.hv;
  const legacy = hv?.legacyCapacity;
  const gatePassed = canonicalHv?.sohAssessment?.sohGatePassed === true;
  const shadowPassed = legacy?.decisionCapable === true;
  const showUsable =
    gatePassed ||
    shadowPassed ||
    (canonicalHv?.sohAssessment?.estimatedUsableCapacityKwh != null && hv?.publicationState === 'STABLE');

  const usableKwh =
    canonicalHv?.sohAssessment?.estimatedUsableCapacityKwh ??
    legacy?.diagnosticEstimatedCapacityKwh ??
    null;

  const ref = summary?.canonical?.hv?.referenceCapacity;
  const gross = hv?.telemetry?.grossCapacityKwh ?? ref?.capacityKwh ?? null;

  return {
    showUsableCapacity: showUsable && usableKwh != null,
    usableCapacityText: formatKwh(usableKwh),
    usableCapacityHintKey: gatePassed ? 'health.battery.hv.usableCapacity.gated' : 'health.battery.hv.usableCapacity.shadow',
    referenceCapacityText: formatKwh(ref?.capacityKwh ?? gross),
    referenceVerificationKey: ref?.verificationStatus
      ? `health.battery.hv.referenceVerification.${ref.verificationStatus}`
      : null,
    referenceSource: ref?.source ? formatMethodLabel(ref.source) : null,
    grossCapacityText: formatKwh(gross),
    legacyUnverified: legacy?.displayMode === 'LEGACY_UNVERIFIED',
  };
}

function mapSession(raw: Record<string, unknown>, index: number): BatteryHvSessionVm {
  const start = raw.startTime ?? raw.startAt;
  const end = raw.endTime ?? raw.endAt;
  const startDate = start ? new Date(String(start)) : null;
  const label = startDate && Number.isFinite(startDate.getTime())
    ? startDate.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
    : `Session ${index + 1}`;

  const timeRange =
    startDate && Number.isFinite(startDate.getTime())
      ? `${startDate.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} · ${startDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
      : '—';

  const startSoc = raw.startSoc ?? raw.socStart;
  const endSoc = raw.endSoc ?? raw.socEnd;

  return {
    id: maskInternalId(String(raw.id ?? raw.sessionId ?? index)) ?? `session-${index}`,
    label,
    timeRange,
    socRange:
      startSoc != null && endSoc != null
        ? `${Number(startSoc).toFixed(0)}% → ${Number(endSoc).toFixed(0)}%`
        : null,
    energyKwh: raw.energyChargedKwh != null ? formatKwh(Number(raw.energyChargedKwh)) : null,
    powerKw: raw.maxChargingPowerKw != null ? `${Number(raw.maxChargingPowerKw)} kW` : null,
    durationMin: raw.durationMinutes != null ? `${raw.durationMinutes} min` : null,
    isOngoing: raw.isOngoing === true || raw.endAt == null,
  };
}

export function buildBatteryHvSummaryVm(summary: BatteryHealthSummary | null | undefined, locale = 'de-DE'): BatteryHvSummaryVm {
  const hv = summary?.hv;
  const pub = hv?.publicationState ?? 'INITIAL_CALIBRATION';
  return {
    supported: summary?.support?.hv === true,
    publicationState: pub,
    isCalibrating: pub === 'INITIAL_CALIBRATION',
    isStabilizing: pub === 'STABILIZING',
    soh: buildBatteryHvSohVm(summary),
    live: buildBatteryHvLiveVm(summary, locale),
  };
}

export function buildBatteryHvDetailVm(
  detail: BatteryHealthDetail | null | undefined,
  summary: BatteryHealthSummary | null | undefined,
  locale = 'de-DE',
): BatteryHvDetailVm {
  const base = buildBatteryHvSummaryVm(summary, locale);
  const hv = summary?.hv;
  const providerPct = hv?.telemetry?.providerSohPercent ?? summary?.canonical?.hv?.providerSoh.percent ?? null;
  const providerFresh = summary?.canonical?.hv?.providerSoh.decisionFresh === true;
  const showProvider =
    providerPct != null &&
    (hv?.sohSource === 'PROVIDER' || summary?.canonical?.hv?.providerSoh.source === 'PROVIDER') &&
    providerFresh;

  const sessionsRaw = detail?.detail?.hv?.chargingSessions ?? [];
  const currentSession = summary?.canonical?.hv?.currentChargeSession ?? null;
  const lastSession = summary?.canonical?.hv?.lastChargeSession ?? null;

  const sessions: BatteryHvSessionVm[] = [];
  if (currentSession) sessions.push(mapSession(currentSession as unknown as Record<string, unknown>, 0));
  else if (lastSession) sessions.push(mapSession(lastSession as unknown as Record<string, unknown>, 0));
  for (const [i, s] of sessionsRaw.entries()) {
    sessions.push(mapSession(s as Record<string, unknown>, i + 1));
  }

  return {
    ...base,
    providerSoh: {
      show: showProvider,
      value: formatPercent(providerPct, 1),
      observedAtLabel: formatIsoRelative(hv?.freshness?.observedAt ?? null, locale),
      dataQualityStatus: summary?.dataQuality?.slices.hvSoh.status ?? null,
    },
    capacity: buildBatteryHvCapacityVm(summary),
    sessions: sessions.slice(0, 8),
    sliceQualities: {
      hvSoh: summary?.dataQuality?.slices.hvSoh.status ?? null,
      hvLegacyCapacity: summary?.dataQuality?.slices.hvLegacyCapacity.status ?? null,
    },
    snapshotCount: hv?.snapshotCount ?? 0,
  };
}
