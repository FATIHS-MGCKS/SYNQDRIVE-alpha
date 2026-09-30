import { BatteryMeasurementQuality } from '@prisma/client';
import { BatteryMeasurementScope } from '../battery-v2-domain';
import { HV_M2_CAPACITY_METHOD } from '../hv-capacity-shadow/hv-capacity-m2.types';
import { HV_M3_CAPACITY_METHOD, HV_M3_METHOD_ROLE } from '../hv-capacity-shadow/hv-capacity-m3.types';
import { evaluateHvM3SessionGate } from '../hv-capacity-shadow/hv-capacity-m3.policy';
import type { HvChargeSessionMetadata } from '../hv-charge-session/hv-charge-session.types';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import { isHvH2LifecycleGroundTruthEvent } from './m3-3-hv-h2-ground-truth.util';
import { BatteryEvidenceScope } from '@prisma/client';
import {
  M3_3_HV_H2_LONGITUDINAL_INPUT_CANDIDATE_V1,
  M3_3_HV_H2_LONGITUDINAL_INPUT_REPORT_V1,
  M3_3_HV_H2_REPORT_TEMPORAL_SEMANTICS,
} from './m3-3-hv-h2.constants';
import {
  computeM3_3HvH2CandidateFingerprint,
  dedupeM3_3HvH2CandidatesByFingerprint,
} from './m3-3-hv-h2-fingerprint';
import {
  buildM3_3HvH2LifecycleSegments,
  resolveLifecycleSegmentForObservedAt,
  sessionCrossesReplacementBoundary,
  type HvH2ReplacementBoundary,
} from './m3-3-hv-h2-lifecycle-segmentation';
import type { M3_3HvH2LoadedDataV1 } from './m3-3-hv-h2-loaded-data.types';
import { mapHvChargeSessionToM3Input } from './m3-3-hv-h2-session-m3-input';
import {
  M3_3_HV_H2_ELIGIBILITY_REASONS,
  type M3_3HvH2EligibilityReasonCode,
  type M3_3HvH2LongitudinalInputCandidateV1,
  type M3_3HvH2LongitudinalInputReportV1,
  type M3_3HvH2ValidationAnchorV1,
} from './m3-3-hv-h2.types';

const MS_PER_DAY = 86_400_000;
const CURRENT_DECISION_FRESHNESS_DAYS = 30;

function parseObservationMetadata(metadata: unknown): {
  outlier: boolean;
  gateReasonCodes: string[];
  methodConflict: boolean;
} {
  const meta = metadata as {
    outlier?: boolean;
    gateReasonCodes?: string[];
    methodConflict?: boolean;
  } | null;
  return {
    outlier: meta?.outlier === true,
    gateReasonCodes: Array.isArray(meta?.gateReasonCodes)
      ? meta!.gateReasonCodes.filter((c) => typeof c === 'string')
      : [],
    methodConflict: meta?.methodConflict === true,
  };
}

function classifyFreshness(observedAt: Date, evaluationAt: Date): 'FRESH' | 'STALE' | 'UNKNOWN' {
  const ageMs = evaluationAt.getTime() - observedAt.getTime();
  if (!Number.isFinite(ageMs)) return 'UNKNOWN';
  if (ageMs < 0) return 'UNKNOWN';
  return ageMs <= CURRENT_DECISION_FRESHNESS_DAYS * MS_PER_DAY ? 'FRESH' : 'STALE';
}

function hvReplacementBoundaries(
  events: M3_3HvH2LoadedDataV1['groundTruthEvents'],
): HvH2ReplacementBoundary[] {
  return events
    .filter(
      (e) =>
        isHvH2LifecycleGroundTruthEvent(e) &&
        e.batteryScope === BatteryEvidenceScope.HV &&
        e.groundTruthType === 'BATTERY_REPLACEMENT',
    )
    .map((e) => ({
      effectiveAt: e.effectiveAt,
      groundTruthEventId: e.id,
    }));
}

