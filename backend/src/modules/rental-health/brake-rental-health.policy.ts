/**
 * Central brake rental-health / booking-gate policy.
 *
 * Consumed by RentalHealthService, Bookings gate (via rental_blocked), Fleet,
 * and Vehicle Detail — no parallel threshold logic elsewhere.
 */

import { BRAKE_HEALTH_CONFIG } from '../vehicle-intelligence/brakes/brake-health.config';
import type { BrakeHealthSummaryDto } from '../vehicle-intelligence/brakes/brake-health.service';
import { hasWearOrSafetyAlert } from '../vehicle-intelligence/brakes/brake-health-alert.builder';
import {
  aggregateBrakeCondition,
  strongerDataBasis,
  type BrakeCondition,
  type BrakeDataBasis,
} from '../vehicle-intelligence/brakes/brake-status';
import type { HealthState } from './rental-health.types';
import { isStale, toIso } from './rental-health.types';
import type {
  BrakeActiveSafetyEvidence,
  BrakeDataQualityCondition,
  BrakeMeasurementFreshness,
  BrakeModelFreshness,
  BrakeRentalBlockingEvidence,
  BrakeRentalDecision,
  BrakeRentalHealthModuleHealth,
  BrakeRentalHealthReadModel,
  BrakeRentalReasonCode,
  BrakeRentalReviewOverrideSummary,
  BrakeRentalReviewRequirement,
} from './brake-rental-health.types';

export interface BrakeRentalPolicyInput {
  summary: BrakeHealthSummaryDto | null;
  moduleLoadError?: string | null;
  activeReviewOverride?: BrakeRentalReviewOverrideSummary | null;
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

function mergeReviewRequirement(
  current: BrakeRentalReviewRequirement,
  next: BrakeRentalReviewRequirement,
): BrakeRentalReviewRequirement {
  if (current === 'REVIEW_REQUIRED' || next === 'REVIEW_REQUIRED') {
    return 'REVIEW_REQUIRED';
  }
  if (current === 'MEASUREMENT_REQUIRED' || next === 'MEASUREMENT_REQUIRED') {
    return 'MEASUREMENT_REQUIRED';
  }
  return 'NONE';
}

function healthStateRank(state: HealthState): number {
  switch (state) {
    case 'critical':
      return 4;
    case 'warning':
      return 3;
    case 'unknown':
      return 2;
    case 'good':
      return 1;
    default:
      return 0;
  }
}

function maxHealthState(a: HealthState, b: HealthState): HealthState {
  return healthStateRank(a) >= healthStateRank(b) ? a : b;
}

export function resolveBrakeMeasurementFreshness(
  summary: BrakeHealthSummaryDto | null,
): BrakeMeasurementFreshness {
  const measuredAt = summary?.lastMeasurementAt ?? summary?.lastServiceAt ?? null;
  if (!measuredAt) return 'no_data';
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(measuredAt)) / 86400000),
  );
  const staleDays = BRAKE_HEALTH_CONFIG.measurementFreshness.staleDays;
  if (ageDays >= staleDays) return 'stale';
  if (ageDays >= Math.floor(staleDays * 0.6)) return 'aging';
  return 'fresh';
}

export function resolveBrakeModelFreshness(
  summary: BrakeHealthSummaryDto | null,
): BrakeModelFreshness {
  const calculatedAt = summary?.lastRecalculatedAt ?? summary?.updatedAt ?? null;
  if (!calculatedAt) return 'no_data';
  return isStale(calculatedAt) ? 'stale' : 'fresh';
}

function resolveBrakeDataBasis(summary: BrakeHealthSummaryDto): BrakeDataBasis {
  return strongerDataBasis(
    strongerDataBasis(summary.dataBasis ?? 'UNKNOWN', summary.frontDataBasis ?? 'UNKNOWN'),
    summary.rearDataBasis ?? 'UNKNOWN',
  );
}

function brakeDataBasisToEvidenceType(
  summary: BrakeHealthSummaryDto,
): BrakeRentalHealthReadModel['evidenceType'] {
  switch (resolveBrakeDataBasis(summary)) {
    case 'MEASURED':
      return 'measured';
    case 'DOCUMENTED':
      return 'document';
    case 'SENSOR':
      return 'sensor';
    case 'ESTIMATED':
      return 'estimated';
    default:
      return 'unknown';
  }
}

function isMeasuredWearAlert(alert: {
  category?: string;
  displayMode?: string;
  reasonCode?: string;
}): boolean {
  return (
    alert.category === 'WEAR' &&
    (alert.displayMode === 'MEASURED' ||
      String(alert.reasonCode ?? '').includes('MEASURED'))
  );
}

