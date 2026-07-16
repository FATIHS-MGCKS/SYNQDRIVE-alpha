import { HvCapacityMethod } from '../battery-v2-domain';
import { HV_M2_SESSION_SUMMARY_STATUSES } from './hv-capacity-session-summary.types';
import { HV_M2_MODEL_VERSION } from './hv-capacity-m2.types';
import {
  HV_CROSS_SESSION_ASSESSMENT_MODEL_VERSION,
  HV_CROSS_SESSION_CONFIDENCE,
  HV_CROSS_SESSION_GATE_REASONS,
  HV_CROSS_SESSION_MATURITY_SHADOW,
  HV_CROSS_SESSION_MAX_DOMINANT_SESSION_OBSERVATION_RATIO,
  HV_CROSS_SESSION_MAX_INTRA_SESSION_CV,
  HV_CROSS_SESSION_MAX_M3_CONFLICT_SESSIONS,
  HV_CROSS_SESSION_MAX_SESSION_MEDIAN_CV,
  HV_CROSS_SESSION_MIN_QUALIFIED_SESSIONS,
  HV_CROSS_SESSION_FRESHNESS_MS,
  HV_CROSS_SESSION_SCORE_SEMANTICS,
  type HvCrossSessionAssessment,
  type HvCrossSessionAssessmentReason,
  type HvCrossSessionConfidence,
  type HvCrossSessionGateReasonCode,
  type HvCrossSessionInputSession,
  type HvCrossSessionMethodAgreement,
  type HvCrossSessionSpreadStats,
  type HvCrossSessionVehicleContext,
} from './hv-capacity-cross-session.types';

const MAD_NORMAL_CONSISTENCY_FACTOR = 1.4826;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function mad(values: number[], center: number): number | null {
  if (values.length === 0) return null;
  return median(values.map((value) => Math.abs(value - center)));
}

function coefficientOfVariation(values: number[], center: number | null): number | null {
  if (values.length === 0 || center == null || center <= 0) return null;
  const variance =
    values.reduce((sum, value) => sum + (value - center) ** 2, 0) / values.length;
  return Math.sqrt(variance) / center;
}

export function buildHvCrossSessionAssessmentIdempotencyKey(input: {
  vehicleId: string;
  modelVersion?: number;
  latestSessionEndAt: Date;
}): string {
  const version = input.modelVersion ?? HV_CROSS_SESSION_ASSESSMENT_MODEL_VERSION;
  return [
    'hv-cap-shadow-assess',
    input.vehicleId,
    `m${version}`,
    String(input.latestSessionEndAt.getTime()),
  ].join(':');
}

function filterQualifiedSessions(
  sessions: HvCrossSessionInputSession[],
  context: HvCrossSessionVehicleContext,
): {
  qualified: HvCrossSessionInputSession[];
  reasonCodes: HvCrossSessionGateReasonCode[];
} {
  const reasonCodes: HvCrossSessionGateReasonCode[] = [];
  const now = context.now ?? new Date();
  const freshnessCutoff = now.getTime() - HV_CROSS_SESSION_FRESHNESS_MS;

  const qualified = sessions.filter((session) => {
    if (session.summary.modelVersion !== context.modelVersion) {
      return false;
    }
    if (session.summary.status !== HV_M2_SESSION_SUMMARY_STATUSES.STABLE_SHADOW) {
      return false;
    }
    if (!session.summary.shadowGatePassed) {
      return false;
    }
    if (session.sessionEndAt.getTime() < freshnessCutoff) {
      return false;
    }
    return session.summary.stats.medianCapacityKwh != null;
  });

  const hasStaleIncluded = sessions.some(
    (session) =>
      session.summary.status === HV_M2_SESSION_SUMMARY_STATUSES.STABLE_SHADOW &&
      session.sessionEndAt.getTime() < freshnessCutoff,
  );
  if (hasStaleIncluded) {
    reasonCodes.push(HV_CROSS_SESSION_GATE_REASONS.STALE_SESSIONS);
  }

  const hasModelMismatch = sessions.some(
    (session) =>
      session.summary.status === HV_M2_SESSION_SUMMARY_STATUSES.STABLE_SHADOW &&
      session.summary.modelVersion !== context.modelVersion,
  );
  if (hasModelMismatch) {
    reasonCodes.push(HV_CROSS_SESSION_GATE_REASONS.MODEL_VERSION_MISMATCH);
  }

  if (qualified.length < HV_CROSS_SESSION_MIN_QUALIFIED_SESSIONS) {
    reasonCodes.push(HV_CROSS_SESSION_GATE_REASONS.INSUFFICIENT_QUALIFIED_SESSIONS);
  }

  const freshQualified = qualified.filter(
    (session) => session.sessionEndAt.getTime() >= freshnessCutoff,
  );
  if (
    freshQualified.length < HV_CROSS_SESSION_MIN_QUALIFIED_SESSIONS &&
    !reasonCodes.includes(HV_CROSS_SESSION_GATE_REASONS.INSUFFICIENT_QUALIFIED_SESSIONS)
  ) {
    reasonCodes.push(HV_CROSS_SESSION_GATE_REASONS.INSUFFICIENT_FRESH_SESSIONS);
  }

  return { qualified: freshQualified, reasonCodes };
}

