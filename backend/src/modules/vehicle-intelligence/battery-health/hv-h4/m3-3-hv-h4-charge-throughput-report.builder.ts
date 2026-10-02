import type { M3_3HvH4ChargeSessionScientificRowV1 } from './m3-3-hv-h4-charge-session-scientific-row.v1';
import {
  M3_3_HV_H4_BOUNDED_CHARGE_THROUGHPUT_V1,
  M3_3_HV_H4_CHARGE_THROUGHPUT_REPORT_V1,
  M3_3_HV_H4_COVERAGE_REPORT_V1,
  M3_3_HV_H4_EXPOSURE_SOURCE_AUTHORITY_V1,
  M3_3_HV_H4_NON_POSITIVE_ENERGY_POLICY,
  M3_3_HV_H4_SESSION_KNOWLEDGE_ASOF_POLICY,
  H4_AUTOMATIC_RUNTIME_REACHABLE,
} from './m3-3-hv-h4.constants';
import { assertM3_3HvH4EnergySemanticFirewall } from './m3-3-hv-h4-charge-session-source-authority';
import type { M3_3HvH4LoadedDataV1 } from './m3-3-hv-h4-loaded-data.types';
import {
  buildM3_3HvH4LifecycleSegmentIntervals,
  instantWithinM3_3HvH4SegmentInterval,
  resolveM3_3HvH4LifecycleSegmentForInstant,
  resolveM3_3HvH4ReplacementBoundaries,
} from './m3-3-hv-h4-lifecycle.util';
import type { M3_3HvH4CoverageReportV1 } from './m3-3-hv-h4.types';
import { buildM3_3HvH4SegmentSourceFingerprintV1 } from './m3-3-hv-h4-charge-throughput-fingerprint.v1';
import { sumM3_3HvH4ChargeThroughputEnergiesV1 } from './m3-3-hv-h4-charge-throughput-numeric.v1';
import {
  classifyM3_3HvH4ChargeSessionA2Contribution,
  detectDuplicateProviderSegmentIdentity,
  detectOverlappingEligibleNativeSessions,
  sortM3_3HvH4ChargeSessionsCanonical,
} from './m3-3-hv-h4-charge-throughput-session.v1';
import type {
  M3_3HvH4ChargeThroughputReportV1,
  M3_3HvH4ChargeThroughputSessionClassificationV1,
  M3_3HvH4LifecycleChargeThroughputSegmentV1,
} from './m3-3-hv-h4-charge-throughput.types';

