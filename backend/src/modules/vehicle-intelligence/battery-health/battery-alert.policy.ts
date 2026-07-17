import { InsightSeverity } from '@prisma/client';
import {
  buildObservationFreshness,
  observationFreshnessIsDecisionFresh,
} from './battery-freshness.policy';
import {
  getEvidenceCapabilities,
  resolveLvMeasurementEvidenceTier,
} from './battery-evidence-strength.policy';
import {
  buildBatteryReadinessInputFromSummary,
  hasActiveBatterySafetyDtc,
  isBatterySafetyDtcFault,
} from './battery-readiness.policy';
import type { CanonicalBatteryHealthService } from './canonical-battery-health.service';
import {
  BatteryEvidenceStrengthTier,
  BatteryMeasurementQuality,
  BatteryMeasurementType,
} from './battery-v2-domain';
import { isAlertableStatus } from './battery-status';

/** Documented battery alert contract — bump when rule/dedup semantics change. */
export const BATTERY_ALERT_POLICY_VERSION = '1.0.0';

export const BATTERY_ALERT_RULE_IDS = {
  WARNING_LIGHT: 'battery.alert.warning_light',
  SAFETY_DTC: 'battery.alert.safety_dtc',
  LV_PUBLICATION_STABLE: 'battery.alert.lv_publication_stable',
  WORKSHOP_FINDING: 'battery.alert.workshop_finding',
  MANUAL_MEASUREMENT: 'battery.alert.manual_measurement',
} as const;

export type BatteryAlertRuleId =
  (typeof BATTERY_ALERT_RULE_IDS)[keyof typeof BATTERY_ALERT_RULE_IDS];

export const BATTERY_ALERT_AUTO_RESOLVE = {
  [BATTERY_ALERT_RULE_IDS.WARNING_LIGHT]:
    'WARNING_LIGHT_CLEARED | FALSE_POSITIVE',
  [BATTERY_ALERT_RULE_IDS.SAFETY_DTC]: 'DTC_CLEARED | FALSE_POSITIVE',
  [BATTERY_ALERT_RULE_IDS.LV_PUBLICATION_STABLE]:
    'PUBLICATION_GOOD | BATTERY_MEASURED_OK | BATTERY_REPLACED | FALSE_POSITIVE',
  [BATTERY_ALERT_RULE_IDS.WORKSHOP_FINDING]:
    'WORKSHOP_RESOLVED | BATTERY_REPLACED | FALSE_POSITIVE',
  [BATTERY_ALERT_RULE_IDS.MANUAL_MEASUREMENT]:
    'BATTERY_MEASURED_OK | BATTERY_REPLACED | FALSE_POSITIVE',
} as const;

export interface BatteryAlertFreshness {
  observedAt: string | null;
  observationState: string;
  decisionFresh: boolean;
  ageMs: number | null;
}

export interface BatteryAlertContract {
  policyVersion: string;
  ruleId: BatteryAlertRuleId;
  vehicleId: string;
  cause: string;
  evidenceTier: BatteryEvidenceStrengthTier;
  freshness: BatteryAlertFreshness;
  dedupeKey: string;
  severity: InsightSeverity;
  recommendedAction: string;
  autoResolveWhen: string;
  title: string;
  message: string;
  priority: number;
  observedAt: Date | null;
  metrics: Record<string, unknown>;
}

type CanonicalBatteryHealthSummary = NonNullable<
  Awaited<ReturnType<CanonicalBatteryHealthService['getSummary']>>
>;

export interface BatteryAlertVehicleMeta {
  id: string;
  make: string;
  model: string;
  licensePlate: string | null;
  homeStationId: string | null;
}

export interface BatteryAlertEvaluationInput {
  summary: CanonicalBatteryHealthSummary | null;
  vehicle: BatteryAlertVehicleMeta;
  now?: Date;
  warningLightActive?: boolean;
  activeDtcFaults?: Array<{
    code?: string | null;
    description?: string | null;
    severity?: string | null;
  }>;
}