function computeSpreadStats(sessionMedians: number[]): HvCrossSessionSpreadStats {
  const sessionMedianKwh = median(sessionMedians);
  const madKwh =
    sessionMedianKwh != null ? mad(sessionMedians, sessionMedianKwh) : null;

  return {
    sessionMedianKwh,
    madKwh,
    robustSpreadKwh:
      madKwh != null ? madKwh * MAD_NORMAL_CONSISTENCY_FACTOR : null,
    coefficientOfVariation: coefficientOfVariation(sessionMedians, sessionMedianKwh),
    minSessionMedianKwh: sessionMedians.length > 0 ? Math.min(...sessionMedians) : null,
    maxSessionMedianKwh: sessionMedians.length > 0 ? Math.max(...sessionMedians) : null,
  };
}

function computeMethodAgreement(
  sessions: HvCrossSessionInputSession[],
): HvCrossSessionMethodAgreement {
  const withM3 = sessions.filter((session) => session.m3Validation?.persisted === true);
  const withConflict = withM3.filter(
    (session) => session.m3Validation?.methodConflict === true,
  );

  const sessionsWithoutM3Conflict = withM3.length - withConflict.length;
  const agreementRatio =
    withM3.length > 0 ? sessionsWithoutM3Conflict / withM3.length : null;

  return {
    sessionsWithM3Validation: withM3.length,
    sessionsWithoutM3Conflict,
    sessionsWithM3Conflict: withConflict.length,
    agreementRatio,
  };
}

function evaluateCrossSessionGates(input: {
  qualifiedSessions: HvCrossSessionInputSession[];
  spread: HvCrossSessionSpreadStats;
  methodAgreement: HvCrossSessionMethodAgreement;
  observationCount: number;
  priorReasonCodes: HvCrossSessionGateReasonCode[];
}): HvCrossSessionGateReasonCode[] {
  const reasonCodes = [...input.priorReasonCodes];

  if (input.qualifiedSessions.length < HV_CROSS_SESSION_MIN_QUALIFIED_SESSIONS) {
    if (
      !reasonCodes.includes(HV_CROSS_SESSION_GATE_REASONS.INSUFFICIENT_QUALIFIED_SESSIONS)
    ) {
      reasonCodes.push(HV_CROSS_SESSION_GATE_REASONS.INSUFFICIENT_QUALIFIED_SESSIONS);
    }
  }

  if (input.observationCount > 0) {
    for (const session of input.qualifiedSessions) {
      const share =
        (session.summary.stats.validSampleCount ?? 0) / input.observationCount;
      if (share > HV_CROSS_SESSION_MAX_DOMINANT_SESSION_OBSERVATION_RATIO) {
        if (!reasonCodes.includes(HV_CROSS_SESSION_GATE_REASONS.DOMINANT_SESSION)) {
          reasonCodes.push(HV_CROSS_SESSION_GATE_REASONS.DOMINANT_SESSION);
        }
        break;
      }
    }
  }

  if (
    input.spread.coefficientOfVariation != null &&
    input.spread.coefficientOfVariation > HV_CROSS_SESSION_MAX_SESSION_MEDIAN_CV
  ) {
    reasonCodes.push(HV_CROSS_SESSION_GATE_REASONS.CROSS_SESSION_SPREAD_HIGH);
  }

  const unstableIntra = input.qualifiedSessions.some(
    (session) =>
      session.summary.stats.coefficientOfVariation != null &&
      session.summary.stats.coefficientOfVariation > HV_CROSS_SESSION_MAX_INTRA_SESSION_CV,
  );
  if (unstableIntra) {
    reasonCodes.push(HV_CROSS_SESSION_GATE_REASONS.INTRA_SESSION_INSTABILITY);
  }

  if (
    input.methodAgreement.sessionsWithM3Conflict >
    HV_CROSS_SESSION_MAX_M3_CONFLICT_SESSIONS
  ) {
    reasonCodes.push(HV_CROSS_SESSION_GATE_REASONS.M3_METHOD_CONFLICT);
  }

  return [...new Set(reasonCodes)];
}

