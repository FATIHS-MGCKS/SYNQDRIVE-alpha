import { BatteryMeasurementQuality } from '@prisma/client';
import type {
  RestTargetEvaluationConstraints,
  RestTargetEvaluationPolicy,
  RestTargetEvaluationResult,
  RestTargetObservationCandidate,
} from './battery-rest-target-evaluation';
import {
  detectWakeFlankMeasurementIds,
  evaluateRestTargetRetryState,
  hasActualProviderTimestamp,
  isObservationAfterTripStart,
  isObservationWithinTargetWindow,
  isPlausibleRestVoltage,
  isRestTargetWakeVoltage,
  toRestTargetSignalContext,
} from './battery-rest-target-evaluation';
import {
  isEngineOffForRest,
  isSpeedAtRest,
} from './lv-rest-window.policy';

/** Proxy band extends beyond strict VALID window (audit: outside ±15m → VALID_PROXY or MISSED). */
export const REST_TARGET_PROXY_WINDOW_MULTIPLIER = 2;

export const LV_REST_MEASUREMENT_QUALITY_REASONS = {
  valid_rest_observation: {
    code: 'valid_rest_observation',
    labelDe: 'Ruhemessung gültig',
  },
  valid_proxy_outside_strict_window: {
    code: 'valid_proxy_outside_strict_window',
    labelDe: 'Ruhemessung außerhalb des strengen Fensters (Proxy)',
  },
  valid_proxy_voltage_suspicion: {
    code: 'valid_proxy_voltage_suspicion',
    labelDe: 'Erhöhte Spannung ohne belastbaren Lade-/Wake-Kontext (Proxy)',
  },
  contaminated_by_charging: {
    code: 'contaminated_by_charging',
    labelDe: 'Ruhemessung durch Laden kontaminiert',
  },
  contaminated_by_wake: {
    code: 'contaminated_by_wake',
    labelDe: 'Ruhemessung durch Aufwachen kontaminiert',
  },
  contaminated_by_active_trip: {
    code: 'contaminated_by_active_trip',
    labelDe: 'Fahrzeug nicht in Ruhe (aktiver Trip)',
  },
  stale_provider_replay: {
    code: 'stale_provider_replay',
    labelDe: 'Veralteter Provider-Timestamp (Stale Replay)',
  },
  timestamp_inconsistent: {
    code: 'timestamp_inconsistent',
    labelDe: 'Inkonsistente Provider-Zeitstempel',
  },
  missing_rest_context: {
    code: 'missing_rest_context',
    labelDe: 'Ruhekontext unvollständig',
  },
  missed_no_valid_observation: {
    code: 'missed_no_valid_observation',
    labelDe: 'Keine gültige Ruhemessung im Zielzeitfenster',
  },
  provider_delay_pending: {
    code: 'provider_delay_pending',
    labelDe: 'Provider-Verzögerung — Messung noch ausstehend',
  },
  provider_error: {
    code: 'provider_error',
    labelDe: 'Provider-Fehler bei der Ruhemessung',
  },
  unsupported_profile: {
    code: 'unsupported_profile',
    labelDe: 'Ruhemessung für dieses Fahrzeugprofil nicht unterstützt',
  },
} as const;

export type LvRestMeasurementQualityReasonCode =
  (typeof LV_REST_MEASUREMENT_QUALITY_REASONS)[keyof typeof LV_REST_MEASUREMENT_QUALITY_REASONS]['code'];

export interface LvRestMeasurementQualityClassification {
  quality: BatteryMeasurementQuality;
  reasonCode: LvRestMeasurementQualityReasonCode;
  reasonLabel: string;
  evidenceEligible: boolean;
  publicationEligible: false;
  strictWindow: boolean;
  proxyWindow: boolean;
}

export interface LvRestMeasurementQualityPolicy extends RestTargetEvaluationPolicy {
  chargingVoltageThreshold?: number;
}

const TIMESTAMP_SKEW_MS = 5 * 60_000;

