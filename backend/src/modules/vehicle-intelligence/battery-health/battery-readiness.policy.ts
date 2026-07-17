import { isBatteryV2ReadinessEnabled } from '@config/battery-health-v2.config';
import type { CanonicalBatteryHealthService } from './canonical-battery-health.service';
import {
  getEvidenceCapabilities,
  resolveLvMeasurementEvidenceTier,
} from './battery-evidence-strength.policy';
import {
  BatteryDiagnosticEvidenceKind,
  BatteryEvidenceStrengthTier,
  BatteryMeasurementQuality,
  BatteryMeasurementType,
} from './battery-v2-domain';
import type { LvAggregateStatus } from './battery-status';
import {
  isSafetyCriticalDtcBand,
  normalizeDtcSeverityBand,
  type DtcSeverityBand,
} from '../dtc/dtc-severity.util';

type CanonicalBatteryHealthSummary = NonNullable<
  Awaited<ReturnType<CanonicalBatteryHealthService['getSummary']>>
>;

/** Documented battery readiness contract — bump when gate rules change. */
export const BATTERY_READINESS_POLICY_VERSION = '1.0.0';

/** Provider SOH alone may affect readiness only below this threshold (%). */
export const BATTERY_READINESS_PROVIDER_SOH_BLOCK_THRESHOLD_PCT = 70;

const BATTERY_DTC_CODE_PATTERN =
  /^(P0A|P0B|P1A|B1[0-9A-F]{2}|U0[0-9A-F]{3}).*$/i;

const BATTERY_DTC_TEXT_PATTERN =
  /battery|batterie|traction|hv.?batt|12v|starter|start.?batt|high.?voltage.?batt/i;

export const BATTERY_READINESS_EFFECTS = {
  READY: 'READY',
  HINT: 'HINT',
  DIAGNOSTIC: 'DIAGNOSTIC',
  UNKNOWN: 'UNKNOWN',
  NOT_READY: 'NOT_READY',
  HARD_BLOCK: 'HARD_BLOCK',
} as const;

export type BatteryReadinessEffect =
  (typeof BATTERY_READINESS_EFFECTS)[keyof typeof BATTERY_READINESS_EFFECTS];

export interface BatteryReadinessInput {
  hasSummary: boolean;
  lvAggregateStatus?: LvAggregateStatus | string | null;
  restingVoltageStatus?: string | null;
  restingMeasurementQuality?: string | null;
  publicationMaturity?: string | null;
  decisionCapable?: boolean;
  legacyPublicationUnsafe?: boolean;
  evidenceTier?: BatteryEvidenceStrengthTier;
  truthSource?: string | null;
  assessmentTrack?: string | null;
  liveVoltageUnusual?: boolean;
  liveTelemetryOnly?: boolean;
  startProxyConspicuous?: boolean;
  restShadowSignal?: boolean;
  hvCapacityShadowSignal?: boolean;
  confirmedWorkshopDefect?: boolean;
  workshopDefectLabel?: string | null;
  batteryWarningLightActive?: boolean;
  batterySafetyDtcActive?: boolean;
  providerSohPercent?: number | null;
  providerSohFresh?: boolean;
  providerSohConfidence?: string | null;
  providerSohOnlySignal?: boolean;
}

export interface BatteryReadinessEvaluation {
  policyVersion: string;
  effect: BatteryReadinessEffect;
  blocksRental: boolean;
  hardBlock: boolean;
  manualReviewRequired: boolean;
  reason: string | null;
  evidenceTier: BatteryEvidenceStrengthTier;
  readinessEnabled: boolean;
}

function normalizeConfidence(value: string | null | undefined): 'high' | 'medium' | 'low' | 'none' {
  const raw = (value ?? '').trim().toLowerCase();
  if (raw === 'high') return 'high';
  if (raw === 'medium') return 'medium';
  if (raw === 'low') return 'low';
  return 'none';
}

function isStableQualifiedCriticalLv(input: BatteryReadinessInput): boolean {
  if (!input.decisionCapable || input.legacyPublicationUnsafe) return false;
  if (input.publicationMaturity !== 'STABLE') return false;
  if (input.restingMeasurementQuality !== BatteryMeasurementQuality.VALID) return false;

  const tier = input.evidenceTier ?? BatteryEvidenceStrengthTier.UNKNOWN;
  if (!getEvidenceCapabilities(tier).canAffectReadiness) return false;

  const restingCritical = input.restingVoltageStatus === 'CRITICAL';
  const aggregateCritical = input.lvAggregateStatus === 'CRITICAL';
  const restingWarning = input.restingVoltageStatus === 'WARNING';
  const aggregateWarning = input.lvAggregateStatus === 'WARNING';

  return restingCritical || aggregateCritical || restingWarning || aggregateWarning;
}