function buildValidationAnchors(
  data: M3_3HvH2LoadedDataV1,
): M3_3HvH2ValidationAnchorV1[] {
  return data.groundTruthEvents
    .filter(
      (e) =>
        isHvH2LifecycleGroundTruthEvent(e) &&
        e.batteryScope === BatteryEvidenceScope.HV &&
        e.effectiveAt <= data.evaluationAt,
    )
    .map((e) => ({
      groundTruthEventId: e.id,
      organizationId: e.organizationId,
      vehicleId: e.vehicleId,
      batteryScope: BatteryMeasurementScope.HV,
      groundTruthType: e.groundTruthType,
      effectiveAt: e.effectiveAt.toISOString(),
      createdAt: e.createdAt.toISOString(),
      sourceProvenance: e.sourceAuthority,
      verificationStatus: e.verificationStatus,
      maturity: 'CONFIRMED_GROUND_TRUTH_FACT' as const,
    }));
}

function pushReason(codes: M3_3HvH2EligibilityReasonCode[], code: M3_3HvH2EligibilityReasonCode) {
  if (!codes.includes(code)) codes.push(code);
}

function buildM2Candidate(
  data: M3_3HvH2LoadedDataV1,
  obs: M3_3HvH2LoadedDataV1['capacityObservations'][number],
  replacementBoundaries: HvH2ReplacementBoundary[],
): M3_3HvH2LongitudinalInputCandidateV1 | null {
  if (obs.method !== HV_M2_CAPACITY_METHOD) return null;
  if (obs.organizationId !== data.organizationId || obs.vehicleId !== data.vehicleId) {
    return null;
  }

  const reasonCodes: M3_3HvH2EligibilityReasonCode[] = [];
  const meta = parseObservationMetadata(obs.metadata);
  const observedAt = obs.observedAt;
  if (!(observedAt instanceof Date) || Number.isNaN(observedAt.getTime())) {
    pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.OBSERVATION_TIMESTAMP_INVALID);
  }
  if (observedAt > data.evaluationAt) {
    pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.FUTURE_OBSERVATION_TIMESTAMP);
  }

  const lifecycle = resolveLifecycleSegmentForObservedAt({
    observedAt,
    replacementBoundaries,
  });
  if (lifecycle.onReplacementEffectiveAt) {
    pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.INTERVENTION_BOUNDARY_INTERSECTION);
  }

  let sessionId: string | null = obs.chargeSessionId;
  if (sessionId) {
    const session = data.sessionsById.get(sessionId);
    if (!session) {
      pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.SESSION_MISSING);
    } else if (
      session.organizationId !== data.organizationId ||
      session.vehicleId !== data.vehicleId
    ) {
      pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.SESSION_SCOPE_MISMATCH);
    } else {
      if (session.isOngoing) pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.SESSION_ONGOING);
      const sm = (session.metadata ?? {}) as unknown as HvChargeSessionMetadata;
      if (sm.qualityStatus !== HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED) {
        pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.SESSION_NOT_QUALIFIED);
      }
      if (
        sessionCrossesReplacementBoundary({
          sessionStartAt: session.startAt,
          sessionEndAt: session.endAt,
          replacementBoundaries,
        })
      ) {
        pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.INTERVENTION_BOUNDARY_INTERSECTION);
      }
    }
  }

  if (meta.outlier) pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.M2_OUTLIER);
  if (meta.gateReasonCodes.length > 0) {
    pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.M2_GATE_BLOCKED);
  }
  if (
    obs.quality === BatteryMeasurementQuality.INSUFFICIENT_COVERAGE ||
    obs.quality === BatteryMeasurementQuality.NO_DATA
  ) {
    pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.M2_GATE_BLOCKED);
  }

  const numericValue = obs.estimatedCapacityKwh;
  if (numericValue == null) {
    pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.VALUE_MISSING);
  } else if (!Number.isFinite(numericValue)) {
    pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.VALUE_NON_FINITE);
  }

  const eligibility = reasonCodes.length === 0 ? 'eligible' : 'ineligible';
  const freshness = classifyFreshness(observedAt, data.evaluationAt);

  const candidate: M3_3HvH2LongitudinalInputCandidateV1 = {
    contractVersion: M3_3_HV_H2_LONGITUDINAL_INPUT_CANDIDATE_V1,
    organizationId: data.organizationId,
    vehicleId: data.vehicleId,
    batteryScope: BatteryMeasurementScope.HV,
    candidateFingerprint: '',
    sourceEntityType: 'HvCapacityObservation',
    sourceEntityId: obs.id,
    method: 'M2_CURRENT_ENERGY_SOC',
    methodRole: 'METHOD_SHADOW_EVIDENCE',
    valueSemantic: 'ESTIMATED_USABLE_CAPACITY_KWH',
    numericValue: numericValue ?? NaN,
    unit: 'kWh',
    observedAt: observedAt.toISOString(),
    receivedAt: obs.receivedAt?.toISOString() ?? null,
    sessionId,
    provider: null,
    quality: obs.quality,
    freshness,
    evidenceStrength:
      obs.quality === BatteryMeasurementQuality.SHADOW ||
      obs.quality === BatteryMeasurementQuality.VALID
        ? 'STRONG'
        : 'WEAK',
    modelVersion: obs.modelVersion,
    sourceProvenance: 'hv_capacity_shadow_m2',
    eligibility,
    reasonCodes,
    lifecycleSegmentId: lifecycle.lifecycleSegmentId,
    replacementBoundaryBeforeAt: lifecycle.replacementBoundaryBeforeAt,
    replacementBoundaryAfterAt: lifecycle.replacementBoundaryAfterAt,
    maturity: 'LONGITUDINAL_INPUT_CANDIDATE',
    healthConclusion: null,
    observationValidity: eligibility === 'eligible' ? 'VALID' : 'INVALID',
    currentDecisionFreshness: freshness,
    referenceCapacityKwh: obs.referenceCapacityKwh,
    deltaSocPercent: null,
    deltaEnergyKwh: null,
  };

  candidate.candidateFingerprint = computeM3_3HvH2CandidateFingerprint({
    organizationId: candidate.organizationId,
    vehicleId: candidate.vehicleId,
    batteryScope: candidate.batteryScope,
    method: candidate.method,
    sourceEntityType: candidate.sourceEntityType,
    sourceEntityId: candidate.sourceEntityId,
    observedAt: candidate.observedAt,
    modelVersion: candidate.modelVersion,
    valueSemantic: candidate.valueSemantic,
    lifecycleSegmentId: candidate.lifecycleSegmentId,
  });

  return candidate;
}

