import type { ModuleHealth } from '../../../rental-health/rental-health.types';
import type { CanonicalBatteryHealthService } from '../canonical-battery-health.service';
import {
  mergeBatteryReadinessHint,
  type BatteryReadinessEvaluation,
} from '../battery-readiness.policy';
import {
  isAlertableStatus,
  type BatteryHealthStatus,
  type LvAggregateStatus,
} from '../battery-status';
import type { CanonicalBatteryDto } from './canonical-battery.types';
import { InsightSeverity } from '@prisma/client';

export type CanonicalBatteryHealthSummary = NonNullable<
  Awaited<ReturnType<CanonicalBatteryHealthService['getSummary']>>
>;

export interface RentalBatteryEvaluationInput {
  summary: CanonicalBatteryHealthSummary | null;
  warningLightActive?: boolean;
  readiness?: BatteryReadinessEvaluation | null;
}

export interface HealthSummaryBatteryModule {
  status: 'good' | 'fair' | 'poor' | 'unknown';
  sohPercent: number | null;
  sohPercentSemantic: string | null;
  estimatedLvHealthScore: number | null;
  estimatedLvHealthScoreSemantic: string | null;
  voltageV: number | null;
  hasData: boolean;
  aggregateHealthStatus: LvAggregateStatus | null;
  hvHealthStatus: BatteryHealthStatus | null;
  hvSohPercent: number | null;
}

export interface BatteryAlertVehicleMeta {
  id: string;
  make: string;
  model: string;
  licensePlate: string | null;
  homeStationId: string | null;
}

export interface BatteryAlertCandidate {
  severity: InsightSeverity;
  priority: number;
  title: string;
  message: string;
  reason: string;
  observedAt: Date | null;
  metrics: Record<string, unknown>;
}

function toIso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function isStale(observedAt: string | null, staleMs = 48 * 60 * 60 * 1000): boolean {
  if (!observedAt) return true;
  return Date.now() - new Date(observedAt).getTime() > staleMs;
}

function maxSeverity(
  a: ModuleHealth['state'],
  b: ModuleHealth['state'],
): ModuleHealth['state'] {
  const rank: Record<ModuleHealth['state'], number> = {
    critical: 4,
    warning: 3,
    unknown: 2,
    good: 1,
    n_a: 0,
  };
  return rank[b] > rank[a] ? b : a;
}

function mapAggregateStatusToRentalState(
  status: LvAggregateStatus | null | undefined,
): ModuleHealth['state'] {
  switch (status) {
    case 'GOOD':
    case 'WATCH':
      return 'good';
    case 'WARNING':
      return 'warning';
    case 'CRITICAL':
      return 'critical';
    default:
      return 'unknown';
  }
}

function mapLegacyConditionToHealthSummaryStatus(
  condition: CanonicalBatteryHealthSummary['condition'] | undefined,
  healthStatus: LvAggregateStatus | null | undefined,
): HealthSummaryBatteryModule['status'] {
  if (healthStatus === 'CRITICAL' || healthStatus === 'WARNING') return 'poor';
  if (healthStatus === 'WATCH') return 'fair';
  if (healthStatus === 'GOOD') return 'good';
  switch (condition) {
    case 'good':
      return 'good';
    case 'watch':
      return 'fair';
    case 'attention':
      return 'poor';
    default:
      return 'unknown';
  }
}

/** Returns the canonical DTO when present; null when summary is missing or incomplete. */
export function requireCanonicalBattery(
  summary: CanonicalBatteryHealthSummary | null | undefined,
): CanonicalBatteryDto | null {
  return summary?.canonical ?? null;
}

