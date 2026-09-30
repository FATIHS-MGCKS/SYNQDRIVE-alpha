import { BatteryMeasurementScope } from '../battery-v2-domain';
import { compareM3_3HvH2LifecycleSegmentIds } from '../hv-h2/m3-3-hv-h2-lifecycle-segment-order.util';
import type {
  M3_3HvH2LongitudinalInputCandidateV1,
  M3_3HvH2LongitudinalInputReportV1,
} from '../hv-h2/m3-3-hv-h2.types';
import {
  CROSS_METHOD_POOLING_DEFAULT,
  CROSS_PROVIDER_POOLING_DEFAULT,
  M3_3_HV_H3_ESTIMATOR_VERSION,
  M3_3_HV_H3_EXPOSURE_AXIS,
  M3_3_HV_H3_LONGITUDINAL_TREND_REPORT_V1,
  M3_3_HV_H3_MAX_POINTS_PER_SERIES_DEFAULT,
  M3_3_HV_H3_MAX_POINTS_PER_SERIES_HARD,
  M3_3_HV_H3_METHOD_TREND_V1,
  M3_3_HV_H3_M2_SESSION_AGGREGATION,
  M3_3_HV_H3_TREND_POINT_V1,
  METHOD_IDENTITY_REQUIRED,
} from './m3-3-hv-h3.constants';
import { buildM3_3HvH3ExposureAxisAuditV1 } from './m3-3-hv-h3-exposure-axis-audit';
import {
  buildM3_3HvH3SeriesPartitionKey,
  buildM3_3HvH3TrendPointId,
  computeM3_3HvH3SeriesFingerprint,
  computeM3_3HvH3TrendPointFingerprint,
  type HvH3SeriesPartitionIdentity,
} from './m3-3-hv-h3-fingerprint';
import { buildM3_3HvH3MethodAgreementDiagnosticsV1 } from './m3-3-hv-h3-method-agreement';
import {
  computeTheilSenMedianPairwiseSlopeV1,
  toElapsedDaysFromAnchor,
  type TheilSenPoint,
} from './m3-3-hv-h3-theil-sen';
import type {
  M3_3HvH3BuildInput,
  M3_3HvH3LifecycleSegmentTrendsV1,
  M3_3HvH3LongitudinalTrendReportV1,
  M3_3HvH3MethodTrendSeriesV1,
  M3_3HvH3ScientificRole,
  M3_3HvH3SourceCompleteness,
  M3_3HvH3TrendAvailability,
  M3_3HvH3TrendPointV1,
  M3_3HvH3ValidationContextV1,
} from './m3-3-hv-h3.types';

const M2_METHOD = 'M2_CURRENT_ENERGY_SOC';
const M3_METHOD = 'M3_ADDED_ENERGY_DELTA_SOC';
const PROVIDER_METHOD = 'PROVIDER_HV_SOH';