const CONTAMINATED_QUALITIES = new Set<BatteryMeasurementQuality>([
  BatteryMeasurementQuality.CONTAMINATED_BY_WAKE,
  BatteryMeasurementQuality.CONTAMINATED_BY_CHARGING,
  BatteryMeasurementQuality.CONTAMINATED_BY_ACTIVE_TRIP,
]);

export function isLvRestMeasurementEvidenceEligible(
  quality: BatteryMeasurementQuality,
): boolean {
  return (
    quality === BatteryMeasurementQuality.VALID ||
    quality === BatteryMeasurementQuality.VALID_PROXY
  );
}

export function isLvRestMeasurementPublicationEligible(): false {
  return false;
}

export function isLvRestMeasurementContaminated(
  quality: BatteryMeasurementQuality,
): boolean {
  return CONTAMINATED_QUALITIES.has(quality);
}

export function getRestTargetProxyWindowMs(windowMs: number): number {
  return windowMs * REST_TARGET_PROXY_WINDOW_MULTIPLIER;
}

export function isObservationWithinProxyWindow(
  observedAt: Date,
  policy: RestTargetEvaluationPolicy,
): boolean {
  const proxyMs = getRestTargetProxyWindowMs(policy.windowAfterMs);
  const startMs = policy.targetAt.getTime() - proxyMs;
  const endMs = policy.targetAt.getTime() + proxyMs;
  const t = observedAt.getTime();
  return t >= startMs && t <= endMs;
}

function classifyResult(
  quality: BatteryMeasurementQuality,
  reason: keyof typeof LV_REST_MEASUREMENT_QUALITY_REASONS,
  strictWindow: boolean,
  proxyWindow: boolean,
): LvRestMeasurementQualityClassification {
  const meta = LV_REST_MEASUREMENT_QUALITY_REASONS[reason];
  return {
    quality,
    reasonCode: meta.code,
    reasonLabel: meta.labelDe,
    evidenceEligible: isLvRestMeasurementEvidenceEligible(quality),
    publicationEligible: false,
    strictWindow,
    proxyWindow,
  };
}

function isStaleProviderReplay(candidate: RestTargetObservationCandidate): boolean {
  const outcome = candidate.context?.providerObservationOutcome?.trim().toUpperCase();
  return outcome === 'STALE_REPLAY' || outcome === 'DUPLICATE_OBSERVATION';
}

function isTimestampInconsistent(candidate: RestTargetObservationCandidate): boolean {
  const outcome = candidate.context?.providerObservationOutcome?.trim().toUpperCase();
  if (outcome === 'VALUE_CHANGED_WITHOUT_NEW_TIMESTAMP') {
    return true;
  }
  if (!candidate.providerTimestamp) {
    return false;
  }
  const skew = Math.abs(
    candidate.observedAt.getTime() - candidate.providerTimestamp.getTime(),
  );
  return skew > TIMESTAMP_SKEW_MS;
}

function isMissingRestContext(
  candidate: RestTargetObservationCandidate,
  policy: LvRestMeasurementQualityPolicy,
): boolean {
  const ctx = candidate.context ?? {};
  if (ctx.providerError === true) {
    return false;
  }
  if (ctx.speedKmh == null) {
    return true;
  }
  if (policy.restRequiresEngineOff) {
    if (ctx.ignitionOn == null && ctx.engineRunning == null) {
      return true;
    }
  }
  return false;
}

function hasWakeContaminationContext(
  candidate: RestTargetObservationCandidate,
  policy: LvRestMeasurementQualityPolicy,
  wakeFlankIds: Set<string>,
): boolean {
  if (wakeFlankIds.has(candidate.measurementId)) {
    return true;
  }
  if (!isRestTargetWakeVoltage(candidate.numericValue, policy.wakeVoltageThreshold)) {
    return false;
  }
  const ctx = candidate.context ?? {};
  return (
    ctx.ignitionOn === true ||
    ctx.engineRunning === true ||
    ctx.hasActiveTrip === true
  );
}