/** Maps canonical battery summary into Rental Health `modules.battery`. */
export function mapRentalBatteryModule(
  input: RentalBatteryEvaluationInput,
): ModuleHealth {
  const { summary, warningLightActive = false, readiness = null } = input;
  if (!summary) {
    return {
      state: 'unknown',
      reason: readiness?.reason ?? 'Keine Batterie-Daten verfügbar',
      last_updated_at: null,
      data_stale: true,
      source: 'canonical_battery',
      evidence_type: 'unknown',
    };
  }

  const lv = summary.lv;
  const canonical = summary.canonical;
  const restingVoltage = lv?.restingVoltage?.valueV ?? null;
  const observedAt =
    canonical?.liveState.lv.observedAt ??
    lv?.freshness?.observedAt ??
    summary.currentState?.lastChecked ??
    summary.generatedAt ??
    null;

  const restingStatus = lv?.restingVoltage?.status ?? null;
  const restingIsGenuine =
    restingVoltage != null && lv?.restingVoltage?.measurementContext === 'RESTING';
  const legacyPublicationUnsafe =
    lv?.legacyPublicationSafety?.decisionCapable === false ||
    lv?.estimatedHealth?.decisionCapable === false;
  const restingNote = restingIsGenuine
    ? ` (Ruhespannung ${restingVoltage.toFixed(2)} V)`
    : '';
  const restingIsConcern = restingStatus === 'WARNING' || restingStatus === 'CRITICAL';

  let effectiveHealthStatus: LvAggregateStatus | null = lv?.healthStatus ?? null;
  if (
    legacyPublicationUnsafe &&
    !restingIsConcern &&
    (effectiveHealthStatus === 'WARNING' || effectiveHealthStatus === 'CRITICAL')
  ) {
    effectiveHealthStatus = 'UNKNOWN';
  }

  let state = mapAggregateStatusToRentalState(effectiveHealthStatus);
  let reason: string;

  switch (effectiveHealthStatus) {
    case 'GOOD':
      reason = `Batteriezustand gut${restingNote}`;
      break;
    case 'WATCH':
      state = 'good';
      reason = `Batteriezustand unauffällig${restingNote}`;
      break;
    case 'WARNING':
      reason = restingIsConcern
        ? `Batterie auffällig — Nachladen/Prüfen empfohlen${restingNote}`
        : 'Geschätzte Batteriegesundheit niedrig — Prüfen empfohlen';
      break;
    case 'CRITICAL':
      reason = restingIsConcern
        ? `Batterie kritisch${restingNote}`
        : 'Geschätzte Batteriegesundheit kritisch — Austausch prüfen';
      break;
    default:
      reason = 'Keine belastbare Batteriebewertung verfügbar';
  }

  if (warningLightActive) {
    state = maxSeverity(state, 'warning');
    reason = 'Batterie-Warnleuchte aktiv';
  }

  if (readiness) {
    if (readiness.effect === 'UNKNOWN' && !readiness.blocksRental) {
      state = 'unknown';
      reason = readiness.reason ?? reason;
    } else if (readiness.effect === 'HINT' || readiness.effect === 'DIAGNOSTIC') {
      reason = mergeBatteryReadinessHint(reason, readiness);
      if (readiness.effect === 'DIAGNOSTIC' && state === 'good') {
        state = 'warning';
      }
    } else if (readiness.blocksRental) {
      state = readiness.hardBlock ? 'critical' : maxSeverity(state, 'critical');
      reason = readiness.reason ?? reason;
    }
  }

  return {
    state,
    reason,
    last_updated_at: toIso(observedAt),
    data_stale: isStale(toIso(observedAt)),
    source: warningLightActive ? 'hm_oem' : 'canonical_battery',
    evidence_type: legacyPublicationUnsafe
      ? 'legacy_unverified'
      : lv?.estimatedHealth?.displayMode === 'BARS' && lv?.healthStatus
        ? 'estimated'
        : restingVoltage != null
          ? 'measured'
          : 'provider',
  };
}