function resolveConfidence(input: {
  shadowGatePassed: boolean;
  sessionCount: number;
  spread: HvCrossSessionSpreadStats;
  methodAgreement: HvCrossSessionMethodAgreement;
}): HvCrossSessionConfidence {
  if (!input.shadowGatePassed) {
    return HV_CROSS_SESSION_CONFIDENCE.INSUFFICIENT;
  }

  const cv = input.spread.coefficientOfVariation ?? Number.POSITIVE_INFINITY;
  const agreement = input.methodAgreement.agreementRatio ?? 1;

  if (input.sessionCount >= 4 && cv <= 0.02 && agreement >= 0.8) {
    return HV_CROSS_SESSION_CONFIDENCE.HIGH;
  }
  if (input.sessionCount >= 3 && cv <= HV_CROSS_SESSION_MAX_SESSION_MEDIAN_CV && agreement >= 0.5) {
    return HV_CROSS_SESSION_CONFIDENCE.MEDIUM;
  }
  return HV_CROSS_SESSION_CONFIDENCE.LOW;
}

function buildReasons(
  gateReasonCodes: HvCrossSessionGateReasonCode[],
  shadowGatePassed: boolean,
): HvCrossSessionAssessmentReason[] {
  const labels: Record<HvCrossSessionGateReasonCode, string> = {
    [HV_CROSS_SESSION_GATE_REASONS.INSUFFICIENT_QUALIFIED_SESSIONS]:
      'Zu wenige qualifizierte STABLE_SHADOW-Sessions',
    [HV_CROSS_SESSION_GATE_REASONS.DOMINANT_SESSION]:
      'Eine Session dominiert die Beobachtungsbasis',
    [HV_CROSS_SESSION_GATE_REASONS.CROSS_SESSION_SPREAD_HIGH]:
      'Cross-Session-Streuung der Session-Mediane zu hoch',
    [HV_CROSS_SESSION_GATE_REASONS.INTRA_SESSION_INSTABILITY]:
      'Intra-Session-Streuung in mindestens einer Session zu hoch',
    [HV_CROSS_SESSION_GATE_REASONS.M3_METHOD_CONFLICT]:
      'Gravierender M2/M3-Methodenkonflikt',
    [HV_CROSS_SESSION_GATE_REASONS.STALE_SESSIONS]:
      'Sessions außerhalb des Freshness-Fensters',
    [HV_CROSS_SESSION_GATE_REASONS.MODEL_VERSION_MISMATCH]:
      'Inkompatible M2-Modellversion',
    [HV_CROSS_SESSION_GATE_REASONS.INCOMPATIBLE_REFERENCE_CAPACITY]:
      'Inkompatible Referenzkapazität',
    [HV_CROSS_SESSION_GATE_REASONS.INSUFFICIENT_FRESH_SESSIONS]:
      'Zu wenige frische qualifizierte Sessions',
  };

  const reasons: HvCrossSessionAssessmentReason[] = gateReasonCodes.map((code) => ({
    code,
    labelDe: labels[code],
  }));

  if (shadowGatePassed) {
    reasons.push({
      code: 'SHADOW_ASSESSMENT_COMPUTED',
      labelDe: 'Cross-Session-Shadow-Assessment berechnet (keine Publication)',
    });
  }

  return reasons;
}