function hasChargingContaminationContext(
  candidate: RestTargetObservationCandidate,
): boolean {
  const ctx = candidate.context ?? {};
  return ctx.isLvCharging === true || ctx.isHvCharging === true;
}

function hasVoltageSuspicionWithoutContamination(
  candidate: RestTargetObservationCandidate,
  policy: LvRestMeasurementQualityPolicy,
  wakeFlankIds: Set<string>,
): boolean {
  if (candidate.numericValue <= policy.maxRestingVoltage) {
    return false;
  }
  return (
    !hasChargingContaminationContext(candidate) &&
    !hasWakeContaminationContext(candidate, policy, wakeFlankIds)
  );
}

export function classifyLvRestObservationQuality(input: {
  candidate: RestTargetObservationCandidate;
  policy: LvRestMeasurementQualityPolicy;
  constraints?: RestTargetEvaluationConstraints;
  wakeFlankIds?: Set<string>;
}): LvRestMeasurementQualityClassification {
  const constraints = input.constraints ?? {};
  const wakeFlankIds =
    input.wakeFlankIds ??
    detectWakeFlankMeasurementIds(
      [input.candidate],
      input.policy.wakeVoltageThreshold,
    );
  const strictWindow = isObservationWithinTargetWindow(
    input.candidate.observedAt,
    input.policy,
  );
  const proxyWindow = isObservationWithinProxyWindow(
    input.candidate.observedAt,
    input.policy,
  );

  if (input.candidate.context?.providerError === true) {
    return classifyResult(
      BatteryMeasurementQuality.PROVIDER_ERROR,
      'provider_error',
      strictWindow,
      proxyWindow,
    );
  }

  if (!hasActualProviderTimestamp(input.candidate)) {
    return classifyResult(
      BatteryMeasurementQuality.MISSING_CONTEXT,
      'missing_rest_context',
      strictWindow,
      proxyWindow,
    );
  }

  if (isStaleProviderReplay(input.candidate)) {
    return classifyResult(
      BatteryMeasurementQuality.STALE,
      'stale_provider_replay',
      strictWindow,
      proxyWindow,
    );
  }

  if (isTimestampInconsistent(input.candidate)) {
    return classifyResult(
      BatteryMeasurementQuality.TIMESTAMP_INCONSISTENT,
      'timestamp_inconsistent',
      strictWindow,
      proxyWindow,
    );
  }

  if (isMissingRestContext(input.candidate, input.policy)) {
    return classifyResult(
      BatteryMeasurementQuality.MISSING_CONTEXT,
      'missing_rest_context',
      strictWindow,
      proxyWindow,
    );
  }

  if (!isPlausibleRestVoltage(input.candidate.numericValue)) {
    return classifyResult(
      BatteryMeasurementQuality.MISSING_CONTEXT,
      'missing_rest_context',
      strictWindow,
      proxyWindow,
    );
  }

  const signal = toRestTargetSignalContext(input.candidate);
  if (
    signal.hasActiveTrip ||
    isObservationAfterTripStart(
      input.candidate.observedAt,
      constraints.tripStartsAfterAnchor ?? [],
    )
  ) {
    return classifyResult(
      BatteryMeasurementQuality.CONTAMINATED_BY_ACTIVE_TRIP,
      'contaminated_by_active_trip',
      strictWindow,
      proxyWindow,
    );
  }

  if (hasWakeContaminationContext(input.candidate, input.policy, wakeFlankIds)) {
    return classifyResult(
      BatteryMeasurementQuality.CONTAMINATED_BY_WAKE,
      'contaminated_by_wake',
      strictWindow,
      proxyWindow,
    );
  }

  if (hasChargingContaminationContext(input.candidate)) {
    return classifyResult(
      BatteryMeasurementQuality.CONTAMINATED_BY_CHARGING,
      'contaminated_by_charging',
      strictWindow,
      proxyWindow,
    );
  }

  if (!proxyWindow) {
    return classifyResult(
      BatteryMeasurementQuality.MISSED,
      'missed_no_valid_observation',
      strictWindow,
      proxyWindow,
    );
  }

  if (!strictWindow) {
    return classifyResult(
      BatteryMeasurementQuality.VALID_PROXY,
      'valid_proxy_outside_strict_window',
      strictWindow,
      proxyWindow,
    );
  }

  if (!isSpeedAtRest(signal.speedKmh)) {
    return classifyResult(
      BatteryMeasurementQuality.CONTAMINATED_BY_ACTIVE_TRIP,
      'contaminated_by_active_trip',
      strictWindow,
      proxyWindow,
    );
  }

  if (!isEngineOffForRest(signal, input.policy.restRequiresEngineOff)) {
    return classifyResult(
      BatteryMeasurementQuality.CONTAMINATED_BY_ACTIVE_TRIP,
      'contaminated_by_active_trip',
      strictWindow,
      proxyWindow,
    );
  }

  if (hasVoltageSuspicionWithoutContamination(input.candidate, input.policy, wakeFlankIds)) {
    return classifyResult(
      BatteryMeasurementQuality.VALID_PROXY,
      'valid_proxy_voltage_suspicion',
      strictWindow,
      proxyWindow,
    );
  }

  return classifyResult(
    BatteryMeasurementQuality.VALID,
    'valid_rest_observation',
    strictWindow,
    proxyWindow,
  );
}