/** Maps canonical summary into AI Health Care / health-summary battery module input. */
export function mapHealthSummaryBatteryModule(
  summary: CanonicalBatteryHealthSummary | null,
): HealthSummaryBatteryModule {
  if (!summary) {
    return {
      status: 'unknown',
      sohPercent: null,
      sohPercentSemantic: null,
      estimatedLvHealthScore: null,
      estimatedLvHealthScoreSemantic: null,
      voltageV: null,
      hasData: false,
      aggregateHealthStatus: null,
      hvHealthStatus: null,
      hvSohPercent: null,
    };
  }

  const canonical = summary.canonical;
  const lvHealthStatus = summary.lv?.healthStatus ?? null;
  const hasData = summary.lv?.status !== 'estimate_unavailable';

  return {
    status: mapLegacyConditionToHealthSummaryStatus(summary.condition, lvHealthStatus),
    sohPercent: summary.lv?.healthPercent ?? null,
    sohPercentSemantic: summary.lv?.healthPercentSemantic ?? null,
    estimatedLvHealthScore:
      summary.lv?.estimatedLvHealthScore?.value ??
      summary.lv?.estimatedHealth?.scorePct ??
      canonical?.lv.assessment?.estimatedHealthScore ??
      null,
    estimatedLvHealthScoreSemantic:
      summary.lv?.estimatedLvHealthScore?.semanticType ??
      summary.lv?.estimatedHealth?.semanticType ??
      null,
    voltageV:
      canonical?.liveState.lv.values.voltageV ??
      summary.lv?.telemetry?.voltageV ??
      null,
    hasData,
    aggregateHealthStatus: lvHealthStatus,
    hvHealthStatus: summary.hv?.healthStatus ?? null,
    hvSohPercent: summary.hv?.sohPct ?? null,
  };
}

export function mapHealthSummaryBatteryNarrative(battery: HealthSummaryBatteryModule): {
  positive: string | null;
  watchpoint: string | null;
  maintenancePriority: 'low' | 'medium' | 'high' | null;
  maintenanceReason: string | null;
} {
  if (!battery.hasData) {
    return {
      positive: null,
      watchpoint: null,
      maintenancePriority: null,
      maintenanceReason: null,
    };
  }

  const lvStatus = battery.aggregateHealthStatus;
  if (lvStatus === 'CRITICAL') {
    return {
      positive: null,
      watchpoint:
        'Geschätzter 12V-Batteriezustand kritisch — Startschwierigkeiten wahrscheinlich, Austausch empfohlen.',
      maintenancePriority: 'high',
      maintenanceReason: 'LV battery aggregate CRITICAL',
    };
  }
  if (lvStatus === 'WARNING') {
    return {
      positive: null,
      watchpoint:
        'Geschätzter 12V-Batteriezustand niedrig — Startschwierigkeiten möglich, beobachten.',
      maintenancePriority: 'medium',
      maintenanceReason: 'LV battery aggregate WARNING',
    };
  }
  if (lvStatus === 'GOOD' || lvStatus === 'WATCH') {
    return {
      positive: 'Geschätzter 12V-Batteriezustand im normalen Bereich.',
      watchpoint: null,
      maintenancePriority: null,
      maintenanceReason: null,
    };
  }

  const hvStatus = battery.hvHealthStatus;
  if (
    battery.hvSohPercent != null &&
    (hvStatus === 'WARNING' || hvStatus === 'CRITICAL')
  ) {
    return {
      positive: null,
      watchpoint: `HV-Batteriegesundheit niedrig (${Math.round(battery.hvSohPercent)} %) — Diagnose empfohlen.`,
      maintenancePriority: hvStatus === 'CRITICAL' ? 'high' : 'medium',
      maintenanceReason: 'HV SOH below canonical band',
    };
  }

  return {
    positive: null,
    watchpoint: null,
    maintenancePriority: null,
    maintenanceReason: null,
  };
}

/**
 * Resolves fleet/vehicle battery alerts from the canonical summary read model.
 * No consumer-side voltage bands, freshness windows, or legacy publication truth.
 */