export function computeHvCrossSessionAssessment(input: {
  sessions: HvCrossSessionInputSession[];
  context: HvCrossSessionVehicleContext;
}): HvCrossSessionAssessment {
  const modelVersion =
    input.context.modelVersion ?? HV_CROSS_SESSION_ASSESSMENT_MODEL_VERSION;
  const context: HvCrossSessionVehicleContext = {
    ...input.context,
    modelVersion,
  };

  const { qualified, reasonCodes: filterReasons } = filterQualifiedSessions(
    input.sessions,
    context,
  );

  const sessionMedians = qualified
    .map((session) => session.summary.stats.medianCapacityKwh)
    .filter((value): value is number => value != null);

  const observationCount = qualified.reduce(
    (sum, session) => sum + (session.summary.stats.validSampleCount ?? 0),
    0,
  );

  const spread = computeSpreadStats(sessionMedians);
  const methodAgreement = computeMethodAgreement(qualified);
  const gateReasonCodes = evaluateCrossSessionGates({
    qualifiedSessions: qualified,
    spread,
    methodAgreement,
    observationCount,
    priorReasonCodes: filterReasons,
  });

  const shadowGatePassed =
    gateReasonCodes.length === 0 &&
    spread.sessionMedianKwh != null &&
    qualified.length >= HV_CROSS_SESSION_MIN_QUALIFIED_SESSIONS;

  const confidence = resolveConfidence({
    shadowGatePassed,
    sessionCount: qualified.length,
    spread,
    methodAgreement,
  });

  const latestSessionEndAt = qualified.reduce(
    (latest, session) =>
      session.sessionEndAt.getTime() > latest.getTime()
        ? session.sessionEndAt
        : latest,
    new Date(0),
  );

  const computedAt = (context.now ?? new Date()).toISOString();
  const crossSessionMedianKwh = shadowGatePassed ? spread.sessionMedianKwh : null;

  const inputSummary = {
    assessmentMode: 'SHADOW',
    maturity: HV_CROSS_SESSION_MATURITY_SHADOW,
    method: HvCapacityMethod.SHADOW_ROLLING_MEDIAN,
    m2ModelVersion: HV_M2_MODEL_VERSION,
    sessionCount: qualified.length,
    observationCount,
    crossSessionMedianKwh,
    spread,
    methodAgreement,
    gateReasonCodes,
    shadowGatePassed,
    publicationEligible: false,
    sohEligible: false,
    sessions: qualified.map((session) => ({
      sessionId: session.sessionId,
      sessionEndAt: session.sessionEndAt.toISOString(),
      medianCapacityKwh: session.summary.stats.medianCapacityKwh,
      validSampleCount: session.summary.stats.validSampleCount,
      intraSessionCv: session.summary.stats.coefficientOfVariation,
      m3MethodConflict: session.m3Validation?.methodConflict ?? null,
    })),
    referenceCapacityKwh: context.referenceCapacityKwh,
    referenceCapacityId: context.referenceCapacityId,
  };

  return {
    assessmentType: 'HV_CAPACITY_SHADOW',
    scoreSemantics: HV_CROSS_SESSION_SCORE_SEMANTICS,
    assessmentMode: 'SHADOW',
    method: HvCapacityMethod.SHADOW_ROLLING_MEDIAN,
    modelVersion,
    estimatedUsableCapacityKwh: crossSessionMedianKwh,
    sessionCount: qualified.length,
    observationCount,
    crossSessionMedianKwh,
    spread,
    methodAgreement,
    confidence,
    maturity: HV_CROSS_SESSION_MATURITY_SHADOW,
    shadowGatePassed,
    gateReasonCodes,
    reasons: buildReasons(gateReasonCodes, shadowGatePassed),
    publicationEligible: false,
    sohEligible: false,
    sessionIds: qualified.map((session) => session.sessionId),
    referenceCapacityKwh: context.referenceCapacityKwh,
    referenceCapacityId: context.referenceCapacityId,
    computedAt,
    idempotencyKey: buildHvCrossSessionAssessmentIdempotencyKey({
      vehicleId: context.vehicleId,
      modelVersion,
      latestSessionEndAt:
        latestSessionEndAt.getTime() > 0 ? latestSessionEndAt : context.now ?? new Date(),
    }),
    inputSummary,
  };
}