function providerSohBlocksReadiness(input: BatteryReadinessInput): boolean {
  if (!input.providerSohOnlySignal) return false;
  if (!input.providerSohFresh) return false;
  if (input.providerSohPercent == null) return false;

  const confidence = normalizeConfidence(input.providerSohConfidence);
  if (confidence !== 'high' && confidence !== 'medium') return false;

  return input.providerSohPercent < BATTERY_READINESS_PROVIDER_SOH_BLOCK_THRESHOLD_PCT;
}

export function isBatterySafetyDtcFault(input: {
  code?: string | null;
  description?: string | null;
  severity?: string | null;
}): boolean {
  const code = (input.code ?? '').trim();
  const description = input.description ?? '';
  const band = normalizeDtcSeverityBand(input.severity);
  if (!isSafetyCriticalDtcBand(band)) return false;

  if (code && BATTERY_DTC_CODE_PATTERN.test(code)) return true;
  return BATTERY_DTC_TEXT_PATTERN.test(description);
}

export function hasActiveBatterySafetyDtc(
  activeFaults: Array<{
    code?: string | null;
    description?: string | null;
    severity?: string | null;
  }> | null | undefined,
): boolean {
  if (!Array.isArray(activeFaults) || activeFaults.length === 0) return false;
  return activeFaults.some((fault) => isBatterySafetyDtcFault(fault));
}

