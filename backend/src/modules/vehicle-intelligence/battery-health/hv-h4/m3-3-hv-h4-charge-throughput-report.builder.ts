import { createHash } from 'crypto';
import type { HvChargeSession } from '@prisma/client';
import {
  M3_3_HV_H4_BOUNDED_CHARGE_THROUGHPUT_V1,
  M3_3_HV_H4_CHARGE_THROUGHPUT_REPORT_V1,
  M3_3_HV_H4_COVERAGE_REPORT_V1,
  M3_3_HV_H4_EXPOSURE_SOURCE_AUTHORITY_V1,
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

function buildSegmentSourceFingerprint(input: {
  contractVersion: string;
  coverageReportVersion: string;
  exposureSourceAuthorityVersion: string;
  organizationId: string;
  vehicleId: string;
  lifecycleSegmentId: string;
  evaluationAt: string;
  includedSessions: HvChargeSession[];
}): string {
  const sessionEntries = input.includedSessions.map((s) => {
    const meta = (s.metadata ?? {}) as {
      qualityStatus?: string;
      addedEnergyProvenance?: string;
    };
    return {
      sessionId: s.id,
      segmentFingerprint: s.segmentFingerprint,
      dimoSegmentId: s.dimoSegmentId,
      source: s.source,
      startAt: s.startAt.toISOString(),
      endAt: s.endAt?.toISOString() ?? null,
      energyAddedKwh: s.energyAddedKwh,
      providerObservedAt: s.providerObservedAt?.toISOString() ?? null,
      qualityStatus: meta.qualityStatus ?? null,
      addedEnergyProvenance: meta.addedEnergyProvenance ?? null,
    };
  });
  const payload = {
    contractVersion: input.contractVersion,
    coverageReportVersion: input.coverageReportVersion,
    exposureSourceAuthorityVersion: input.exposureSourceAuthorityVersion,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    lifecycleSegmentId: input.lifecycleSegmentId,
    evaluationAt: input.evaluationAt,
    sessions: sessionEntries,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function sessionsInSegment(
  data: M3_3HvH4LoadedDataV1,
  lifecycleSegmentId: string,
  replacementBoundaries: ReturnType<typeof resolveM3_3HvH4ReplacementBoundaries>,
): HvChargeSession[] {
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

  for (const session of segmentSessions) {
    const classification = classifyM3_3HvH4ChargeSessionA2Contribution({
      session,
      replacementBoundaries: input.replacementBoundaries,
      expectedOrganizationId: input.data.organizationId,
      expectedVehicleId: input.data.vehicleId,
    });
    input.sessionClassifications.push({
      sessionId: session.id,
      lifecycleSegmentId: input.lifecycleSegmentId,
      contributionEligibility: classification.eligibility,
      reasonCodes: classification.reasonCodes,
    });
    if (classification.eligibility !== 'ELIGIBLE_CONTRIBUTOR') {
      incrementCount(excludedCounts, classification.eligibility);
    }
  }

  const excludedSessionCount = segmentSessions.length;
  let includedSessions: HvChargeSession[] = [];
  let compositionStatus: M3_3HvH4LifecycleChargeThroughputSegmentV1['compositionStatus'] =
    'NO_TRUSTED_SESSIONS';
  let boundedObservedChargeThroughputKwh: number | null = null;

  if (input.data.chargeSessionSourceLoad.sourceTruncated) {
    compositionStatus = 'SOURCE_TRUNCATED';
    reasonCodes.push('CHARGE_SESSION_SOURCE_TRUNCATED');
  } else {
    includedSessions = sortM3_3HvH4ChargeSessionsCanonical(
      segmentSessions.filter((session) => {
        const hit = input.sessionClassifications.find(
          (c) => c.sessionId === session.id && c.lifecycleSegmentId === input.lifecycleSegmentId,
        );
        return hit?.contributionEligibility === 'ELIGIBLE_CONTRIBUTOR';
      }),
    );

    if (includedSessions.length === 0) {
      compositionStatus = 'NO_TRUSTED_SESSIONS';
      reasonCodes.push('NO_ELIGIBLE_NATIVE_CONTRIBUTOR');
    } else if (detectOverlappingEligibleNativeSessions(includedSessions)) {
      compositionStatus = 'SOURCE_CONFLICT';
      reasonCodes.push('OVERLAPPING_ELIGIBLE_NATIVE_SESSIONS');
    } else if (detectDuplicateProviderSegmentIdentity(includedSessions)) {
      compositionStatus = 'SOURCE_CONFLICT';
      reasonCodes.push('DUPLICATE_PROVIDER_SEGMENT_IDENTITY');
    } else {
      boundedObservedChargeThroughputKwh = includedSessions.reduce(
        (sum, s) => sum + (s.energyAddedKwh ?? 0),
        0,
      );
      compositionStatus = 'AVAILABLE_OBSERVED_GAP_AWARE';
    }
  }

  const includedSessionCount = includedSessions.length;
  const excludedSessionCountFinal = excludedSessionCount - includedSessionCount;

  const sourceFingerprint = buildSegmentSourceFingerprint({
    contractVersion: M3_3_HV_H4_BOUNDED_CHARGE_THROUGHPUT_V1,
    coverageReportVersion: M3_3_HV_H4_COVERAGE_REPORT_V1,
    exposureSourceAuthorityVersion: M3_3_HV_H4_EXPOSURE_SOURCE_AUTHORITY_V1,
    organizationId: input.data.organizationId,
    vehicleId: input.data.vehicleId,
    lifecycleSegmentId: input.lifecycleSegmentId,
    evaluationAt: input.data.evaluationAt.toISOString(),
    includedSessions:
      compositionStatus === 'AVAILABLE_OBSERVED_GAP_AWARE' ? includedSessions : [],
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
    excludedSessionCount: excludedSessionCountFinal,
    excludedCountsByEligibility: excludedCounts,
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
  if (report.lifetimeComplete !== false || report.bidirectionalThroughput !== false) {
    throw new Error('M3.3-HV-H4-A2: lifetime/bidirectional flags must be false');
  }
  if (report.customerPublicationEligible !== false) {
    throw new Error('M3.3-HV-H4-A2: customerPublicationEligible must be false');
  }
  for (const segment of report.segments) {
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
        segment.includedSessionCount < 1
      ) {
        throw new Error('M3.3-HV-H4-A2: AVAILABLE requires numeric sum and sessions');
      }
    }
  }
}