function isEstimatedWearAlert(alert: {
  category?: string;
  displayMode?: string;
  reasonCode?: string;
}): boolean {
  return (
    alert.category === 'WEAR' &&
    (alert.displayMode === 'ESTIMATED' ||
      String(alert.reasonCode ?? '').includes('ESTIMATED'))
  );
}

function deriveRentalWearCondition(summary: BrakeHealthSummaryDto): BrakeCondition | 'UNKNOWN' {
  const wearAlerts = (summary.openAlerts ?? []).filter((a) => a.category === 'WEAR');
  let condition: BrakeCondition | 'UNKNOWN' = 'UNKNOWN';

  for (const alert of wearAlerts) {
    if (isMeasuredWearAlert(alert)) {
      if (alert.severity === 'critical') {
        condition = aggregateBrakeCondition(condition, 'CRITICAL');
      } else if (alert.severity === 'warning') {
        condition = aggregateBrakeCondition(condition, 'WARNING');
      }
      continue;
    }
    if (isEstimatedWearAlert(alert)) {
      if (alert.severity === 'critical' || alert.severity === 'warning') {
        condition = aggregateBrakeCondition(condition, 'WARNING');
      }
    }
  }

  if (condition !== 'UNKNOWN') return condition;

  const front = summary.frontAxle?.condition ?? summary.frontAxleCondition ?? 'UNKNOWN';
  const rear = summary.rearAxle?.condition ?? summary.rearAxleCondition ?? 'UNKNOWN';
  let axleCondition = aggregateBrakeCondition(front, rear);
  const basis = resolveBrakeDataBasis(summary);
  if (basis === 'ESTIMATED' && axleCondition === 'CRITICAL') {
    axleCondition = 'WARNING';
  }
  return axleCondition;
}

function deriveSafetyCondition(summary: BrakeHealthSummaryDto): BrakeCondition | 'UNKNOWN' {
  const safetyAlerts = (summary.openAlerts ?? []).filter((a) => a.category === 'SAFETY');
  if (safetyAlerts.length === 0) {
    return 'GOOD';
  }
  let condition: BrakeCondition | 'UNKNOWN' = 'UNKNOWN';
  for (const alert of safetyAlerts) {
    if (alert.severity === 'critical') {
      condition = aggregateBrakeCondition(condition, 'CRITICAL');
    } else if (alert.severity === 'warning') {
      condition = aggregateBrakeCondition(condition, 'WARNING');
    }
  }
  return condition;
}

function deriveDataQualityCondition(summary: BrakeHealthSummaryDto): BrakeDataQualityCondition {
  const dqAlerts = (summary.openAlerts ?? []).filter((a) => a.category === 'DATA_QUALITY');
  if (!summary.isInitialized && dqAlerts.some((a) => a.alertType === 'NO_BASELINE')) {
    return 'UNKNOWN';
  }
  if (dqAlerts.length === 0) {
    return summary.isInitialized ? 'GOOD' : 'UNKNOWN';
  }
  if (dqAlerts.some((a) => a.severity === 'warning' || a.severity === 'info')) {
    return 'WARNING';
  }
  return 'GOOD';
}

function mapActiveSafetyEvidence(summary: BrakeHealthSummaryDto): BrakeActiveSafetyEvidence[] {
  return (summary.openAlerts ?? [])
    .filter((a) => a.category === 'SAFETY')
    .map((a) => ({
      alertType: a.alertType,
      reasonCode: a.reasonCode,
      severity: a.severity,
      message: a.message,
      messageEn: a.messageEn,
      displayMode: a.displayMode,
      axle: a.axle,
    }));
}

function rentalDecisionToHealthState(
  decision: BrakeRentalDecision,
  readModel: Pick<
    BrakeRentalHealthReadModel,
    'wearCondition' | 'safetyCondition' | 'dataQualityCondition'
  >,
  summary: BrakeHealthSummaryDto | null,
): HealthState {
  switch (decision) {
    case 'HARD_BLOCK':
      return 'critical';
    case 'WARNING':
      return 'warning';
    case 'MEASUREMENT_REQUIRED':
      return summary?.isInitialized ? 'warning' : 'unknown';
    case 'DATA_QUALITY_WARNING':
      return deriveWearSafetyModuleState(readModel);
    case 'REVIEW_REQUIRED':
    case 'UNAVAILABLE':
      return 'unknown';
    case 'ALLOW':
      return deriveWearSafetyModuleState(readModel);
    default:
      return 'unknown';
  }
}