function buildM3Candidate(
  data: M3_3HvH2LoadedDataV1,
  obs: M3_3HvH2LoadedDataV1['capacityObservations'][number],
  replacementBoundaries: HvH2ReplacementBoundary[],
): M3_3HvH2LongitudinalInputCandidateV1 | null {
  if (obs.method !== HV_M3_CAPACITY_METHOD) return null;

  const reasonCodes: M3_3HvH2EligibilityReasonCode[] = [];
  const meta = parseObservationMetadata(obs.metadata);
  const observedAt = obs.observedAt;
  if (observedAt > data.evaluationAt) {
    pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.FUTURE_OBSERVATION_TIMESTAMP);
  }

  const lifecycle = resolveLifecycleSegmentForObservedAt({
    observedAt,
    replacementBoundaries,
  });
  if (lifecycle.onReplacementEffectiveAt) {
    pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.INTERVENTION_BOUNDARY_INTERSECTION);
  }

  const sessionId = obs.chargeSessionId;
  if (!sessionId) {
    pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.SESSION_MISSING);
  } else {
    const session = data.sessionsById.get(sessionId);
    if (!session) {
      pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.SESSION_MISSING);
    } else {
      if (
        session.organizationId !== data.organizationId ||
        session.vehicleId !== data.vehicleId
      ) {
        pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.SESSION_SCOPE_MISMATCH);
      }
      const sm = (session.metadata ?? {}) as unknown as HvChargeSessionMetadata;
      const gate = evaluateHvM3SessionGate(mapHvChargeSessionToM3Input(session, sm));
      if (!gate.eligible) {
        pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.M3_GATE_BLOCKED);
      }
      if (
        sessionCrossesReplacementBoundary({
          sessionStartAt: session.startAt,
          sessionEndAt: session.endAt,
          replacementBoundaries,
        })
      ) {
        pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.INTERVENTION_BOUNDARY_INTERSECTION);
      }
    }
  }

  if (meta.methodConflict) {
    pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.M3_METHOD_CONFLICT);
  }
  if (meta.gateReasonCodes.length > 0) {
    pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.M3_GATE_BLOCKED);
  }
  if (
    obs.quality === BatteryMeasurementQuality.INSUFFICIENT_COVERAGE ||
    obs.quality === BatteryMeasurementQuality.NO_DATA
  ) {
    pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.M3_GATE_BLOCKED);
  }

  const numericValue = obs.estimatedCapacityKwh;
  if (numericValue == null || !Number.isFinite(numericValue)) {
    pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.VALUE_MISSING);
  }

  const eligibility = reasonCodes.length === 0 ? 'eligible' : 'ineligible';
  const freshness = classifyFreshness(observedAt, data.evaluationAt);

  const candidate: M3_3HvH2LongitudinalInputCandidateV1 = {
    contractVersion: M3_3_HV_H2_LONGITUDINAL_INPUT_CANDIDATE_V1,
    organizationId: data.organizationId,
    vehicleId: data.vehicleId,
    batteryScope: BatteryMeasurementScope.HV,
    candidateFingerprint: '',
    sourceEntityType: 'HvCapacityObservation',
    sourceEntityId: obs.id,
    method: 'M3_ADDED_ENERGY_DELTA_SOC',
    methodRole: 'VALIDATION_ONLY',
    valueSemantic: 'ESTIMATED_USABLE_CAPACITY_KWH',
    numericValue: numericValue ?? NaN,
    unit: 'kWh',
    observedAt: observedAt.toISOString(),
    receivedAt: obs.receivedAt?.toISOString() ?? null,
    sessionId: sessionId ?? null,
    provider: null,
    quality: obs.quality,
    freshness,
    evidenceStrength:
      obs.quality === BatteryMeasurementQuality.VALID_PROXY ||
      obs.quality === BatteryMeasurementQuality.VALID
        ? 'STRONG'
        : 'WEAK',
    modelVersion: obs.modelVersion,
    sourceProvenance: `hv_capacity_shadow_m3:${HV_M3_METHOD_ROLE}`,
    eligibility,
    reasonCodes,
    lifecycleSegmentId: lifecycle.lifecycleSegmentId,
    replacementBoundaryBeforeAt: lifecycle.replacementBoundaryBeforeAt,
    replacementBoundaryAfterAt: lifecycle.replacementBoundaryAfterAt,
    maturity: 'LONGITUDINAL_INPUT_CANDIDATE',
    healthConclusion: null,
    observationValidity: eligibility === 'eligible' ? 'VALID' : 'INVALID',
    currentDecisionFreshness: freshness,
    referenceCapacityKwh: obs.referenceCapacityKwh,
    deltaSocPercent: obs.deltaSocPercent,
    deltaEnergyKwh: obs.deltaEnergyKwh,
  };

  candidate.candidateFingerprint = computeM3_3HvH2CandidateFingerprint({
    organizationId: candidate.organizationId,
    vehicleId: candidate.vehicleId,
    batteryScope: candidate.batteryScope,
    method: candidate.method,
    sourceEntityType: candidate.sourceEntityType,
    sourceEntityId: candidate.sourceEntityId,
    observedAt: candidate.observedAt,
    modelVersion: candidate.modelVersion,
    valueSemantic: candidate.valueSemantic,
    lifecycleSegmentId: candidate.lifecycleSegmentId,
  });

  return candidate;
}