function iso(d: Date | null | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function incrementCount(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function sessionsInSegment(
  data: M3_3HvH4LoadedDataV1,
  lifecycleSegmentId: string,
  replacementBoundaries: ReturnType<typeof resolveM3_3HvH4ReplacementBoundaries>,
): M3_3HvH4ChargeSessionScientificRowV1[] {
  const interval = buildM3_3HvH4LifecycleSegmentIntervals({
    replacementBoundaries,
    evaluationAt: data.evaluationAt,
  }).find((i) => i.lifecycleSegmentId === lifecycleSegmentId);
  if (!interval) return [];
  return data.chargeSessions.filter((s) => {
    const segmentId = resolveM3_3HvH4LifecycleSegmentForInstant({
      instant: s.startAt,
      replacementBoundaries,
    });
    return (
      segmentId === lifecycleSegmentId &&
      instantWithinM3_3HvH4SegmentInterval(s.startAt, interval)
    );
  });
}

function composeSegment(input: {
  data: M3_3HvH4LoadedDataV1;
  coverage: M3_3HvH4CoverageReportV1;
  lifecycleSegmentId: string;
  replacementBoundaries: ReturnType<typeof resolveM3_3HvH4ReplacementBoundaries>;
  sessionClassifications: M3_3HvH4ChargeThroughputSessionClassificationV1[];
}): M3_3HvH4LifecycleChargeThroughputSegmentV1 {
  const throughputAxis = input.coverage.axes.find(
    (a) =>
      a.axis === 'CHARGE_THROUGHPUT_KWH' &&
      a.lifecycleSegmentId === input.lifecycleSegmentId,
  )!;
  const reasonCodes: string[] = [];
  const excludedCounts: Record<string, number> = {};

  const segmentSessions = sessionsInSegment(
    input.data,
    input.lifecycleSegmentId,
    input.replacementBoundaries,
  );

  const segmentClassifications: M3_3HvH4ChargeThroughputSessionClassificationV1[] = [];

  for (const session of segmentSessions) {
    const classification = classifyM3_3HvH4ChargeSessionA2Contribution({
      session,
      replacementBoundaries: input.replacementBoundaries,
      expectedOrganizationId: input.data.organizationId,
      expectedVehicleId: input.data.vehicleId,
      evaluationAt: input.data.evaluationAt,
    });
    const row: M3_3HvH4ChargeThroughputSessionClassificationV1 = {
      sessionId: session.id,
      lifecycleSegmentId: input.lifecycleSegmentId,
      contributionEligibility: classification.eligibility,
      reasonCodes: classification.reasonCodes,
    };
    segmentClassifications.push(row);
    input.sessionClassifications.push(row);
    if (classification.eligibility !== 'ELIGIBLE_CONTRIBUTOR') {
      incrementCount(excludedCounts, classification.eligibility);
    }
  }

  const observedSegmentSessionCount = segmentSessions.length;
  let eligibleContributors: M3_3HvH4ChargeSessionScientificRowV1[] = [];
  let includedSessions: M3_3HvH4ChargeSessionScientificRowV1[] = [];
  let compositionStatus: M3_3HvH4LifecycleChargeThroughputSegmentV1['compositionStatus'] =
    'NO_TRUSTED_SESSIONS';
  let boundedObservedChargeThroughputKwh: number | null = null;
  let summationMethod: M3_3HvH4LifecycleChargeThroughputSegmentV1['summationMethod'] =
    null;
  let withheldContributorSessionCount = 0;
  let conflictCandidateSessions: M3_3HvH4ChargeSessionScientificRowV1[] = [];

  if (input.data.chargeSessionSourceLoad.sourceTruncated) {
    compositionStatus = 'SOURCE_TRUNCATED';
    reasonCodes.push('CHARGE_SESSION_SOURCE_TRUNCATED');
    eligibleContributors = sortM3_3HvH4ChargeSessionsCanonical(
      segmentSessions.filter((session) => {
        const hit = segmentClassifications.find((c) => c.sessionId === session.id);
        return hit?.contributionEligibility === 'ELIGIBLE_CONTRIBUTOR';
      }),
    );
    withheldContributorSessionCount = eligibleContributors.length;
    if (withheldContributorSessionCount > 0) {
      incrementCount(excludedCounts, 'WITHHELD_SEGMENT_SOURCE_TRUNCATED');
    }
  } else {
    eligibleContributors = sortM3_3HvH4ChargeSessionsCanonical(
      segmentSessions.filter((session) => {
        const hit = segmentClassifications.find((c) => c.sessionId === session.id);
        return hit?.contributionEligibility === 'ELIGIBLE_CONTRIBUTOR';
      }),
    );

    if (eligibleContributors.length === 0) {
      compositionStatus = 'NO_TRUSTED_SESSIONS';
      reasonCodes.push('NO_ELIGIBLE_NATIVE_CONTRIBUTOR');
    } else if (detectOverlappingEligibleNativeSessions(eligibleContributors)) {
      compositionStatus = 'SOURCE_CONFLICT';
      reasonCodes.push('OVERLAPPING_ELIGIBLE_NATIVE_SESSIONS');
      conflictCandidateSessions = eligibleContributors;
      withheldContributorSessionCount = eligibleContributors.length;
      incrementCount(excludedCounts, 'WITHHELD_SEGMENT_SOURCE_CONFLICT');
    } else if (detectDuplicateProviderSegmentIdentity(eligibleContributors)) {
      compositionStatus = 'SOURCE_CONFLICT';
      reasonCodes.push('DUPLICATE_NATIVE_PROVIDER_SEGMENT_ID');
      conflictCandidateSessions = eligibleContributors;
      withheldContributorSessionCount = eligibleContributors.length;
      incrementCount(excludedCounts, 'WITHHELD_SEGMENT_SOURCE_CONFLICT');
    } else {
      includedSessions = eligibleContributors;
      const sumResult = sumM3_3HvH4ChargeThroughputEnergiesV1(includedSessions);
      boundedObservedChargeThroughputKwh = sumResult.totalKwh;
      summationMethod = sumResult.summationMethod;
      compositionStatus = 'AVAILABLE_OBSERVED_GAP_AWARE';
    }
  }

  const includedSessionCount = includedSessions.length;
  const excludedSessionCount = observedSegmentSessionCount - includedSessionCount;

  const sourceFingerprint = buildM3_3HvH4SegmentSourceFingerprintV1({
    contractVersion: M3_3_HV_H4_BOUNDED_CHARGE_THROUGHPUT_V1,
    coverageReportVersion: M3_3_HV_H4_COVERAGE_REPORT_V1,
    exposureSourceAuthorityVersion: M3_3_HV_H4_EXPOSURE_SOURCE_AUTHORITY_V1,
    organizationId: input.data.organizationId,
    vehicleId: input.data.vehicleId,
    lifecycleSegmentId: input.lifecycleSegmentId,
    evaluationAt: input.data.evaluationAt.toISOString(),
    compositionStatus,
    segmentReasonCodes: reasonCodes,
    chargeSessionSourceLoad: { ...input.data.chargeSessionSourceLoad },
    includedSessions:
      compositionStatus === 'AVAILABLE_OBSERVED_GAP_AWARE' ? includedSessions : [],
    conflictCandidateSessions,
    segmentSessionClassifications: segmentClassifications,
  });

  return {
    lifecycleSegmentId: input.lifecycleSegmentId,
    compositionStatus,
    boundedObservedChargeThroughputKwh:
      compositionStatus === 'AVAILABLE_OBSERVED_GAP_AWARE'
        ? boundedObservedChargeThroughputKwh
        : null,
    unit: 'kWh',
    throughputDirection: 'CHARGE_ONLY',
    throughputSemantic: 'PROVIDER_REPORTED_CHARGING_ADDED_ENERGY_DELTA',
    coverageClass: throughputAxis.coverageClass,
    coverageCompletenessClaim: 'OBSERVED_ELIGIBLE_SESSIONS_ONLY',
    segmentEvidenceState: throughputAxis.segmentEvidenceState,
    firstIncludedSessionStartAt:
      compositionStatus === 'AVAILABLE_OBSERVED_GAP_AWARE'
        ? iso(includedSessions[0]?.startAt ?? null)
        : null,
    lastIncludedSessionEndAt:
      compositionStatus === 'AVAILABLE_OBSERVED_GAP_AWARE'
        ? iso(includedSessions[includedSessions.length - 1]?.endAt ?? null)
        : null,
    includedSessionCount,
    excludedSessionCount,
    excludedCountsByEligibility: excludedCounts,
    withheldContributorSessionCount,
    summationMethod,
    earliestObservedAt: throughputAxis.earliestObservedAt,
    earliestTrustedAt: throughputAxis.earliestTrustedAt,
    retentionContinuity: throughputAxis.retentionContinuity,
    retentionInference: throughputAxis.retentionInference,
    gapSummary: throughputAxis.gapSummary,
    sourceFingerprint,
    lifetimeComplete: false,
    bidirectionalThroughput: false,
    fecEligible: false,
    degradationNormalizationEligible: false,
    customerPublicationEligible: false,
    reasonCodes,
  };
}

export function buildM3_3HvH4ChargeThroughputReportV1(input: {
  data: M3_3HvH4LoadedDataV1;
  coverage: M3_3HvH4CoverageReportV1;
}): M3_3HvH4ChargeThroughputReportV1 {
  const replacementBoundaries = resolveM3_3HvH4ReplacementBoundaries(
    input.data.groundTruthEvents,
    input.data.evaluationAt,
  );
  const intervals = buildM3_3HvH4LifecycleSegmentIntervals({
    replacementBoundaries,
    evaluationAt: input.data.evaluationAt,
  });
  const sessionClassifications: M3_3HvH4ChargeThroughputSessionClassificationV1[] = [];
  const segments = intervals.map((interval) =>
    composeSegment({
      data: input.data,
      coverage: input.coverage,
      lifecycleSegmentId: interval.lifecycleSegmentId,
      replacementBoundaries,
      sessionClassifications,
    }),
  );

  return {
    contractVersion: M3_3_HV_H4_BOUNDED_CHARGE_THROUGHPUT_V1,
    reportVersion: M3_3_HV_H4_CHARGE_THROUGHPUT_REPORT_V1,
    exposureSourceAuthorityVersion: M3_3_HV_H4_EXPOSURE_SOURCE_AUTHORITY_V1,
    coverageReportVersion: M3_3_HV_H4_COVERAGE_REPORT_V1,
    organizationId: input.data.organizationId,
    vehicleId: input.data.vehicleId,
    evaluationAt: input.data.evaluationAt.toISOString(),
    sessionKnowledgeAsOfPolicy: M3_3_HV_H4_SESSION_KNOWLEDGE_ASOF_POLICY,
    nonPositiveEnergyPolicy: M3_3_HV_H4_NON_POSITIVE_ENERGY_POLICY,
    throughputDirection: 'CHARGE_ONLY',
    bidirectionalThroughput: false,
    lifetimeComplete: false,
    customerPublicationEligible: false,
    automaticRuntimeReachable: H4_AUTOMATIC_RUNTIME_REACHABLE,
    segments,
    sessionClassifications,
    chargeSessionSourceLoad: { ...input.data.chargeSessionSourceLoad },
    energySemanticFirewall: assertM3_3HvH4EnergySemanticFirewall(),
  };
}

export function validateM3_3HvH4ChargeThroughputReportContract(
  report: M3_3HvH4ChargeThroughputReportV1,
): void {
  if (report.contractVersion !== M3_3_HV_H4_BOUNDED_CHARGE_THROUGHPUT_V1) {
    throw new Error('M3.3-HV-H4-A2: invalid contractVersion');
  }
  if (report.sessionKnowledgeAsOfPolicy !== M3_3_HV_H4_SESSION_KNOWLEDGE_ASOF_POLICY) {
    throw new Error('M3.3-HV-H4-A2: invalid sessionKnowledgeAsOfPolicy');
  }
  if (report.lifetimeComplete !== false || report.bidirectionalThroughput !== false) {
    throw new Error('M3.3-HV-H4-A2: lifetime/bidirectional flags must be false');
  }
  if (report.customerPublicationEligible !== false) {
    throw new Error('M3.3-HV-H4-A2: customerPublicationEligible must be false');
  }
  for (const segment of report.segments) {
    const observedInSegment =
      segment.includedSessionCount + segment.excludedSessionCount;
    if (observedInSegment < segment.includedSessionCount) {
      throw new Error('M3.3-HV-H4-A2: diagnostic session count invariant violated');
    }
    if (segment.compositionStatus === 'NO_TRUSTED_SESSIONS') {
      if (segment.boundedObservedChargeThroughputKwh !== null) {
        throw new Error('M3.3-HV-H4-A2: NO_TRUSTED_SESSIONS requires null throughput');
      }
    }
    if (
      segment.compositionStatus === 'SOURCE_TRUNCATED' ||
      segment.compositionStatus === 'SOURCE_CONFLICT'
    ) {
      if (segment.boundedObservedChargeThroughputKwh !== null) {
        throw new Error('M3.3-HV-H4-A2: fail-closed status requires null throughput');
      }
    }
    if (segment.compositionStatus === 'AVAILABLE_OBSERVED_GAP_AWARE') {
      if (
        segment.boundedObservedChargeThroughputKwh == null ||
        segment.includedSessionCount < 1 ||
        segment.summationMethod == null
      ) {
        throw new Error('M3.3-HV-H4-A2: AVAILABLE requires numeric sum and sessions');
      }
    }
  }
}