function buildFreshness(
  observedAt: Date | string | null | undefined,
  maxAgeMs: number,
  now: Date,
): BatteryAlertFreshness {
  const freshness = buildObservationFreshness({
    observedAt: observedAt ?? null,
    maxAgeMs,
    now,
    hasValueCarrier: observedAt != null,
  });
  return {
    observedAt: freshness.observedAt,
    observationState: freshness.observationState,
    decisionFresh: observationFreshnessIsDecisionFresh(freshness),
    ageMs: freshness.observationAgeMs,
  };
}

function buildDedupeKey(vehicleId: string, ruleId: BatteryAlertRuleId): string {
  return `battery_alert:${vehicleId}:${ruleId}`;
}

function isExcludedWeakEvidence(input: ReturnType<typeof buildBatteryReadinessInputFromSummary>): boolean {
  return (
    input.startProxyConspicuous === true ||
    input.restShadowSignal === true ||
    input.hvCapacityShadowSignal === true ||
    input.legacyPublicationUnsafe === true ||
    input.truthSource === 'LEGACY_UNVERIFIED' ||
    input.truthSource === 'V2_SHADOW_DIAGNOSTIC' ||
    input.truthSource === 'LIVE_TELEMETRY' ||
    !input.hasSummary
  );
}

function severityRank(severity: InsightSeverity): number {
  switch (severity) {
    case InsightSeverity.CRITICAL:
      return 3;
    case InsightSeverity.WARNING:
      return 2;
    default:
      return 1;
  }
}

function pickPrimaryAlert(alerts: BatteryAlertContract[]): BatteryAlertContract | null {
  if (alerts.length === 0) return null;
  return [...alerts].sort((a, b) => {
    const severityDelta = severityRank(b.severity) - severityRank(a.severity);
    if (severityDelta !== 0) return severityDelta;
    return b.priority - a.priority;
  })[0]!;
}

/**
 * Evaluates all eligible battery alerts for a vehicle. Proxy/shadow/legacy/missing
 * evidence never produces alerts.
 */
