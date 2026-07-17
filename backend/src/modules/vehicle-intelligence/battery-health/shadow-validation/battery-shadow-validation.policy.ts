import {
  isBatteryV2HvCapacityShadowEnabled,
  isBatteryV2HvFallbackChargeSessionEnabled,
  isBatteryV2HvRechargeSessionEnabled,
  isBatteryV2HvSohPublicationEnabled,
  isBatteryV2PublicationEnabled,
  isBatteryV2ReadinessEnabled,
  isBatteryV2RestShadowEnabled,
  isBatteryV2StartProxyEnabled,
} from '@config/battery-health-v2.config';
import type {
  BatteryShadowValidationFlagsSnapshot,
  BatteryShadowValidationGateResult,
  BatteryShadowValidationGateStatus,
  BatteryShadowValidationHvMetrics,
  BatteryShadowValidationLvMetrics,
  BatteryShadowValidationObservationPeriod,
  BatteryShadowValidationRecommendation,
  BatteryShadowValidationReport,
} from './battery-shadow-validation.types';

export const SHADOW_OBSERVATION_MIN_DAYS = 28;
export const SHADOW_OBSERVATION_MAX_RECOMMENDED_DAYS = 56;

export const SHADOW_GATE_WAKE_CONTAMINATION_MAX_PCT = 35;
export const SHADOW_GATE_M2_SESSION_CV_P95_MAX_PCT = 2;
export const SHADOW_GATE_M3_CONFLICT_MAX_PCT = 25;
export const SHADOW_GATE_LV_FALSE_POSITIVE_WARN_COUNT = 5;

export function resolveObservationPeriod(input: {
  referenceNow: Date;
  observationStartAt?: Date;
  observationDays?: number;
}): BatteryShadowValidationObservationPeriod {
  const endAt = input.referenceNow;
  const durationDays = Math.max(
    1,
    input.observationDays ?? SHADOW_OBSERVATION_MIN_DAYS,
  );
  const startAt =
    input.observationStartAt ??
    new Date(endAt.getTime() - durationDays * 24 * 60 * 60 * 1000);
  const actualDurationDays = Math.max(
    1,
    Math.round((endAt.getTime() - startAt.getTime()) / (24 * 60 * 60 * 1000)),
  );

  return {
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    durationDays: actualDurationDays,
    minimumRecommendedDays: SHADOW_OBSERVATION_MIN_DAYS,
    maximumRecommendedDays: SHADOW_OBSERVATION_MAX_RECOMMENDED_DAYS,
    meetsMinimumPeriod: actualDurationDays >= SHADOW_OBSERVATION_MIN_DAYS,
    withinRecommendedWindow:
      actualDurationDays >= SHADOW_OBSERVATION_MIN_DAYS &&
      actualDurationDays <= SHADOW_OBSERVATION_MAX_RECOMMENDED_DAYS,
  };
}

export function snapshotShadowValidationFlags(): BatteryShadowValidationFlagsSnapshot {
  return {
    restShadowEnabled: isBatteryV2RestShadowEnabled(),
    startProxyEnabled: isBatteryV2StartProxyEnabled(),
    hvRechargeSessionEnabled: isBatteryV2HvRechargeSessionEnabled(),
    hvFallbackChargeSessionEnabled: isBatteryV2HvFallbackChargeSessionEnabled(),
    hvCapacityShadowEnabled: isBatteryV2HvCapacityShadowEnabled(),
    publicationEnabled: isBatteryV2PublicationEnabled(),
    hvSohPublicationEnabled: isBatteryV2HvSohPublicationEnabled(),
    readinessEnabled: isBatteryV2ReadinessEnabled(),
  };
}