function isH3FitCandidate(c: M3_3HvH2LongitudinalInputCandidateV1): boolean {
  if (c.eligibility !== 'eligible') return false;
  if (c.observationValidity !== 'VALID') return false;
  if (c.numericValue == null || !Number.isFinite(c.numericValue)) return false;
  return true;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function scientificRoleForMethod(method: string): M3_3HvH3ScientificRole {
  if (method === M3_METHOD) return 'VALIDATION_ONLY';
  if (method === PROVIDER_METHOD) return 'PROVIDER_OBSERVATIONAL';
  return 'PRIMARY_METHOD_EVIDENCE';
}

function aggregationKindForMethod(method: string): string {
  if (method === M2_METHOD) return M3_3_HV_H3_M2_SESSION_AGGREGATION;
  if (method === M3_METHOD) return 'M3_SESSION_POINT';
  return 'PROVIDER_DIRECT';
}

interface RawGroup {
  identity: HvH3SeriesPartitionIdentity;
  candidates: M3_3HvH2LongitudinalInputCandidateV1[];
}

function buildM2SessionPoints(group: RawGroup): M3_3HvH3TrendPointV1[] {
  const bySession = new Map<string, M3_3HvH2LongitudinalInputCandidateV1[]>();
  for (const c of group.candidates) {
    const sid = c.sessionId;
    if (!sid) continue;
    const list = bySession.get(sid) ?? [];
    list.push(c);
    bySession.set(sid, list);
  }

  const points: M3_3HvH3TrendPointV1[] = [];
  for (const [sessionId, rows] of bySession) {
    const values = rows.map((r) => r.numericValue!);
    const med = median(values);
    const latest = rows.reduce((a, b) =>
      Date.parse(a.observedAt) >= Date.parse(b.observedAt) ? a : b,
    );
    const partitionKey = buildM3_3HvH3SeriesPartitionKey(group.identity);
    const fps = rows.map((r) => r.candidateFingerprint).sort();
    const pointFingerprint = computeM3_3HvH3TrendPointFingerprint({
      seriesPartitionKey: partitionKey,
      sessionId,
      observedAt: latest.observedAt,
      numericValue: med,
      sourceCandidateFingerprints: fps,
    });
    points.push({
      contractVersion: M3_3_HV_H3_TREND_POINT_V1,
      organizationId: group.identity.organizationId,
      vehicleId: group.identity.vehicleId,
      batteryScope: BatteryMeasurementScope.HV,
      lifecycleSegmentId: group.identity.lifecycleSegmentId,
      method: group.identity.method,
      methodRole: group.identity.methodRole,
      valueSemantic: group.identity.valueSemantic,
      unit: group.identity.unit,
      seriesPartitionKey: partitionKey,
      pointId: buildM3_3HvH3TrendPointId(pointFingerprint),
      pointFingerprint,
      observedAt: latest.observedAt,
      numericValue: med,
      aggregationKind: M3_3_HV_H3_M2_SESSION_AGGREGATION,
      sourceCandidateFingerprints: fps,
      sourceCandidateCount: rows.length,
      sessionId,
      provider: null,
      evidenceStrength: latest.evidenceStrength,
      scientificRole: 'PRIMARY_METHOD_EVIDENCE',
      modelVersion: group.identity.modelVersion,
    });
  }
  return points;
}

function buildDirectSessionPoints(group: RawGroup, method: string): M3_3HvH3TrendPointV1[] {
  const bySession = new Map<string, M3_3HvH2LongitudinalInputCandidateV1[]>();
  for (const c of group.candidates) {
    const sid = c.sessionId ?? `direct:${c.candidateFingerprint}`;
    const list = bySession.get(sid) ?? [];
    list.push(c);
    bySession.set(sid, list);
  }

  const points: M3_3HvH3TrendPointV1[] = [];
  for (const [sessionId, rows] of bySession) {
    const values = rows.map((r) => r.numericValue!);
    const value = rows.length === 1 ? values[0]! : median(values);
    const latest = rows.reduce((a, b) =>
      Date.parse(a.observedAt) >= Date.parse(b.observedAt) ? a : b,
    );
    const partitionKey = buildM3_3HvH3SeriesPartitionKey(group.identity);
    const fps = rows.map((r) => r.candidateFingerprint).sort();
    const pointFingerprint = computeM3_3HvH3TrendPointFingerprint({
      seriesPartitionKey: partitionKey,
      sessionId: sessionId.startsWith('direct:') ? null : sessionId,
      observedAt: latest.observedAt,
      numericValue: value,
      sourceCandidateFingerprints: fps,
    });
    points.push({
      contractVersion: M3_3_HV_H3_TREND_POINT_V1,
      organizationId: group.identity.organizationId,
      vehicleId: group.identity.vehicleId,
      batteryScope: BatteryMeasurementScope.HV,
      lifecycleSegmentId: group.identity.lifecycleSegmentId,
      method: group.identity.method,
      methodRole: group.identity.methodRole,
      valueSemantic: group.identity.valueSemantic,
      unit: group.identity.unit,
      seriesPartitionKey: partitionKey,
      pointId: buildM3_3HvH3TrendPointId(pointFingerprint),
      pointFingerprint,
      observedAt: latest.observedAt,
      numericValue: value,
      aggregationKind: method === M3_METHOD ? 'M3_SESSION_POINT' : 'PROVIDER_DIRECT',
      sourceCandidateFingerprints: fps,
      sourceCandidateCount: rows.length,
      sessionId: sessionId.startsWith('direct:') ? null : sessionId,
      provider: group.identity.provider,
      evidenceStrength: latest.evidenceStrength,
      scientificRole: scientificRoleForMethod(method),
      modelVersion: group.identity.modelVersion,
    });
  }
  return points;
}

function sortTrendPoints(points: M3_3HvH3TrendPointV1[]): M3_3HvH3TrendPointV1[] {
  return [...points].sort((a, b) => {
    const t = a.observedAt.localeCompare(b.observedAt);
    if (t !== 0) return t;
    return a.pointFingerprint.localeCompare(b.pointFingerprint);
  });
}

function buildMethodSeries(
  identity: HvH3SeriesPartitionIdentity,
  trendPoints: M3_3HvH3TrendPointV1[],
  sourceCompleteness: M3_3HvH3SourceCompleteness,
  maxPoints: number,
): M3_3HvH3MethodTrendSeriesV1 {
  const sorted = sortTrendPoints(trendPoints);
  const sourceCandidateCount = sorted.reduce((n, p) => n + p.sourceCandidateCount, 0);
  const orderedFps = sorted.map((p) => p.pointFingerprint);
  const seriesFingerprint = computeM3_3HvH3SeriesFingerprint({
    partition: identity,
    orderedPointFingerprints: orderedFps,
  });

  const truncatedBySize = sorted.length > maxPoints;
  let trendAvailability: M3_3HvH3TrendAvailability = 'NO_DATA';
  let theil = computeTheilSenMedianPairwiseSlopeV1([]);
  let scientificTrendEligible = false;
  let primaryTrendEligible = false;

  if (sorted.length === 0) {
    trendAvailability = 'NO_DATA';
  } else if (truncatedBySize) {
    trendAvailability = 'SERIES_TOO_LARGE_FOR_V1_ESTIMATOR';
  } else {
    const anchorMs = Date.parse(sorted[0]!.observedAt);
    const theilPoints: TheilSenPoint[] = sorted.map((p) => ({
      xDays: toElapsedDaysFromAnchor(anchorMs, p.observedAt),
      y: p.numericValue,
      observedAtIso: p.observedAt,
    }));
    theil = computeTheilSenMedianPairwiseSlopeV1(theilPoints);
    trendAvailability = theil.trendAvailability;
    const h2Complete = sourceCompleteness === 'COMPLETE_WITHIN_H2_CONTRACT';
    scientificTrendEligible =
      h2Complete &&
      !truncatedBySize &&
      theil.trendAvailability === 'DESCRIPTIVE_SLOPE_AVAILABLE';
    primaryTrendEligible =
      scientificTrendEligible && identity.method === M2_METHOD;
  }

  if (sourceCompleteness === 'TRUNCATED') {
    scientificTrendEligible = false;
    primaryTrendEligible = false;
  }
  if (identity.method === M3_METHOD) {
    primaryTrendEligible = false;
  }
  if (identity.method === PROVIDER_METHOD) {
    primaryTrendEligible = false;
  }

  return {
    contractVersion: M3_3_HV_H3_METHOD_TREND_V1,
    seriesFingerprint,
    lifecycleSegmentId: identity.lifecycleSegmentId,
    method: identity.method,
    methodRole: identity.methodRole,
    valueSemantic: identity.valueSemantic,
    unit: identity.unit,
    modelVersion: identity.modelVersion,
    provider: identity.provider,
    scientificRole: scientificRoleForMethod(identity.method),
    aggregationKind: aggregationKindForMethod(identity.method),
    seriesPartitionKey: buildM3_3HvH3SeriesPartitionKey(identity),
    pointCount: sorted.length,
    distinctTimestampCount: theil.distinctTimestampCount,
    pairwiseSlopeCount: theil.pairwiseSlopeCount,
    timeSpanDays: theil.timeSpanDays,
    medianValue: theil.medianValue,
    minValue: theil.minValue,
    maxValue: theil.maxValue,
    trendAvailability,
    trendSlopePerDay: theil.trendSlopePerDay,
    trendIntercept: theil.trendIntercept,
    fittedAtSeriesStart: theil.fittedAtSeriesStart,
    fittedAtSeriesEnd: theil.fittedAtSeriesEnd,
    residualMedian: theil.residualMedian,
    residualMad: theil.residualMad,
    medianAbsoluteStepChange: theil.medianAbsoluteStepChange,
    sourceCandidateCount,
    sourcePointFingerprints: orderedFps,
    trendPoints: sorted,
    sourceCompleteness,
    scientificTrendEligible,
    primaryTrendEligible,
    trendDirectionConclusion: null,
    degradationConclusion: null,
  };
}

function buildValidationContext(
  h2: M3_3HvH2LongitudinalInputReportV1,
): M3_3HvH3ValidationContextV1[] {
  return h2.validationAnchors.map((a) => ({
    groundTruthEventId: a.groundTruthEventId,
    groundTruthType: a.groundTruthType,
    effectiveAt: a.effectiveAt,
    verificationStatusAtEvaluationAt: a.verificationStatusAtEvaluationAt,
    maturity: a.maturity,
  }));
}

export function buildM3_3HvH3LongitudinalTrendReportV1(
  input: M3_3HvH3BuildInput,
): M3_3HvH3LongitudinalTrendReportV1 {
  const h2 = input.h2Report;
  const maxPoints = Math.min(
    input.maxPointsPerSeries ?? M3_3_HV_H3_MAX_POINTS_PER_SERIES_DEFAULT,
    M3_3_HV_H3_MAX_POINTS_PER_SERIES_HARD,
  );

  const sourceCompleteness: M3_3HvH3SourceCompleteness = h2.truncated
    ? 'TRUNCATED'
    : 'COMPLETE_WITHIN_H2_CONTRACT';

  const fitCandidates = h2.candidates.filter(isH3FitCandidate);

  const seriesGroups = new Map<string, RawGroup>();
  for (const c of fitCandidates) {
    const identity: HvH3SeriesPartitionIdentity = {
      organizationId: c.organizationId,
      vehicleId: c.vehicleId,
      batteryScope: c.batteryScope,
      lifecycleSegmentId: c.lifecycleSegmentId,
      method: c.method,
      methodRole: c.methodRole,
      valueSemantic: c.valueSemantic,
      unit: c.unit,
      modelVersion: c.modelVersion,
      provider: c.provider,
    };
    const key = buildM3_3HvH3SeriesPartitionKey(identity);
    const g = seriesGroups.get(key) ?? { identity, candidates: [] };
    g.candidates.push(c);
    seriesGroups.set(key, g);
  }

  const seriesBySegment = new Map<string, M3_3HvH3MethodTrendSeriesV1[]>();

  for (const group of seriesGroups.values()) {
    let points: M3_3HvH3TrendPointV1[] = [];
    if (group.identity.method === M2_METHOD) {
      points = buildM2SessionPoints(group);
    } else if (group.identity.method === M3_METHOD) {
      points = buildDirectSessionPoints(group, M3_METHOD);
    } else if (group.identity.method === PROVIDER_METHOD) {
      points = buildDirectSessionPoints(group, PROVIDER_METHOD);
    } else {
      continue;
    }

    const series = buildMethodSeries(group.identity, points, sourceCompleteness, maxPoints);
    const segList = seriesBySegment.get(group.identity.lifecycleSegmentId) ?? [];
    segList.push(series);
    seriesBySegment.set(group.identity.lifecycleSegmentId, segList);
  }

  const segmentIds = [
    ...new Set([
      ...h2.lifecycleSegments.map((s) => s.lifecycleSegmentId),
      ...seriesBySegment.keys(),
    ]),
  ].sort(compareM3_3HvH2LifecycleSegmentIds);

  const lifecycleSegments: M3_3HvH3LifecycleSegmentTrendsV1[] = segmentIds.map(
    (lifecycleSegmentId) => ({
      lifecycleSegmentId,
      methodSeries: (seriesBySegment.get(lifecycleSegmentId) ?? []).sort((a, b) =>
        a.seriesPartitionKey.localeCompare(b.seriesPartitionKey),
      ),
    }),
  );

  const methodAgreementDiagnostics = buildM3_3HvH3MethodAgreementDiagnosticsV1(
    lifecycleSegments,
  );

  return {
    contractVersion: M3_3_HV_H3_LONGITUDINAL_TREND_REPORT_V1,
    organizationId: h2.organizationId,
    vehicleId: h2.vehicleId,
    batteryScope: BatteryMeasurementScope.HV,
    evaluationAt: h2.evaluationAt,
    inheritedTemporalSemantics: h2.temporalSemantics,
    sourceH2ContractVersion: h2.contractVersion,
    sourceH2Truncated: h2.truncated,
    estimatorVersion: M3_3_HV_H3_ESTIMATOR_VERSION,
    exposureAxis: M3_3_HV_H3_EXPOSURE_AXIS,
    exposureAxisAudit: buildM3_3HvH3ExposureAxisAuditV1(),
    lifecycleSegments,
    validationContext: buildValidationContext(h2),
    methodAgreementDiagnostics,
    legacyDerivedContext: [
      {
        kind: 'SHADOW_ROLLING_MEDIAN',
        note:
          'HV cross-session SHADOW_ROLLING_MEDIAN assessment is audit-only context; not H3 regression input',
      },
    ],
    sourceCompleteness,
    methodIdentityRequired: METHOD_IDENTITY_REQUIRED,
    crossMethodPoolingDefault: CROSS_METHOD_POOLING_DEFAULT,
    crossProviderPoolingDefault: CROSS_PROVIDER_POOLING_DEFAULT,
    trendDirectionConclusion: null,
    degradationConclusion: null,
    healthConclusion: null,
    groundTruthValidated: false,
    customerPublicationEligible: false,
  };
}