export interface ClassifiedRestTargetObservation {
  candidate: RestTargetObservationCandidate;
  classification: LvRestMeasurementQualityClassification;
}

const PICK_PRIORITY: BatteryMeasurementQuality[] = [
  BatteryMeasurementQuality.VALID,
  BatteryMeasurementQuality.VALID_PROXY,
  BatteryMeasurementQuality.STALE,
  BatteryMeasurementQuality.TIMESTAMP_INCONSISTENT,
  BatteryMeasurementQuality.MISSING_CONTEXT,
  BatteryMeasurementQuality.CONTAMINATED_BY_CHARGING,
  BatteryMeasurementQuality.CONTAMINATED_BY_WAKE,
  BatteryMeasurementQuality.CONTAMINATED_BY_ACTIVE_TRIP,
];

function pickPriority(quality: BatteryMeasurementQuality): number {
  const index = PICK_PRIORITY.indexOf(quality);
  return index === -1 ? PICK_PRIORITY.length : index;
}

export function classifyRestTargetCandidates(input: {
  candidates: RestTargetObservationCandidate[];
  policy: LvRestMeasurementQualityPolicy;
  constraints?: RestTargetEvaluationConstraints;
}): ClassifiedRestTargetObservation[] {
  const wakeFlankIds = detectWakeFlankMeasurementIds(
    input.candidates,
    input.policy.wakeVoltageThreshold,
  );
  const excluded = new Set(input.constraints?.excludedSourceMeasurementIds ?? []);

  return input.candidates
    .filter((candidate) => !excluded.has(candidate.measurementId))
    .map((candidate) => ({
      candidate,
      classification: classifyLvRestObservationQuality({
        candidate,
        policy: input.policy,
        constraints: input.constraints,
        wakeFlankIds,
      }),
    }));
}

export function selectClassifiedRestTargetObservation(input: {
  candidates: RestTargetObservationCandidate[];
  policy: LvRestMeasurementQualityPolicy;
  constraints?: RestTargetEvaluationConstraints;
}): ClassifiedRestTargetObservation | null {
  const classified = classifyRestTargetCandidates(input);
  const evidenceCapable = classified.filter((row) =>
    isLvRestMeasurementEvidenceEligible(row.classification.quality),
  );

  if (evidenceCapable.length === 0) {
    if (classified.length === 0) {
      return null;
    }
    const targetMs = input.policy.targetAt.getTime();
    classified.sort((a, b) => {
      const priority =
        pickPriority(a.classification.quality) -
        pickPriority(b.classification.quality);
      if (priority !== 0) return priority;
      return (
        Math.abs(a.candidate.observedAt.getTime() - targetMs) -
        Math.abs(b.candidate.observedAt.getTime() - targetMs)
      );
    });
    return classified[0];
  }

  const targetMs = input.policy.targetAt.getTime();
  evidenceCapable.sort((a, b) => {
    const priority =
      pickPriority(a.classification.quality) -
      pickPriority(b.classification.quality);
    if (priority !== 0) return priority;
    return (
      Math.abs(a.candidate.observedAt.getTime() - targetMs) -
      Math.abs(b.candidate.observedAt.getTime() - targetMs)
    );
  });
  return evidenceCapable[0];
}