export function evaluateBatteryAlerts(
  input: BatteryAlertEvaluationInput,
): BatteryAlertContract[] {
  const now = input.now ?? new Date();
  const label =
    input.vehicle.licensePlate ||
    `${input.vehicle.make} ${input.vehicle.model}`;
  const readinessInput = buildBatteryReadinessInputFromSummary({
    summary: input.summary,
    warningLightActive: input.warningLightActive ?? false,
    batterySafetyDtcActive: hasActiveBatterySafetyDtc(input.activeDtcFaults),
  });

  if (!input.summary || isExcludedWeakEvidence(readinessInput)) {
    return [];
  }

  const summary = input.summary;
  const alerts: BatteryAlertContract[] = [];
  const canonicalLvSection = summary.canonical?.lv;
  const canonicalLv = canonicalLvSection?.canonical;
  const truthSource = canonicalLv?.primaryTruth?.source ?? readinessInput.truthSource;
  const publicationMaturity =
    canonicalLvSection?.publication?.maturity ?? summary.lv?.publicationState ?? null;
  const restingStatus = summary.lv?.restingVoltage?.status ?? 'UNKNOWN';
  const restingVoltage = summary.lv?.restingVoltage?.valueV ?? null;
  const publishedScore =
    canonicalLvSection?.publication?.publishedEstimatedHealth ??
    canonicalLv?.primaryTruth?.estimatedHealthScore ??
    summary.lv?.estimatedHealth?.scorePct ??
    null;
  const observedAtRaw =
    summary.lv?.restingVoltage?.dataQuality?.observedAt ??
    canonicalLvSection?.publication?.assessmentEvidenceObservedAt ??
    summary.lv?.freshness?.observedAt ??
    null;
  const observedAt = observedAtRaw ? new Date(observedAtRaw) : null;
  const freshness = buildFreshness(observedAtRaw, 14 * 24 * 60 * 60_000, now);

  const pushAlert = (alert: Omit<BatteryAlertContract, 'policyVersion' | 'vehicleId' | 'dedupeKey' | 'freshness'> & {
    freshness?: BatteryAlertFreshness;
  }) => {
    alerts.push({
      policyVersion: BATTERY_ALERT_POLICY_VERSION,
      vehicleId: input.vehicle.id,
      dedupeKey: buildDedupeKey(input.vehicle.id, alert.ruleId),
      freshness: alert.freshness ?? freshness,
      ...alert,
    });
  };

  if (input.warningLightActive) {
    pushAlert({
      ruleId: BATTERY_ALERT_RULE_IDS.WARNING_LIGHT,
      cause: 'Batterie-Warnleuchte aktiv',
      evidenceTier: BatteryEvidenceStrengthTier.UNKNOWN,
      severity: InsightSeverity.WARNING,
      recommendedAction: 'Batterie und Ladesystem vor Vermietung manuell prüfen',
      autoResolveWhen: BATTERY_ALERT_AUTO_RESOLVE[BATTERY_ALERT_RULE_IDS.WARNING_LIGHT],
      title: 'Batterie — Warnleuchte aktiv',
      message: `${label}: Batterie-Warnleuchte aktiv — manuelle Prüfung erforderlich.`,
      priority: 72,
      observedAt: now,
      metrics: { source: 'hm_warning_light' },
    });
  }

  const dtcFault = (input.activeDtcFaults ?? []).find((fault) =>
    isBatterySafetyDtcFault(fault),
  );
  if (dtcFault) {
    pushAlert({
      ruleId: BATTERY_ALERT_RULE_IDS.SAFETY_DTC,
      cause: `Sicherheitsrelevanter Batterie-DTC ${dtcFault.code ?? 'unbekannt'}`,
      evidenceTier: BatteryEvidenceStrengthTier.UNKNOWN,
      severity: InsightSeverity.CRITICAL,
      recommendedAction: 'Fehlerspeicher auslesen und Batterie/Traktionssystem prüfen',
      autoResolveWhen: BATTERY_ALERT_AUTO_RESOLVE[BATTERY_ALERT_RULE_IDS.SAFETY_DTC],
      title: 'Batterie — sicherheitsrelevanter Fehlercode',
      message: `${label}: Sicherheitsrelevanter Batterie-Fehlercode (${dtcFault.code ?? 'DTC'}) — Diagnose erforderlich.`,
      priority: 86,
      observedAt: now,
      metrics: {
        dtcCode: dtcFault.code ?? null,
        dtcDescription: dtcFault.description ?? null,
      },
    });
  }

  const workshopTrack = readinessInput.assessmentTrack === 'WORKSHOP_OVERRIDE';
  const workshopTier =
    readinessInput.evidenceTier === BatteryEvidenceStrengthTier.WORKSHOP_OR_BMS_VERIFIED;
  if (workshopTrack || workshopTier) {
    const workshopCritical =
      summary.lv?.healthStatus === 'CRITICAL' || restingStatus === 'CRITICAL';
    const workshopWarning =
      summary.lv?.healthStatus === 'WARNING' || restingStatus === 'WARNING';
    if (workshopCritical || workshopWarning) {
      pushAlert({
        ruleId: BATTERY_ALERT_RULE_IDS.WORKSHOP_FINDING,
        cause: workshopCritical
          ? 'Werkstattbefund kritisch'
          : 'Werkstattbefund auffällig',
        evidenceTier: BatteryEvidenceStrengthTier.WORKSHOP_OR_BMS_VERIFIED,
        severity: workshopCritical ? InsightSeverity.CRITICAL : InsightSeverity.WARNING,
        recommendedAction: 'Werkstattbefund verifizieren und Maßnahme dokumentieren',
        autoResolveWhen: BATTERY_ALERT_AUTO_RESOLVE[BATTERY_ALERT_RULE_IDS.WORKSHOP_FINDING],
        title: workshopCritical
          ? 'Batterie — Werkstattbefund kritisch'
          : 'Batterie — Werkstattbefund auffällig',
        message: workshopCritical
          ? `${label}: Bestätigter Werkstattbefund kritisch — Austausch oder Nachladen prüfen.`
          : `${label}: Bestätigter Werkstattbefund auffällig — Batterie prüfen.`,
        priority: workshopCritical ? 88 : 68,
        observedAt,
        metrics: {
          restingVoltageV: restingVoltage,
          restingStatus,
          assessmentTrack: readinessInput.assessmentTrack,
        },
      });
    }
  }

  const manualTier =
    readinessInput.evidenceTier === BatteryEvidenceStrengthTier.DOCUMENT_VERIFIED;
  if (manualTier && !workshopTrack) {
    const manualConcern =
      summary.lv?.healthStatus === 'CRITICAL' ||
      summary.lv?.healthStatus === 'WARNING' ||
      restingStatus === 'CRITICAL' ||
      restingStatus === 'WARNING';
    if (manualConcern) {
      pushAlert({
        ruleId: BATTERY_ALERT_RULE_IDS.MANUAL_MEASUREMENT,
        cause: 'Bestätigte manuelle oder Dokument-Messung auffällig',
        evidenceTier: BatteryEvidenceStrengthTier.DOCUMENT_VERIFIED,
        severity:
          restingStatus === 'CRITICAL' || summary.lv?.healthStatus === 'CRITICAL'
            ? InsightSeverity.CRITICAL
            : InsightSeverity.WARNING,
        recommendedAction: 'Bestätigte Messung gegenprüfen und Maßnahme festhalten',
        autoResolveWhen: BATTERY_ALERT_AUTO_RESOLVE[BATTERY_ALERT_RULE_IDS.MANUAL_MEASUREMENT],
        title: 'Batterie — bestätigte Messung auffällig',
        message: `${label}: Bestätigte manuelle oder Dokument-Messung zeigt auffälligen Batteriezustand.`,
        priority: 70,
        observedAt,
        metrics: { truthSource, restingStatus, restingVoltageV: restingVoltage },
      });
    }
  }

  const stablePublicationEligible =
    truthSource === 'V2_PUBLICATION_STABLE' &&
    publicationMaturity === 'STABLE' &&
    readinessInput.decisionCapable === true &&
    readinessInput.restingMeasurementQuality === BatteryMeasurementQuality.VALID &&
    getEvidenceCapabilities(
      resolveLvMeasurementEvidenceTier({
        type: BatteryMeasurementType.REST_60M,
        quality: BatteryMeasurementQuality.VALID,
      }),
    ).canTriggerAlert;

  if (stablePublicationEligible) {
    const publishedConcern =
      (publishedScore != null && publishedScore <= 35) ||
      restingStatus === 'CRITICAL' ||
      (restingStatus === 'WARNING' && isAlertableStatus(restingStatus));
    const aggregateConcern =
      summary.lv?.healthStatus === 'CRITICAL' ||
      (summary.lv?.healthStatus === 'WARNING' && isAlertableStatus(summary.lv.healthStatus));

    if (publishedConcern || aggregateConcern) {
      const critical =
        restingStatus === 'CRITICAL' || summary.lv?.healthStatus === 'CRITICAL';
      const vtxt = restingVoltage != null ? restingVoltage.toFixed(2) : '?';
      pushAlert({
        ruleId: BATTERY_ALERT_RULE_IDS.LV_PUBLICATION_STABLE,
        cause: critical
          ? `Qualifizierte LV-Publikation kritisch (Ruhespannung ${vtxt} V)`
          : `Qualifizierte LV-Publikation auffällig (Ruhespannung ${vtxt} V)`,
        evidenceTier: BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_STABLE,
        severity: critical ? InsightSeverity.CRITICAL : InsightSeverity.WARNING,
        recommendedAction: critical
          ? 'Starthilfe oder Batterietausch prüfen'
          : 'Batterie laden und Ruhespannung erneut prüfen',
        autoResolveWhen:
          BATTERY_ALERT_AUTO_RESOLVE[BATTERY_ALERT_RULE_IDS.LV_PUBLICATION_STABLE],
        title: critical
          ? 'Batterie kritisch — qualifizierte Ruhespannung'
          : 'Batterie auffällig — qualifizierte Ruhespannung',
        message: critical
          ? `${label}: Qualifizierte Ruhespannung ${vtxt} V — Starthilfe oder Austausch prüfen.`
          : `${label}: Qualifizierte Ruhespannung ${vtxt} V niedrig — Ladezustand prüfen.`,
        priority: critical ? 84 : 64,
        observedAt,
        metrics: {
          restingVoltageV: restingVoltage,
          restingStatus,
          publishedEstimatedHealth: publishedScore,
          publicationMaturity,
          truthSource,
        },
      });
    }
  }

  return alerts;
}