function deriveWearSafetyModuleState(
  readModel: Pick<BrakeRentalHealthReadModel, 'wearCondition' | 'safetyCondition'>,
): HealthState {
  const wear = readModel.wearCondition;
  const safety = readModel.safetyCondition;
  if (wear === 'CRITICAL' || safety === 'CRITICAL') return 'critical';
  if (wear === 'WARNING' || safety === 'WARNING') return 'warning';
  if (wear === 'GOOD' && safety === 'GOOD') return 'good';
  return 'unknown';
}

function localizePrimaryReason(
  code: BrakeRentalReasonCode,
  locale: 'de' | 'en',
  detail?: string,
): string {
  const messages: Record<BrakeRentalReasonCode, { de: string; en: string }> = {
    WEAR_MEASURED_CRITICAL: {
      de: 'Gemessener kritischer Bremsverschleiß',
      en: 'Measured critical brake wear',
    },
    WEAR_MEASURED_BELOW_THRESHOLD: {
      de: 'Gemessene Belagdicke unter bestätigter Mindestdicke',
      en: 'Measured pad thickness below confirmed minimum',
    },
    WEAR_ESTIMATED_CRITICAL: {
      de: 'Geschätzter kritischer Bremsverschleiß — Messung erforderlich',
      en: 'Estimated critical brake wear — measurement required',
    },
    WEAR_ESTIMATED_WARNING: {
      de: 'Geschätzter Bremsverschleiß — Beobachtung empfohlen',
      en: 'Estimated brake wear — monitoring recommended',
    },
    SAFETY_DTC_CRITICAL: {
      de: 'Aktiver kritischer Bremsen-Fehlercode',
      en: 'Active critical brake fault code',
    },
    SAFETY_DTC_REVIEW: {
      de: 'Aktiver Bremsen-Fehlercode — Prüfung erforderlich',
      en: 'Active brake fault code — review required',
    },
    SAFETY_ABS_CRITICAL: {
      de: 'Aktiver kritischer ABS/ESC-Fehlercode',
      en: 'Active critical ABS/ESC fault code',
    },
    SAFETY_ABS_REVIEW: {
      de: 'Aktiver ABS/ESC-Fehlercode — Prüfung erforderlich',
      en: 'Active ABS/ESC fault code — review required',
    },
    SAFETY_FLUID_CRITICAL: {
      de: 'Kritische Bremsflüssigkeits-Evidenz',
      en: 'Critical brake fluid evidence',
    },
    SAFETY_IMMEDIATE_REPLACEMENT: {
      de: 'Bestätigter sofortiger Bremsenersatz erforderlich',
      en: 'Confirmed immediate brake replacement required',
    },
    SAFETY_WEAR_SENSOR: {
      de: 'Aktiver Bremsverschleiß-Sensor',
      en: 'Active brake wear sensor',
    },
    DATA_NO_BASELINE: {
      de: 'Keine Bremsen-Baseline — Messung erforderlich',
      en: 'No brake baseline — measurement required',
    },
    DATA_SPEC_ONLY: {
      de: 'Nur Spezifikation ohne Messung — Baseline erforderlich',
      en: 'Specification only without measurement — baseline required',
    },
    DATA_COVERAGE_GAP: {
      de: 'Datenqualität: unvollständige Fahrtabdeckung',
      en: 'Data quality: incomplete trip coverage',
    },
    DATA_DISTANCE_CONFLICT: {
      de: 'Datenqualität: Kilometerkonflikt',
      en: 'Data quality: distance conflict',
    },
    DATA_MEASUREMENT_REQUIRED: {
      de: 'Messung vor Vermietung erforderlich',
      en: 'Measurement required before rental',
    },
    DATA_STALE_EVIDENCE: {
      de: 'Veraltete Bremsen-Evidenz — erneute Prüfung erforderlich',
      en: 'Stale brake evidence — re-check required',
    },
    UNKNOWN_STATE: {
      de: 'Bremsenstatus unbekannt — Prüfung erforderlich',
      en: 'Brake status unknown — review required',
    },
    MODULE_UNAVAILABLE: {
      de: 'Bremsenmodul nicht verfügbar — manuelle Prüfung erforderlich',
      en: 'Brake module unavailable — manual review required',
    },
    REVIEW_OVERRIDE_ACTIVE: {
      de: 'Manuelle Freigabe aktiv',
      en: 'Manual review override active',
    },
  };
  const base = messages[code][locale];
  return detail ? `${base}: ${detail}` : base;
}