export function buildBatteryReadinessInputFromSummary(input: {
  summary: CanonicalBatteryHealthSummary | null;
  warningLightActive?: boolean;
  batterySafetyDtcActive?: boolean;
}): BatteryReadinessInput {
  const summary = input.summary;
  if (!summary) {
    return {
      hasSummary: false,
      batteryWarningLightActive: input.warningLightActive ?? false,
      batterySafetyDtcActive: input.batterySafetyDtcActive ?? false,
    };
  }

  const lv = summary.lv;
  const canonical = summary.canonical;
  const canonicalLvSection = canonical?.lv;
  const canonicalLv = canonicalLvSection?.canonical;
  const canonicalHv = canonical?.hv ?? null;
  const restingQuality =
    canonicalLvSection?.latestQualifiedRest?.quality ??
    lv?.restingVoltage?.dataQuality?.status ??
    null;
  const truthSource = canonicalLv?.primaryTruth?.source ?? null;
  const assessmentTrack = canonicalLvSection?.assessment?.assessmentTrack ?? null;
  const publicationMaturity =
    canonicalLvSection?.publication?.maturity ??
    lv?.publicationState ??
    null;

  const restingStatus = lv?.restingVoltage?.status ?? null;
  const restingContext = lv?.restingVoltage?.measurementContext ?? null;
  const liveVoltage = canonical?.liveState.lv.values.voltageV ?? lv?.telemetry?.voltageV ?? null;
  const restingVoltage = lv?.restingVoltage?.valueV ?? null;
  const liveTelemetryOnly =
    restingVoltage == null &&
    liveVoltage != null &&
    (truthSource === 'LIVE_TELEMETRY' || lv?.telemetry?.voltageSource === 'live_telemetry');

  const liveVoltageUnusual =
    liveTelemetryOnly &&
    liveVoltage != null &&
    (liveVoltage > 15.5 || liveVoltage < 11.0);

  const startProxy = lv?.telemetry?.startProxy as
    | { measurements?: Array<{ quality?: string; numericValue?: number | null }> }
    | null
    | undefined;
  const startProxyConspicuous =
    Array.isArray(startProxy?.measurements) &&
    startProxy!.measurements.some(
      (row) =>
        row.quality === BatteryMeasurementQuality.VALID_PROXY &&
        row.numericValue != null &&
        row.numericValue <= 9.0,
    );

  const restShadowSignal =
    truthSource === 'V2_SHADOW_DIAGNOSTIC' ||
    canonicalLvSection?.assessment?.assessmentMode === 'SHADOW' ||
    restingQuality === BatteryMeasurementQuality.SHADOW;

  const hvCapacityShadowSignal =
    canonicalHv?.capacityAssessment?.shadowGatePassed === true &&
    canonicalHv.providerSoh.percent == null &&
    summary.hv?.sohPct == null;

  const workshopOverrideCritical =
    assessmentTrack === 'WORKSHOP_OVERRIDE' &&
    (lv?.healthStatus === 'CRITICAL' || restingStatus === 'CRITICAL');

  const evidenceTier = resolveLvMeasurementEvidenceTier({
    type:
      assessmentTrack === 'WORKSHOP_OVERRIDE'
        ? BatteryMeasurementType.WORKSHOP_OCV
        : restingQuality === BatteryMeasurementQuality.VALID
          ? BatteryMeasurementType.REST_60M
          : BatteryMeasurementType.LIVE_VOLTAGE,
    quality:
      (restingQuality as BatteryMeasurementQuality | undefined) ??
      BatteryMeasurementQuality.NO_DATA,
    bmsVerified: assessmentTrack === 'WORKSHOP_OVERRIDE',
  });

  const providerSohPercent =
    canonicalHv?.providerSoh.percent ?? summary.hv?.sohPct ?? null;
  const providerSohOnlySignal =
    summary.hv?.sohSource === 'PROVIDER' &&
    !workshopOverrideCritical &&
    !restShadowSignal &&
    !hvCapacityShadowSignal;

  return {
    hasSummary: true,
    lvAggregateStatus: lv?.healthStatus ?? null,
    restingVoltageStatus: restingStatus,
    restingMeasurementQuality: restingQuality,
    publicationMaturity,
    decisionCapable:
      lv?.legacyPublicationSafety?.decisionCapable ??
      lv?.estimatedHealth?.decisionCapable ??
      false,
    legacyPublicationUnsafe:
      lv?.legacyPublicationSafety?.decisionCapable === false ||
      lv?.estimatedHealth?.decisionCapable === false,
    evidenceTier,
    truthSource,
    assessmentTrack,
    liveVoltageUnusual,
    liveTelemetryOnly,
    startProxyConspicuous,
    restShadowSignal,
    hvCapacityShadowSignal,
    confirmedWorkshopDefect: workshopOverrideCritical,
    workshopDefectLabel: workshopOverrideCritical ? 'Werkstattbefund bestätigt' : null,
    batteryWarningLightActive: input.warningLightActive ?? false,
    batterySafetyDtcActive: input.batterySafetyDtcActive ?? false,
    providerSohPercent,
    providerSohFresh: canonicalHv?.providerSoh.decisionFresh ?? false,
    providerSohConfidence:
      summary.hv?.confidence ?? canonicalHv?.sohAssessment?.confidence ?? null,
    providerSohOnlySignal,
  };
}

/**
 * Binding battery readiness policy. Proxy/shadow/live-only paths never hard-block.
 * Uses central evidence tiers from BatteryEvidenceStrengthPolicy.
 */