export function classifyLvRestSessionOutcome(input: {
  unsupportedProfile?: boolean;
  providerError?: boolean;
  retryable?: boolean;
  missed?: boolean;
}): LvRestMeasurementQualityClassification {
  if (input.unsupportedProfile) {
    return classifyResult(
      BatteryMeasurementQuality.UNSUPPORTED_PROFILE,
      'unsupported_profile',
      false,
      false,
    );
  }
  if (input.providerError) {
    return classifyResult(
      BatteryMeasurementQuality.PROVIDER_ERROR,
      'provider_error',
      false,
      false,
    );
  }
  if (input.retryable) {
    return classifyResult(
      BatteryMeasurementQuality.PROVIDER_DELAY,
      'provider_delay_pending',
      false,
      false,
    );
  }
  return classifyResult(
    BatteryMeasurementQuality.MISSED,
    'missed_no_valid_observation',
    false,
    false,
  );
}

export function evaluateClassifiedRestTargetOutcome(input: {
  candidates: RestTargetObservationCandidate[];
  policy: LvRestMeasurementQualityPolicy;
  constraints?: RestTargetEvaluationConstraints;
  now?: Date;
  retryGraceMs: number;
}): RestTargetEvaluationResult {
  const selected = selectClassifiedRestTargetObservation(input);

  if (
    selected &&
    isLvRestMeasurementEvidenceEligible(selected.classification.quality)
  ) {
    return {
      ok: true,
      reason: 'observation_selected',
      selected: selected.candidate,
      quality: selected.classification.quality,
      reasonCode: selected.classification.reasonCode,
      reasonLabel: selected.classification.reasonLabel,
      evidenceEligible: selected.classification.evidenceEligible,
    };
  }

  const now = input.now ?? new Date();
  const retry = evaluateRestTargetRetryState({
    now,
    targetAt: input.policy.targetAt,
    qualityWindowAfterMs: input.policy.windowAfterMs,
    retryGraceMs: input.retryGraceMs,
    hasSelection: false,
  });

  if (retry.retryable) {
    const session = classifyLvRestSessionOutcome({ retryable: true });
    return {
      ok: false,
      reason: 'no_eligible_observation_in_target_window',
      retryable: true,
      missed: false,
      sessionQuality: session.quality,
      reasonCode: session.reasonCode,
      reasonLabel: session.reasonLabel,
    };
  }

  if (selected && isLvRestMeasurementContaminated(selected.classification.quality)) {
    return {
      ok: true,
      reason: 'observation_selected',
      selected: selected.candidate,
      quality: selected.classification.quality,
      reasonCode: selected.classification.reasonCode,
      reasonLabel: selected.classification.reasonLabel,
      evidenceEligible: false,
    };
  }

  if (selected) {
    return {
      ok: true,
      reason: 'observation_selected',
      selected: selected.candidate,
      quality: selected.classification.quality,
      reasonCode: selected.classification.reasonCode,
      reasonLabel: selected.classification.reasonLabel,
      evidenceEligible: selected.classification.evidenceEligible,
    };
  }

  const session = classifyLvRestSessionOutcome({ missed: true });
  return {
    ok: false,
    reason: 'no_eligible_observation_in_target_window',
    retryable: false,
    missed: true,
    sessionQuality: session.quality,
    reasonCode: session.reasonCode,
    reasonLabel: session.reasonLabel,
  };
}