export function buildBrakeRentalHealthReadModel(
  input: BrakeRentalPolicyInput,
): BrakeRentalHealthReadModel {
  const summary = input.summary;
  const activeReviewOverride = input.activeReviewOverride ?? null;
  const reasonCodes: BrakeRentalReasonCode[] = [];
  let reviewRequirement: BrakeRentalReviewRequirement = 'NONE';
  let rentalDecision: BrakeRentalDecision = 'ALLOW';
  let rentalBlockingEvidence: BrakeRentalBlockingEvidence | null = null;
  const blockingReasons: string[] = [];
  let primaryReasonCode: BrakeRentalReasonCode = 'UNKNOWN_STATE';
  let primaryDetail: string | undefined;

  const lastMeasurementAt = toIso(summary?.lastMeasurementAt ?? summary?.lastServiceAt ?? null);
  const lastModelCalculatedAt = toIso(summary?.lastRecalculatedAt ?? null);
  const lastDataReceivedAt = toIso(
    maxIso(summary?.updatedAt ?? null, summary?.lastRecalculatedAt ?? null),
  );
  const measurementFreshness = resolveBrakeMeasurementFreshness(summary);
  const modelFreshness = resolveBrakeModelFreshness(summary);

  if (input.moduleLoadError) {
    reasonCodes.push('MODULE_UNAVAILABLE');
    rentalDecision = 'UNAVAILABLE';
    reviewRequirement = 'REVIEW_REQUIRED';
    primaryReasonCode = 'MODULE_UNAVAILABLE';
    return finalizeReadModel({
      summary,
      activeReviewOverride,
      reasonCodes,
      reviewRequirement,
      rentalDecision,
      rentalBlockingEvidence,
      blockingReasons,
      primaryReasonCode,
      primaryDetail,
      lastMeasurementAt,
      lastModelCalculatedAt,
      lastDataReceivedAt,
      measurementFreshness,
      modelFreshness,
    });
  }

  if (!summary) {
    reasonCodes.push('DATA_NO_BASELINE');
    rentalDecision = 'REVIEW_REQUIRED';
    reviewRequirement = 'REVIEW_REQUIRED';
    primaryReasonCode = 'DATA_NO_BASELINE';
    return finalizeReadModel({
      summary,
      activeReviewOverride,
      reasonCodes,
      reviewRequirement,
      rentalDecision,
      rentalBlockingEvidence,
      blockingReasons,
      primaryReasonCode,
      primaryDetail,
      lastMeasurementAt,
      lastModelCalculatedAt,
      lastDataReceivedAt,
      measurementFreshness,
      modelFreshness,
    });
  }

  const wearCondition = deriveRentalWearCondition(summary);
  const safetyCondition = deriveSafetyCondition(summary);
  const dataQualityCondition = deriveDataQualityCondition(summary);
  const activeSafetyEvidence = mapActiveSafetyEvidence(summary);
  const lastSafetyEvidenceAt =
    activeSafetyEvidence.length > 0 ? lastDataReceivedAt : null;

  const openAlerts = summary.openAlerts ?? [];
  const basis = resolveBrakeDataBasis(summary);

  // ── Policy A: measured wear below confirmed minimum → HARD_BLOCK ─────────
  const measuredCriticalWear = openAlerts.find(
    (a) =>
      a.category === 'WEAR' &&
      a.severity === 'critical' &&
      isMeasuredWearAlert(a),
  );
  if (measuredCriticalWear) {
    reasonCodes.push('WEAR_MEASURED_CRITICAL');
    rentalDecision = 'HARD_BLOCK';
    rentalBlockingEvidence = {
      action: 'HARD_BLOCK',
      reasonCode: 'WEAR_MEASURED_CRITICAL',
      source: 'brake_measurement',
      value: null,
      threshold: null,
      timestamp: lastMeasurementAt,
      message: measuredCriticalWear.message,
      messageEn: measuredCriticalWear.messageEn,
    };
    blockingReasons.push(rentalBlockingEvidence.message);
    primaryReasonCode = 'WEAR_MEASURED_CRITICAL';
  }

  // ── Policy C: confirmed immediate replacement → HARD_BLOCK ───────────────
  const immediateReplacement = openAlerts.find(
    (a) => a.alertType === 'IMMEDIATE_REPLACEMENT' && a.severity === 'critical',
  );
  if (!rentalBlockingEvidence && immediateReplacement) {
    reasonCodes.push('SAFETY_IMMEDIATE_REPLACEMENT');
    rentalDecision = 'HARD_BLOCK';
    rentalBlockingEvidence = {
      action: 'HARD_BLOCK',
      reasonCode: 'SAFETY_IMMEDIATE_REPLACEMENT',
      source: 'brake_safety_evidence',
      value: 'IMMEDIATE_REPLACEMENT',
      threshold: null,
      timestamp: lastSafetyEvidenceAt,
      message: immediateReplacement.message,
      messageEn: immediateReplacement.messageEn,
    };
    blockingReasons.push(rentalBlockingEvidence.message);
    primaryReasonCode = 'SAFETY_IMMEDIATE_REPLACEMENT';
  }

  // ── Policy B: critical safety DTC / ABS / fluid ──────────────────────────
  const absCritical = openAlerts.find(
    (a) =>
      a.alertType === 'ABS_WARNING' &&
      (a.reasonCode === 'ABS_DTC_CRITICAL' || a.severity === 'critical'),
  );
  if (!rentalBlockingEvidence && absCritical) {
    reasonCodes.push('SAFETY_ABS_CRITICAL');
    rentalDecision = 'HARD_BLOCK';
    rentalBlockingEvidence = {
      action: 'HARD_BLOCK',
      reasonCode: 'SAFETY_ABS_CRITICAL',
      source: 'brake_dtc',
      value: absCritical.reasonCode,
      threshold: null,
      timestamp: lastSafetyEvidenceAt,
      message: absCritical.message,
      messageEn: absCritical.messageEn,
    };
    blockingReasons.push(rentalBlockingEvidence.message);
    primaryReasonCode = 'SAFETY_ABS_CRITICAL';
  }

  const brakeDtcCritical = openAlerts.find(
    (a) =>
      a.alertType === 'BRAKE_DTC' &&
      (a.reasonCode === 'BRAKE_DTC_CRITICAL' || a.severity === 'critical'),
  );
  if (!rentalBlockingEvidence && brakeDtcCritical) {
    reasonCodes.push('SAFETY_DTC_CRITICAL');
    rentalDecision = 'HARD_BLOCK';
    rentalBlockingEvidence = {
      action: 'HARD_BLOCK',
      reasonCode: 'SAFETY_DTC_CRITICAL',
      source: 'brake_dtc',
      value: brakeDtcCritical.reasonCode,
      threshold: null,
      timestamp: lastSafetyEvidenceAt,
      message: brakeDtcCritical.message,
      messageEn: brakeDtcCritical.messageEn,
    };
    blockingReasons.push(rentalBlockingEvidence.message);
    primaryReasonCode = 'SAFETY_DTC_CRITICAL';
  }

  const fluidCritical = openAlerts.find(
    (a) => a.alertType === 'BRAKE_FLUID' && a.reasonCode === 'BRAKE_FLUID_CRITICAL',
  );
  if (!rentalBlockingEvidence && fluidCritical) {
    reasonCodes.push('SAFETY_FLUID_CRITICAL');
    rentalDecision = 'HARD_BLOCK';
    rentalBlockingEvidence = {
      action: 'HARD_BLOCK',
      reasonCode: 'SAFETY_FLUID_CRITICAL',
      source: 'brake_fluid',
      value: 'CRITICAL',
      threshold: null,
      timestamp: lastSafetyEvidenceAt,
      message: fluidCritical.message,
      messageEn: fluidCritical.messageEn,
    };
    blockingReasons.push(rentalBlockingEvidence.message);
    primaryReasonCode = 'SAFETY_FLUID_CRITICAL';
  }

  // Non-critical safety DTC → mandatory review (policy B)
  const absReview = openAlerts.find(
    (a) => a.alertType === 'ABS_WARNING' && a.severity === 'warning',
  );
  if (!rentalBlockingEvidence && absReview) {
    reasonCodes.push('SAFETY_ABS_REVIEW');
    rentalDecision = maxDecision(rentalDecision, 'REVIEW_REQUIRED');
    reviewRequirement = mergeReviewRequirement(reviewRequirement, 'REVIEW_REQUIRED');
    primaryReasonCode = 'SAFETY_ABS_REVIEW';
    primaryDetail = absReview.message;
  }

  const dtcReview = openAlerts.find(
    (a) => a.alertType === 'BRAKE_DTC' && a.severity === 'warning',
  );
  if (!rentalBlockingEvidence && dtcReview) {
    reasonCodes.push('SAFETY_DTC_REVIEW');
    rentalDecision = maxDecision(rentalDecision, 'REVIEW_REQUIRED');
    reviewRequirement = mergeReviewRequirement(reviewRequirement, 'REVIEW_REQUIRED');
    if (primaryReasonCode === 'UNKNOWN_STATE') {
      primaryReasonCode = 'SAFETY_DTC_REVIEW';
      primaryDetail = dtcReview.message;
    }
  }

  const wearSensor = openAlerts.find((a) => a.alertType === 'WEAR_SENSOR');
  if (wearSensor && !rentalBlockingEvidence) {
    reasonCodes.push('SAFETY_WEAR_SENSOR');
    rentalDecision = maxDecision(rentalDecision, 'REVIEW_REQUIRED');
    reviewRequirement = mergeReviewRequirement(reviewRequirement, 'REVIEW_REQUIRED');
    if (primaryReasonCode === 'UNKNOWN_STATE') {
      primaryReasonCode = 'SAFETY_WEAR_SENSOR';
      primaryDetail = wearSensor.message;
    }
  }

  // ── Policy D: estimated critical wear → WARNING / MEASUREMENT_REQUIRED ───
  const estimatedCriticalWear = openAlerts.find(
    (a) => a.category === 'WEAR' && a.severity === 'critical' && isEstimatedWearAlert(a),
  );
  if (!rentalBlockingEvidence && estimatedCriticalWear) {
    reasonCodes.push('WEAR_ESTIMATED_CRITICAL');
    rentalDecision = maxDecision(rentalDecision, 'MEASUREMENT_REQUIRED');
    reviewRequirement = mergeReviewRequirement(reviewRequirement, 'MEASUREMENT_REQUIRED');
    if (primaryReasonCode === 'UNKNOWN_STATE') {
      primaryReasonCode = 'WEAR_ESTIMATED_CRITICAL';
      primaryDetail = estimatedCriticalWear.message;
    }
  } else if (
    !rentalBlockingEvidence &&
    wearCondition === 'WARNING' &&
    basis === 'ESTIMATED'
  ) {
    reasonCodes.push('WEAR_ESTIMATED_WARNING');
    rentalDecision = maxDecision(rentalDecision, 'WARNING');
    if (primaryReasonCode === 'UNKNOWN_STATE') {
      primaryReasonCode = 'WEAR_ESTIMATED_WARNING';
    }
  }

  // ── Policy E: spec-only / no baseline ─────────────────────────────────────
  const noBaseline = openAlerts.find((a) => a.alertType === 'NO_BASELINE');
  const specOnly =
    !summary.isInitialized ||
    basis === 'UNKNOWN' ||
    openAlerts.some((a) => a.alertType === 'SPEC_UNCONFIRMED' || a.alertType === 'MEASUREMENT_REQUIRED');
  if (!summary.isInitialized || noBaseline) {
    reasonCodes.push('DATA_NO_BASELINE');
    rentalDecision = maxDecision(rentalDecision, 'MEASUREMENT_REQUIRED');
    reviewRequirement = mergeReviewRequirement(reviewRequirement, 'MEASUREMENT_REQUIRED');
    if (primaryReasonCode === 'UNKNOWN_STATE') primaryReasonCode = 'DATA_NO_BASELINE';
  } else if (specOnly && basis !== 'MEASURED' && basis !== 'DOCUMENTED') {
    reasonCodes.push('DATA_SPEC_ONLY');
    rentalDecision = maxDecision(rentalDecision, 'MEASUREMENT_REQUIRED');
    reviewRequirement = mergeReviewRequirement(reviewRequirement, 'MEASUREMENT_REQUIRED');
    if (primaryReasonCode === 'UNKNOWN_STATE') primaryReasonCode = 'DATA_SPEC_ONLY';
  }

  // ── Policy F: coverage gap → DATA_QUALITY_WARNING (no wear inflation) ────
  const coverageGap = openAlerts.find((a) => a.alertType === 'COVERAGE_GAP');
  if (coverageGap) {
    reasonCodes.push('DATA_COVERAGE_GAP');
    rentalDecision = maxDecision(rentalDecision, 'DATA_QUALITY_WARNING');
    if (primaryReasonCode === 'UNKNOWN_STATE') {
      primaryReasonCode = 'DATA_COVERAGE_GAP';
      primaryDetail = coverageGap.message;
    }
  }
  const distanceConflict = openAlerts.find((a) => a.alertType === 'DISTANCE_CONFLICT');
  if (distanceConflict) {
    reasonCodes.push('DATA_DISTANCE_CONFLICT');
    rentalDecision = maxDecision(rentalDecision, 'DATA_QUALITY_WARNING');
    if (primaryReasonCode === 'UNKNOWN_STATE') {
      primaryReasonCode = 'DATA_DISTANCE_CONFLICT';
      primaryDetail = distanceConflict.message;
    }
  }

  const staleEvidence = openAlerts.find((a) => a.alertType === 'STALE_EVIDENCE');
  if (staleEvidence || measurementFreshness === 'stale') {
    reasonCodes.push('DATA_STALE_EVIDENCE');
    rentalDecision = maxDecision(rentalDecision, 'REVIEW_REQUIRED');
    reviewRequirement = mergeReviewRequirement(reviewRequirement, 'REVIEW_REQUIRED');
    if (primaryReasonCode === 'UNKNOWN_STATE') primaryReasonCode = 'DATA_STALE_EVIDENCE';
  }

  // ── Policy G: unknown → REVIEW_REQUIRED, never GOOD ──────────────────────
  if (
    summary.isInitialized &&
    (wearCondition === 'UNKNOWN' ||
      summary.overallCondition === 'UNKNOWN' ||
      dataQualityCondition === 'UNKNOWN')
  ) {
    reasonCodes.push('UNKNOWN_STATE');
    rentalDecision = maxDecision(rentalDecision, 'REVIEW_REQUIRED');
    reviewRequirement = mergeReviewRequirement(reviewRequirement, 'REVIEW_REQUIRED');
    if (primaryReasonCode === 'UNKNOWN_STATE') primaryReasonCode = 'UNKNOWN_STATE';
  }

  if (
    rentalDecision === 'ALLOW' &&
    !summary.isInitialized &&
    (wearCondition === 'UNKNOWN' || measurementFreshness === 'no_data')
  ) {
    reasonCodes.push('UNKNOWN_STATE');
    rentalDecision = 'REVIEW_REQUIRED';
    reviewRequirement = mergeReviewRequirement(reviewRequirement, 'REVIEW_REQUIRED');
    primaryReasonCode = 'UNKNOWN_STATE';
  }

  if (activeReviewOverride && rentalBlockingEvidence?.action === 'HARD_BLOCK') {
    reasonCodes.push('REVIEW_OVERRIDE_ACTIVE');
    rentalBlockingEvidence = null;
    blockingReasons.length = 0;
    rentalDecision = maxDecision('WARNING', rentalDecision === 'HARD_BLOCK' ? 'WARNING' : rentalDecision);
    primaryReasonCode = 'REVIEW_OVERRIDE_ACTIVE';
    primaryDetail = activeReviewOverride.reason;
  }

  return finalizeReadModel({
    summary,
    activeReviewOverride,
    reasonCodes,
    reviewRequirement,
    rentalDecision,
    rentalBlockingEvidence,
    blockingReasons,
    primaryReasonCode,
    primaryDetail,
    lastMeasurementAt,
    lastModelCalculatedAt,
    lastDataReceivedAt,
    lastSafetyEvidenceAt,
    measurementFreshness,
    modelFreshness,
    wearCondition,
    safetyCondition,
    dataQualityCondition,
    activeSafetyEvidence,
  });
}