function gate(
  id: string,
  domain: BatteryShadowValidationGateResult['domain'],
  label: string,
  status: BatteryShadowValidationGateStatus,
  threshold: string,
  observed: string,
  detail?: string,
): BatteryShadowValidationGateResult {
  return { id, domain, label, status, threshold, observed, detail };
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function evaluateShadowValidationGates(input: {
  observationPeriod: BatteryShadowValidationObservationPeriod;
  flags: BatteryShadowValidationFlagsSnapshot;
  lv: BatteryShadowValidationLvMetrics;
  hv: BatteryShadowValidationHvMetrics;
}): BatteryShadowValidationGateResult[] {
  const { observationPeriod, flags, lv, hv } = input;
  const gates: BatteryShadowValidationGateResult[] = [];

  gates.push(
    gate(
      'observation_minimum_period',
      'observation',
      'Beobachtungszeitraum mindestens 4 Wochen',
      observationPeriod.meetsMinimumPeriod ? 'pass' : 'insufficient_data',
      `≥ ${SHADOW_OBSERVATION_MIN_DAYS} Tage`,
      `${observationPeriod.durationDays} Tage`,
      observationPeriod.withinRecommendedWindow
        ? 'Im empfohlenen 4–8-Wochen-Fenster'
        : observationPeriod.durationDays > SHADOW_OBSERVATION_MAX_RECOMMENDED_DAYS
          ? 'Länger als 8 Wochen — weiter beobachten oder manuell auswerten'
          : undefined,
    ),
  );

  gates.push(
    gate(
      'safety_publication_disabled',
      'safety',
      'Kundenpublication deaktiviert',
      !flags.publicationEnabled && !flags.hvSohPublicationEnabled ? 'pass' : 'fail',
      'publication + hvSohPublication = false',
      `publication=${flags.publicationEnabled}, hvSoh=${flags.hvSohPublicationEnabled}`,
      'Automatische Kundenpublication darf während Shadow nicht aktiv sein.',
    ),
  );

  gates.push(
    gate(
      'safety_readiness_disabled',
      'safety',
      'Readiness-Policy deaktiviert',
      !flags.readinessEnabled ? 'pass' : 'fail',
      'readiness = false',
      String(flags.readinessEnabled),
    ),
  );

  gates.push(
    gate(
      'safety_no_battery_rental_blockers',
      'safety',
      'Keine neuen Battery-Rental-Blocker im Zeitraum',
      lv.rentalBlockedFromBatteryInPeriod === 0 ? 'pass' : 'fail',
      '0 neue Blocker',
      String(lv.rentalBlockedFromBatteryInPeriod),
    ),
  );

  if (flags.restShadowEnabled) {
    const restScheduled = lv.rest60m.scheduled + lv.rest6h.scheduled;
    gates.push(
      gate(
        'lv_rest_capture_present',
        'lv',
        'REST 60m/6h Capture vorhanden',
        restScheduled > 0 ? 'pass' : 'insufficient_data',
        '> 0 geplante REST-Targets',
        `${restScheduled} geplant, ${lv.rest60m.captured + lv.rest6h.captured} erfasst`,
      ),
    );

    const contaminationRate = lv.wakeContaminationRatePct;
    gates.push(
      gate(
        'lv_wake_contamination',
        'lv',
        'Wake-Kontamination',
        contaminationRate == null
          ? 'insufficient_data'
          : contaminationRate <= SHADOW_GATE_WAKE_CONTAMINATION_MAX_PCT
            ? 'pass'
            : 'warn',
        `≤ ${SHADOW_GATE_WAKE_CONTAMINATION_MAX_PCT} %`,
        contaminationRate == null ? 'keine Daten' : `${contaminationRate} %`,
      ),
    );

    gates.push(
      gate(
        'lv_missed_documented',
        'lv',
        'MISSED-Rate dokumentiert',
        lv.missedTotal > 0 || restScheduled > 0 ? 'pass' : 'insufficient_data',
        'MISSED gezählt oder keine Targets',
        `${lv.missedTotal} MISSED von ${restScheduled}`,
      ),
    );
  } else {
    gates.push(
      gate(
        'lv_rest_shadow_flag',
        'lv',
        'LV REST Shadow',
        'not_applicable',
        'Flag aus',
        'BATTERY_V2_REST_SHADOW_ENABLED=false',
      ),
    );
  }

  if (flags.startProxyEnabled) {
    gates.push(
      gate(
        'lv_start_proxy_coverage',
        'lv',
        'Start-Proxy-Messungen',
        lv.startProxyMeasurements > 0 ? 'pass' : 'insufficient_data',
        '> 0 Messungen',
        `${lv.startProxyMeasurements} Messungen / ${lv.startProxySessions} Sessions`,
        lv.startProxyInsufficientCoverage > 0
          ? `${lv.startProxyInsufficientCoverage} Sessions mit INSUFFICIENT_COVERAGE`
          : undefined,
      ),
    );
  }

  gates.push(
    gate(
      'lv_false_positive_watch',
      'lv',
      'Shadow-Assessment False-Positive-Kandidaten',
      lv.falsePositiveCandidates <= SHADOW_GATE_LV_FALSE_POSITIVE_WARN_COUNT
        ? 'pass'
        : 'warn',
      `≤ ${SHADOW_GATE_LV_FALSE_POSITIVE_WARN_COUNT} kritische Shadow-Scores`,
      String(lv.falsePositiveCandidates),
      'SHADOW LV-Assessments mit WARNING/CRITICAL-Score ohne operative Freigabe.',
    ),
  );

  if (flags.hvRechargeSessionEnabled) {
    gates.push(
      gate(
        'hv_recharge_sessions',
        'hv',
        'Recharge-Session-Abdeckung',
        hv.rechargeSessionCount > 0 ? 'pass' : 'insufficient_data',
        '> 0 Sessions',
        `${hv.rechargeSessionCount} Sessions / ${hv.vehiclesWithRechargeSessions} Fahrzeuge`,
      ),
    );
  }

  if (flags.hvCapacityShadowEnabled) {
    gates.push(
      gate(
        'hv_m2_samples',
        'hv',
        'M2-Stichproben',
        hv.m2ObservationCount >= 3 ? 'pass' : 'insufficient_data',
        '≥ 3 M2-Observations',
        String(hv.m2ObservationCount),
      ),
    );

    gates.push(
      gate(
        'hv_m2_session_cv',
        'hv',
        'M2 Session CV (p95)',
        hv.m2SessionCvP95 == null
          ? 'insufficient_data'
          : hv.m2SessionCvP95 <= SHADOW_GATE_M2_SESSION_CV_P95_MAX_PCT
            ? 'pass'
            : 'warn',
        `p95 ≤ ${SHADOW_GATE_M2_SESSION_CV_P95_MAX_PCT} %`,
        hv.m2SessionCvP95 == null ? 'keine Daten' : `${hv.m2SessionCvP95} %`,
      ),
    );

    const m3Rate = hv.m3AgreementRatePct;
    gates.push(
      gate(
        'hv_m3_agreement',
        'hv',
        'M2/M3-Übereinstimmung',
        m3Rate == null
          ? 'insufficient_data'
          : m3Rate >= 100 - SHADOW_GATE_M3_CONFLICT_MAX_PCT
            ? 'pass'
            : 'warn',
        `Konfliktrate ≤ ${SHADOW_GATE_M3_CONFLICT_MAX_PCT} %`,
        m3Rate == null ? 'keine Daten' : `${m3Rate} % Übereinstimmung`,
      ),
    );
  }

  gates.push(
    gate(
      'hv_reference_capacity',
      'hv',
      'Referenzkapazität erfasst',
      hv.referenceCapacityActiveCount > 0 ? 'pass' : 'insufficient_data',
      '≥ 1 aktive Referenz',
      `${hv.referenceCapacityActiveCount} aktiv, ${hv.referenceCapacityUnverifiedCount} unverifiziert`,
    ),
  );

  gates.push(
    gate(
      'hv_storage_growth_observed',
      'hv',
      'Speicherwachstum dokumentiert',
      'pass',
      'Zählwerte im Report',
      `${hv.storageGrowth.batteryMeasurements} measurements, ${hv.storageGrowth.hvChargeSessions} sessions`,
      'Informativ — keine automatische Löschung aus diesem Report.',
    ),
  );

  return gates;
}

export function summarizeGateResults(
  gates: BatteryShadowValidationGateResult[],
): BatteryShadowValidationReport['summary'] {
  return {
    gatesPassed: gates.filter((g) => g.status === 'pass').length,
    gatesWarned: gates.filter((g) => g.status === 'warn').length,
    gatesFailed: gates.filter((g) => g.status === 'fail').length,
    gatesInsufficientData: gates.filter((g) => g.status === 'insufficient_data').length,
  };
}

export function resolveOverallRecommendation(input: {
  observationPeriod: BatteryShadowValidationObservationPeriod;
  gates: BatteryShadowValidationGateResult[];
}): BatteryShadowValidationRecommendation {
  const { observationPeriod, gates } = input;

  if (gates.some((g) => g.status === 'fail')) {
    return 'review_required';
  }

  if (!observationPeriod.meetsMinimumPeriod) {
    return 'insufficient_data';
  }

  const actionable = gates.filter((g) => g.status !== 'not_applicable');
  const insufficient = actionable.filter((g) => g.status === 'insufficient_data').length;
  const warned = actionable.filter((g) => g.status === 'warn').length;

  if (insufficient > actionable.length / 2) {
    return 'insufficient_data';
  }

  if (warned > 0) {
    return 'review_required';
  }

  const allPass = actionable.every((g) => g.status === 'pass');
  if (allPass && observationPeriod.meetsMinimumPeriod) {
    return 'gates_ready_for_manual_review';
  }

  return 'continue_shadow';
}