function buildProviderSohCandidate(
  data: M3_3HvH2LoadedDataV1,
  row: M3_3HvH2LoadedDataV1['providerSohEvidence'][number],
  replacementBoundaries: HvH2ReplacementBoundary[],
): M3_3HvH2LongitudinalInputCandidateV1 {
  const reasonCodes: M3_3HvH2EligibilityReasonCode[] = [];
  const observedAt = row.observedAt;
  if (observedAt > data.evaluationAt) {
    pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.FUTURE_OBSERVATION_TIMESTAMP);
  }
  if (row.vehicleId !== data.vehicleId) {
    pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.SOURCE_SCOPE_MISMATCH);
  }
  if (!row.provider) {
    pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.PROVIDER_PROVENANCE_MISSING);
  }
  const numericValue = row.numericValue;
  if (!Number.isFinite(numericValue)) {
    pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.VALUE_NON_FINITE);
  } else if (numericValue < 0 || numericValue > 100) {
    pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.PROVIDER_SOH_RANGE_INVALID);
  }

  const lifecycle = resolveLifecycleSegmentForObservedAt({
    observedAt,
    replacementBoundaries,
  });
  if (lifecycle.onReplacementEffectiveAt) {
    pushReason(reasonCodes, M3_3_HV_H2_ELIGIBILITY_REASONS.INTERVENTION_BOUNDARY_INTERSECTION);
  }

  const eligibility = reasonCodes.length === 0 ? 'eligible' : 'ineligible';
  const freshness = classifyFreshness(observedAt, data.evaluationAt);

  const candidate: M3_3HvH2LongitudinalInputCandidateV1 = {
    contractVersion: M3_3_HV_H2_LONGITUDINAL_INPUT_CANDIDATE_V1,
    organizationId: data.organizationId,
    vehicleId: data.vehicleId,
    batteryScope: BatteryMeasurementScope.HV,
    candidateFingerprint: '',
    sourceEntityType: 'BatteryEvidence',
    sourceEntityId: row.id,
    method: 'PROVIDER_HV_SOH',
    methodRole: 'PROVIDER_EVIDENCE',
    valueSemantic: 'PROVIDER_SOH_PERCENT',
    numericValue,
    unit: row.unit ?? 'percent',
    observedAt: observedAt.toISOString(),
    receivedAt: row.createdAt?.toISOString() ?? null,
    sessionId: null,
    provider: row.provider,
    quality: row.quality ?? 'UNKNOWN',
    freshness,
    evidenceStrength: row.sourceType === 'PROVIDER_REPORTED' ? 'STRONG' : 'WEAK',
    modelVersion: 1,
    sourceProvenance: `BatteryEvidence:${row.sourceType}`,
    eligibility,
    reasonCodes,
    lifecycleSegmentId: lifecycle.lifecycleSegmentId,
    replacementBoundaryBeforeAt: lifecycle.replacementBoundaryBeforeAt,
    replacementBoundaryAfterAt: lifecycle.replacementBoundaryAfterAt,
    maturity: 'LONGITUDINAL_INPUT_CANDIDATE',
    healthConclusion: null,
    observationValidity: eligibility === 'eligible' ? 'VALID' : 'INVALID',
    currentDecisionFreshness: freshness,
  };

  candidate.candidateFingerprint = computeM3_3HvH2CandidateFingerprint({
    organizationId: candidate.organizationId,
    vehicleId: candidate.vehicleId,
    batteryScope: candidate.batteryScope,
    method: candidate.method,
    sourceEntityType: candidate.sourceEntityType,
    sourceEntityId: candidate.sourceEntityId,
    observedAt: candidate.observedAt,
    modelVersion: candidate.modelVersion,
    valueSemantic: candidate.valueSemantic,
    lifecycleSegmentId: candidate.lifecycleSegmentId,
  });

  return candidate;
}