export function resolveBatteryAlertCandidate(
  summary: CanonicalBatteryHealthSummary,
  vehicle: BatteryAlertVehicleMeta,
  now: Date,
): BatteryAlertCandidate | null {
  const label = vehicle.licensePlate || `${vehicle.make} ${vehicle.model}`;
  const restingStatus = summary.lv?.restingVoltage?.status ?? 'UNKNOWN';
  const restingVoltage = summary.lv?.restingVoltage?.valueV ?? null;
  const estHealthStatus = summary.lv?.estimatedHealth?.status ?? 'UNKNOWN';
  const crankStatus =
    summary.lv?.telemetry?.crank?.operationalStatus ??
  summary.lv?.telemetry?.crank?.diagnosticStatus ??
    'UNKNOWN';
  const crankBad = crankStatus === 'WARNING' || crankStatus === 'CRITICAL';

  let severity: InsightSeverity | null = null;
  let reason: string | null = null;
  let title = 'Batterie kritisch';
  let message = '';
  let priority = 60;

  if (restingStatus === 'CRITICAL' || (restingStatus === 'WARNING' && crankBad)) {
    const vtxt = restingVoltage != null ? restingVoltage.toFixed(2) : '?';
    severity = InsightSeverity.CRITICAL;
    reason = `Ruhespannung ${vtxt} V kritisch`;
    title = 'Batterie kritisch — Starthilfe empfohlen';
    message = `Ruhespannung bei ${vtxt} V — Batterie entladen, Starthilfe oder Austausch empfohlen. Startschwierigkeiten wahrscheinlich.`;
    priority = 85;
  } else if (estHealthStatus === 'CRITICAL') {
    severity = InsightSeverity.CRITICAL;
    reason = 'Geschätzte Batteriegesundheit kritisch';
    title = 'Batterie kritisch — Gesundheit niedrig';
    message =
      'Geschätzte 12V-Batteriegesundheit kritisch — Austausch empfohlen. Startschwierigkeiten wahrscheinlich.';
    priority = 80;
  } else if (restingStatus === 'WARNING' && isAlertableStatus(restingStatus)) {
    const vtxt = restingVoltage != null ? restingVoltage.toFixed(2) : '?';
    severity = InsightSeverity.WARNING;
    reason = `Ruhespannung ${vtxt} V niedrig`;
    title = 'Batterie kritisch beobachten';
    message = `Ruhespannung bei ${vtxt} V — Startschwierigkeiten möglich. Ladezustand und Lichtmaschine prüfen.`;
    priority = 65;
  } else if (estHealthStatus === 'WARNING' || crankStatus === 'CRITICAL') {
    severity = InsightSeverity.WARNING;
    reason =
      crankStatus === 'CRITICAL'
        ? 'Schlechtes Startverhalten (Crank Drop)'
        : 'Geschätzte Batteriegesundheit niedrig';
    title = 'Batterie kritisch beobachten';
    message =
      crankStatus === 'CRITICAL'
        ? 'Hoher Spannungseinbruch beim Start — Batterie beobachten, Startschwierigkeiten möglich.'
        : 'Geschätzte 12V-Batteriegesundheit niedrig — Batterie beobachten, Startschwierigkeiten möglich.';
    priority = 60;
  }

  const hvStatus = summary.hv?.healthStatus ?? null;
  const hvSoh = summary.hv?.sohPct ?? null;
  if (!severity && summary.support?.hv && hvSoh != null && isAlertableStatus(hvStatus)) {
    severity =
      hvStatus === 'CRITICAL'
        ? InsightSeverity.CRITICAL
        : InsightSeverity.WARNING;
    reason = `HV-SOH ${Math.round(hvSoh)} %`;
    title =
      hvStatus === 'CRITICAL'
        ? 'Traktionsbatterie kritisch'
        : 'Traktionsbatterie beobachten';
    message = `HV-Batteriegesundheit bei ${Math.round(hvSoh)} % — Diagnose der Traktionsbatterie empfohlen.`;
    priority = hvStatus === 'CRITICAL' ? 82 : 62;
  }

  if (!severity) return null;

  const observedAtRaw =
    summary.lv?.restingVoltage?.dataQuality?.observedAt ??
    summary.lv?.freshness?.observedAt ??
    summary.hv?.freshness?.observedAt ??
    summary.currentState?.lastChecked ??
    null;
  const observedAt = observedAtRaw ? new Date(observedAtRaw) : null;

  return {
    severity,
    priority,
    title,
    message: `${label}: ${message}`,
    reason: reason!,
    observedAt,
    metrics: {
      restingVoltageV: restingVoltage ?? 'unknown',
      restingStatus,
      estimatedHealthStatus: estHealthStatus,
      crankDropStatus: crankStatus,
      aggregateHealthStatus: summary.lv?.healthStatus ?? null,
      hvHealthStatus: hvStatus,
      hvSohPercent: hvSoh,
      resolvedAt: summary.canonical?.resolvedAt ?? summary.generatedAt,
      now: now.toISOString(),
    },
  };
}