function finalizeReadModel(args: {
  summary: BrakeHealthSummaryDto | null;
  activeReviewOverride: BrakeRentalReviewOverrideSummary | null;
  reasonCodes: BrakeRentalReasonCode[];
  reviewRequirement: BrakeRentalReviewRequirement;
  rentalDecision: BrakeRentalDecision;
  rentalBlockingEvidence: BrakeRentalBlockingEvidence | null;
  blockingReasons: string[];
  primaryReasonCode: BrakeRentalReasonCode;
  primaryDetail?: string;
  lastMeasurementAt: string | null;
  lastModelCalculatedAt: string | null;
  lastDataReceivedAt: string | null;
  lastSafetyEvidenceAt?: string | null;
  measurementFreshness: BrakeMeasurementFreshness;
  modelFreshness: BrakeModelFreshness;
  wearCondition?: BrakeCondition | 'UNKNOWN';
  safetyCondition?: BrakeCondition | 'UNKNOWN';
  dataQualityCondition?: BrakeDataQualityCondition;
  activeSafetyEvidence?: BrakeActiveSafetyEvidence[];
}): BrakeRentalHealthReadModel {
  const summary = args.summary;
  const wearCondition =
    args.wearCondition ??
    (summary ? deriveRentalWearCondition(summary) : 'UNKNOWN');
  const safetyCondition =
    args.safetyCondition ??
    (summary ? deriveSafetyCondition(summary) : 'UNKNOWN');
  const dataQualityCondition =
    args.dataQualityCondition ??
    (summary ? deriveDataQualityCondition(summary) : 'UNKNOWN');
  const activeSafetyEvidence =
    args.activeSafetyEvidence ?? (summary ? mapActiveSafetyEvidence(summary) : []);
  const lastSafetyEvidenceAt =
    args.lastSafetyEvidenceAt ??
    (activeSafetyEvidence.length > 0 ? args.lastDataReceivedAt : null);

  const lastUpdatedAt = toIso(
    maxIso(
      maxIso(args.lastMeasurementAt, lastSafetyEvidenceAt),
      maxIso(args.lastModelCalculatedAt, args.lastDataReceivedAt),
    ),
  );

  const dataStale =
    args.measurementFreshness === 'stale' ||
    args.modelFreshness === 'stale' ||
    isStale(lastUpdatedAt);

  const primaryReason = localizePrimaryReason(
    args.primaryReasonCode,
    'de',
    args.primaryDetail,
  );
  const primaryReasonEn = localizePrimaryReason(
    args.primaryReasonCode,
    'en',
    args.primaryDetail,
  );

  return {
    wearCondition,
    safetyCondition,
    dataQualityCondition,
    measurementFreshness: args.measurementFreshness,
    modelFreshness: args.modelFreshness,
    activeSafetyEvidence,
    confidence: summary?.confidenceLevel ?? 'UNKNOWN',
    reviewRequirement: args.reviewRequirement,
    rentalDecision: args.rentalDecision,
    blockingReasons: [...args.blockingReasons],
    rentalBlockingEvidence: args.rentalBlockingEvidence,
    structuredReasonCodes: [...new Set(args.reasonCodes)],
    activeReviewOverride: args.activeReviewOverride,
    hasWearOrSafetyAlert: summary ? hasWearOrSafetyAlert(summary.openAlerts ?? []) : false,
    primaryReason,
    primaryReasonEn,
    lastMeasurementAt: args.lastMeasurementAt,
    lastSafetyEvidenceAt,
    lastModelCalculatedAt: args.lastModelCalculatedAt,
    lastDataReceivedAt: args.lastDataReceivedAt,
    lastUpdatedAt,
    dataStale,
    source: 'brake_health',
    evidenceType: summary ? brakeDataBasisToEvidenceType(summary) : 'unknown',
  };
}