function countMultiPointSeries(candidates: M3_3HvH2LongitudinalInputCandidateV1[]): boolean {
  const bySegmentMethod = new Map<string, number>();
  for (const c of candidates) {
    if (c.eligibility !== 'eligible') continue;
    const key = `${c.lifecycleSegmentId}|${c.method}`;
    bySegmentMethod.set(key, (bySegmentMethod.get(key) ?? 0) + 1);
  }
  return [...bySegmentMethod.values()].some((n) => n >= 2);
}

export function buildM3_3HvH2LongitudinalInputReportV1(
  data: M3_3HvH2LoadedDataV1,
): M3_3HvH2LongitudinalInputReportV1 {
  const replacementBoundaries = hvReplacementBoundaries(data.groundTruthEvents);
  const lifecycleSegments = buildM3_3HvH2LifecycleSegments(replacementBoundaries);
  const validationAnchors = buildValidationAnchors(data);

  const rawCandidates: M3_3HvH2LongitudinalInputCandidateV1[] = [];

  for (const obs of data.capacityObservations) {
    if (obs.observedAt > data.evaluationAt) continue;
    const m2 = buildM2Candidate(data, obs, replacementBoundaries);
    if (m2) rawCandidates.push(m2);
    const m3 = buildM3Candidate(data, obs, replacementBoundaries);
    if (m3) rawCandidates.push(m3);
  }

  for (const row of data.providerSohEvidence) {
    if (row.observedAt > data.evaluationAt) continue;
    rawCandidates.push(buildProviderSohCandidate(data, row, replacementBoundaries));
  }

  const candidates = dedupeM3_3HvH2CandidatesByFingerprint(rawCandidates);

  const eligible = candidates.filter((c) => c.eligibility === 'eligible');
  const m2Eligible = eligible.filter((c) => c.method === 'M2_CURRENT_ENERGY_SOC');
  const m3Eligible = eligible.filter((c) => c.method === 'M3_ADDED_ENERGY_DELTA_SOC');
  const sohEligible = eligible.filter((c) => c.method === 'PROVIDER_HV_SOH');

  const truncated =
    data.truncated.capacityObservations ||
    data.truncated.providerSoh ||
    data.truncated.groundTruth ||
    data.truncated.sessions;

  return {
    contractVersion: M3_3_HV_H2_LONGITUDINAL_INPUT_REPORT_V1,
    organizationId: data.organizationId,
    vehicleId: data.vehicleId,
    batteryScope: BatteryMeasurementScope.HV,
    evaluationAt: data.evaluationAt.toISOString(),
    temporalSemantics: M3_3_HV_H2_REPORT_TEMPORAL_SEMANTICS,
    truncated,
    lifecycleSegments,
    candidates,
    validationAnchors,
    derivedContext: [],
    summary: {
      candidateCount: candidates.length,
      eligibleCandidateCount: eligible.length,
      ineligibleCandidateCount: candidates.length - eligible.length,
      m2Count: candidates.filter((c) => c.method === 'M2_CURRENT_ENERGY_SOC').length,
      m3Count: candidates.filter((c) => c.method === 'M3_ADDED_ENERGY_DELTA_SOC').length,
      providerSohCount: candidates.filter((c) => c.method === 'PROVIDER_HV_SOH').length,
      lifecycleSegmentCount: lifecycleSegments.length,
      replacementBoundaryCount: replacementBoundaries.length,
      m2LongitudinalReady: m2Eligible.length >= 1,
      m3ValidationSeriesReady: m3Eligible.length >= 1,
      providerSohLongitudinalReady: sohEligible.length >= 1,
      multiPointSeriesPresent: countMultiPointSeries(candidates),
    },
    methodIdentityRequired: true,
    crossMethodPoolingDefault: false,
    healthConclusion: null,
    customerPublicationEligible: false,
    dbReadOnlyTransactionEnforced: true,
  };
}