export function evaluateBatteryReadiness(
  input: BatteryReadinessInput,
  options?: { readinessEnabled?: boolean },
): BatteryReadinessEvaluation {
  const readinessEnabled = options?.readinessEnabled ?? isBatteryV2ReadinessEnabled();
  const tier = input.evidenceTier ?? BatteryEvidenceStrengthTier.UNKNOWN;

  const base: BatteryReadinessEvaluation = {
    policyVersion: BATTERY_READINESS_POLICY_VERSION,
    effect: BATTERY_READINESS_EFFECTS.READY,
    blocksRental: false,
    hardBlock: false,
    manualReviewRequired: false,
    reason: null,
    evidenceTier: tier,
    readinessEnabled,
  };

  if (!readinessEnabled) {
    return base;
  }

  if (!input.hasSummary) {
    return {
      ...base,
      effect: BATTERY_READINESS_EFFECTS.UNKNOWN,
      reason: 'Keine Batterie-Daten verfügbar',
      evidenceTier: BatteryEvidenceStrengthTier.UNKNOWN,
    };
  }

  if (input.confirmedWorkshopDefect) {
    return {
      ...base,
      effect: BATTERY_READINESS_EFFECTS.HARD_BLOCK,
      blocksRental: true,
      hardBlock: true,
      reason: `Batterie: ${input.workshopDefectLabel ?? 'Werkstattdefekt bestätigt'}`,
      evidenceTier: BatteryEvidenceStrengthTier.WORKSHOP_OR_BMS_VERIFIED,
    };
  }

  if (input.batteryWarningLightActive) {
    return {
      ...base,
      effect: BATTERY_READINESS_EFFECTS.NOT_READY,
      blocksRental: true,
      manualReviewRequired: true,
      reason: 'Batterie: Warnleuchte aktiv — manuelle Prüfung erforderlich',
      evidenceTier: BatteryEvidenceStrengthTier.UNKNOWN,
    };
  }

  if (input.batterySafetyDtcActive) {
    return {
      ...base,
      effect: BATTERY_READINESS_EFFECTS.NOT_READY,
      blocksRental: true,
      manualReviewRequired: true,
      reason: 'Batterie: sicherheitsrelevanter Fehlercode — manuelle Prüfung erforderlich',
      evidenceTier: BatteryEvidenceStrengthTier.UNKNOWN,
    };
  }

  if (isStableQualifiedCriticalLv(input)) {
    const restingConcern = input.restingVoltageStatus === 'CRITICAL';
    return {
      ...base,
      effect: BATTERY_READINESS_EFFECTS.NOT_READY,
      blocksRental: true,
      manualReviewRequired: true,
      reason: restingConcern
        ? 'Batterie: qualifizierte Ruhespannung kritisch — manuelle Prüfung erforderlich'
        : 'Batterie: stabile qualifizierte Evidenz kritisch — manuelle Prüfung erforderlich',
      evidenceTier: tier,
    };
  }

  if (providerSohBlocksReadiness(input)) {
    return {
      ...base,
      effect: BATTERY_READINESS_EFFECTS.NOT_READY,
      blocksRental: true,
      manualReviewRequired: true,
      reason: `Batterie: Provider-SOH unter ${BATTERY_READINESS_PROVIDER_SOH_BLOCK_THRESHOLD_PCT} % — manuelle Prüfung erforderlich`,
      evidenceTier: BatteryEvidenceStrengthTier.PROVIDER_OEM_SOH,
    };
  }

  if (input.startProxyConspicuous) {
    return {
      ...base,
      effect: BATTERY_READINESS_EFFECTS.DIAGNOSTIC,
      reason: 'Start-Proxy auffällig — nur Diagnose, kein Vermietungsblock',
      evidenceTier: BatteryEvidenceStrengthTier.PROXY,
    };
  }

  if (input.liveVoltageUnusual) {
    return {
      ...base,
      effect: BATTERY_READINESS_EFFECTS.HINT,
      reason: 'Ungewöhnlicher Live-Spannungswert — Hinweis, kein Block',
      evidenceTier: BatteryEvidenceStrengthTier.LIVE_TELEMETRY,
    };
  }

  if (input.restShadowSignal || input.hvCapacityShadowSignal) {
    return {
      ...base,
      effect: BATTERY_READINESS_EFFECTS.READY,
      reason: null,
      evidenceTier: input.restShadowSignal
        ? BatteryEvidenceStrengthTier.ESTIMATED
        : BatteryEvidenceStrengthTier.ESTIMATED,
    };
  }

  if (
    input.lvAggregateStatus === 'UNKNOWN' ||
    (!input.decisionCapable && !input.liveTelemetryOnly)
  ) {
    return {
      ...base,
      effect: BATTERY_READINESS_EFFECTS.UNKNOWN,
      reason: 'Keine belastbare Batteriebewertung verfügbar',
      evidenceTier: BatteryEvidenceStrengthTier.UNKNOWN,
    };
  }

  return base;
}

export function isBatteryBlockWorthy(
  evaluation: BatteryReadinessEvaluation,
): boolean {
  return evaluation.readinessEnabled && evaluation.blocksRental;
}

export function mergeBatteryReadinessHint(
  moduleReason: string,
  readiness: BatteryReadinessEvaluation,
): string {
  if (!readiness.reason) return moduleReason;
  if (readiness.effect === BATTERY_READINESS_EFFECTS.HINT) {
    return `${moduleReason} — ${readiness.reason}`;
  }
  if (readiness.effect === BATTERY_READINESS_EFFECTS.DIAGNOSTIC) {
    return `${moduleReason} — ${readiness.reason}`;
  }
  if (readiness.effect === BATTERY_READINESS_EFFECTS.UNKNOWN && readiness.blocksRental === false) {
    return readiness.reason;
  }
  return moduleReason;
}