/** Backward-compatible single-alert resolver for existing detector consumers. */
export function resolveBatteryAlertCandidate(
  summary: CanonicalBatteryHealthSummary,
  vehicle: BatteryAlertVehicleMeta,
  now: Date,
  options?: {
    warningLightActive?: boolean;
    activeDtcFaults?: BatteryAlertEvaluationInput['activeDtcFaults'];
  },
): {
  severity: InsightSeverity;
  priority: number;
  title: string;
  message: string;
  reason: string;
  observedAt: Date | null;
  metrics: Record<string, unknown>;
  ruleId: BatteryAlertRuleId;
  dedupeKey: string;
  autoResolveWhen: string;
  recommendedAction: string;
  evidenceTier: BatteryEvidenceStrengthTier;
} | null {
  const primary = pickPrimaryAlert(
    evaluateBatteryAlerts({
      summary,
      vehicle,
      now,
      warningLightActive: options?.warningLightActive,
      activeDtcFaults: options?.activeDtcFaults,
    }),
  );
  if (!primary) return null;

  return {
    severity: primary.severity,
    priority: primary.priority,
    title: primary.title,
    message: primary.message,
    reason: primary.cause,
    observedAt: primary.observedAt,
    metrics: {
      ...primary.metrics,
      ruleId: primary.ruleId,
      evidenceTier: primary.evidenceTier,
      freshness: primary.freshness,
      autoResolveWhen: primary.autoResolveWhen,
      recommendedAction: primary.recommendedAction,
      policyVersion: primary.policyVersion,
    },
    ruleId: primary.ruleId,
    dedupeKey: primary.dedupeKey,
    autoResolveWhen: primary.autoResolveWhen,
    recommendedAction: primary.recommendedAction,
    evidenceTier: primary.evidenceTier,
  };
}

export function shouldAutoResolveBatteryAlert(input: {
  existingRuleId: BatteryAlertRuleId;
  summary: CanonicalBatteryHealthSummary | null;
  warningLightActive?: boolean;
  activeDtcFaults?: BatteryAlertEvaluationInput['activeDtcFaults'];
  now?: Date;
}): boolean {
  const activeRuleIds = new Set(
    evaluateBatteryAlerts({
      summary: input.summary,
      vehicle: {
        id: 'auto-resolve-probe',
        make: '',
        model: '',
        licensePlate: null,
        homeStationId: null,
      },
      now: input.now,
      warningLightActive: input.warningLightActive,
      activeDtcFaults: input.activeDtcFaults,
    }).map((alert) => alert.ruleId),
  );
  return !activeRuleIds.has(input.existingRuleId);
}