const DECISION_RANK: Record<BrakeRentalDecision, number> = {
  ALLOW: 0,
  WARNING: 1,
  DATA_QUALITY_WARNING: 2,
  MEASUREMENT_REQUIRED: 3,
  REVIEW_REQUIRED: 4,
  UNAVAILABLE: 5,
  HARD_BLOCK: 6,
};

function maxDecision(
  current: BrakeRentalDecision,
  next: BrakeRentalDecision,
): BrakeRentalDecision {
  return DECISION_RANK[next] >= DECISION_RANK[current] ? next : current;
}

export function isBrakeRentalHardBlocked(
  readModel: BrakeRentalHealthReadModel,
): boolean {
  return (
    readModel.rentalBlockingEvidence?.action === 'HARD_BLOCK' &&
    readModel.activeReviewOverride == null
  );
}

export function buildBrakeModuleHealth(
  input: BrakeRentalPolicyInput,
): BrakeRentalHealthModuleHealth {
  const readModel = buildBrakeRentalHealthReadModel(input);
  let state = rentalDecisionToHealthState(
    readModel.rentalDecision,
    readModel,
    input.summary,
  );

  // Unknown wear/safety must never present as good.
  if (
    state === 'good' &&
    (readModel.wearCondition === 'UNKNOWN' ||
      readModel.dataQualityCondition === 'UNKNOWN' ||
      readModel.rentalDecision === 'REVIEW_REQUIRED' ||
      readModel.rentalDecision === 'UNAVAILABLE' ||
      (!input.summary?.isInitialized && readModel.rentalDecision === 'MEASUREMENT_REQUIRED'))
  ) {
    state = 'unknown';
  }

  return {
    state,
    reason: readModel.primaryReason,
    last_updated_at: readModel.lastUpdatedAt,
    data_stale: readModel.dataStale,
    source: readModel.source,
    evidence_type: readModel.evidenceType,
    brake_read_model: readModel,
  };
}
