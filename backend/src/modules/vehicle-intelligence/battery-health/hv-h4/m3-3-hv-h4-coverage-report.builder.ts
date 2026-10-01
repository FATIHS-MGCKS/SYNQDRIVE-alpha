import {
  M3_3_HV_H4_COVERAGE_REPORT_V1,
  M3_3_HV_H4_DEFAULT_RETENTION_DAYS,
  M3_3_HV_H4_EXPOSURE_SOURCE_AUTHORITY_V1,
  H4_AUTOMATIC_RUNTIME_REACHABLE,
} from './m3-3-hv-h4.constants';
import { buildM3_3HvH4ExposureSourceAuthorityContractV1 } from './m3-3-hv-h4-exposure-source-authority.v1';
import {
  assertM3_3HvH4EnergySemanticFirewall,
  classifyM3_3HvH4ChargeSessionFutureThroughput,
} from './m3-3-hv-h4-charge-session-source-authority';
import type { M3_3HvH4LoadedDataV1 } from './m3-3-hv-h4-loaded-data.types';
import type { M3_3HvH4ObservedRange } from './m3-3-hv-h4-loaded-data.types';
import {
  buildM3_3HvH4LifecycleSegmentIntervals,
  buildM3_3HvH4LifecycleSegmentRefs,
  instantWithinM3_3HvH4SegmentInterval,
  resolveM3_3HvH4LifecycleSegmentForInstant,
  resolveM3_3HvH4ReplacementBoundaries,
  type M3_3HvH4LifecycleSegmentInterval,
} from './m3-3-hv-h4-lifecycle.util';
import type {
  M3_3HvH4AxisCoverageEntryV1,
  M3_3HvH4CoverageReportV1,
  M3_3HvH4ExposureAxis,
  M3_3HvH4ExposureEvidenceStartV1,
  M3_3HvH4RetentionInferenceKind,
  M3_3HvH4SegmentEvidenceState,
  M3_3HvH4SourceSummaryV1,
} from './m3-3-hv-h4.types';

const MS_PER_DAY = 86_400_000;

function iso(d: Date | null | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function minDate(dates: (Date | null | undefined)[]): Date | null {
  let min: Date | null = null;
  for (const d of dates) {
    if (!d || Number.isNaN(d.getTime())) continue;
    if (!min || d.getTime() < min.getTime()) min = d;
  }
  return min;
}

function maxDate(dates: (Date | null | undefined)[]): Date | null {
  let max: Date | null = null;
  for (const d of dates) {
    if (!d || Number.isNaN(d.getTime())) continue;
    if (!max || d.getTime() > max.getTime()) max = d;
  }
  return max;
}

function rangeFromTimestamps(timestamps: Date[]): M3_3HvH4ObservedRange {
  if (timestamps.length === 0) {
    return { count: 0, earliest: null, latest: null };
  }
  return {
    count: timestamps.length,
    earliest: timestamps[0] ?? null,
    latest: timestamps[timestamps.length - 1] ?? null,
  };
}

function filterTimestampsForInterval(
  timestamps: Date[],
  interval: M3_3HvH4LifecycleSegmentInterval,
): Date[] {
  return timestamps.filter((t) => instantWithinM3_3HvH4SegmentInterval(t, interval));
}

function inferRetention(
  earliest: Date | null,
  policyCutoff: Date,
  axis: M3_3HvH4ExposureAxis,
): M3_3HvH4RetentionInferenceKind {
  if (!earliest) {
    return 'NO_RETENTION_TRUNCATION_EVIDENCE';
  }
  const nearPolicyWindow =
    Math.abs(earliest.getTime() - policyCutoff.getTime()) <= MS_PER_DAY;
  if (nearPolicyWindow) {
    return axis === 'CHARGE_THROUGHPUT_KWH'
      ? 'RETENTION_POLICY_WINDOW_LIMITED'
      : 'RETENTION_POLICY_WINDOW_LIMITED';
  }
  return 'NO_RETENTION_TRUNCATION_EVIDENCE';
}

function retentionGapReasons(inference: M3_3HvH4RetentionInferenceKind): string[] {
  switch (inference) {
    case 'RETENTION_POLICY_WINDOW_LIMITED':
      return ['RETENTION_POLICY_WINDOW_LIMITED'];
    case 'RETENTION_TRUNCATION_POSSIBLE':
      return ['RETENTION_TRUNCATION_POSSIBLE'];
    case 'ACTUAL_RETENTION_TRUNCATION_CONFIRMED':
      return ['ACTUAL_RETENTION_TRUNCATION_CONFIRMED'];
    default:
      return [];
  }
}

function buildEvidenceStart(input: {
  axis: M3_3HvH4ExposureAxis;
  organizationId: string;
  vehicleId: string;
  lifecycleSegmentId: string;
  earliestObservedAt: Date | null;
  earliestTrustedAt: Date | null;
  source: string;
  sourceIdentity: string;
  boundaryKind: M3_3HvH4ExposureEvidenceStartV1['boundaryKind'];
  coverageClass: M3_3HvH4ExposureEvidenceStartV1['completenessFromBoundary'];
  reasonCodes: string[];
}): M3_3HvH4ExposureEvidenceStartV1 {
  return {
    axis: input.axis,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    lifecycleSegmentId: input.lifecycleSegmentId,
    earliestObservedAt: iso(input.earliestObservedAt),
    earliestTrustedAt: iso(input.earliestTrustedAt),
    source: input.source,
    sourceIdentity: input.sourceIdentity,
    boundaryKind: input.boundaryKind,
    completenessFromBoundary: input.coverageClass,
    reasonCodes: input.reasonCodes,
  };
}

function segmentSessions(
  data: M3_3HvH4LoadedDataV1,
  interval: M3_3HvH4LifecycleSegmentInterval,
  replacementBoundaries: ReturnType<typeof resolveM3_3HvH4ReplacementBoundaries>,
): typeof data.chargeSessions {
  return data.chargeSessions.filter((s) => {
    const segmentId = resolveM3_3HvH4LifecycleSegmentForInstant({
      instant: s.startAt,
      replacementBoundaries,
    });
    return (
      segmentId === interval.lifecycleSegmentId &&
      instantWithinM3_3HvH4SegmentInterval(s.startAt, interval)
    );
  });
}

function trustedChargeThroughputStart(
  sessions: M3_3HvH4LoadedDataV1['chargeSessions'],
  replacementBoundaries: ReturnType<typeof resolveM3_3HvH4ReplacementBoundaries>,
): Date | null {
  const eligibleStarts: Date[] = [];
  for (const session of sessions) {
    const classification = classifyM3_3HvH4ChargeSessionFutureThroughput({
      session,
      replacementBoundaries,
    });
    if (classification.eligibility === 'ELIGIBLE_NATIVE') {
      eligibleStarts.push(session.startAt);
    }
  }
  return minDate(eligibleStarts);
}

function resolveSegmentEvidenceState(input: {
  axis: M3_3HvH4ExposureAxis;
  observedCount: number;
  earliestTrustedAt: Date | null;
  authorityIntegrationAllowed: boolean;
}): M3_3HvH4SegmentEvidenceState {
  if (input.observedCount === 0) {
    return 'NO_OBSERVED_SOURCE';
  }
  if (input.axis === 'CHARGE_THROUGHPUT_KWH') {
    return input.earliestTrustedAt ? 'TRUSTED_SOURCE_PRESENT' : 'OBSERVED_CONTEXT_ONLY';
  }
  if (input.authorityIntegrationAllowed && input.earliestTrustedAt) {
    return 'TRUSTED_SOURCE_PRESENT';
  }
  return 'OBSERVED_CONTEXT_ONLY';
}

function buildAxisEntryForSegment(input: {
  axis: M3_3HvH4ExposureAxis;
  data: M3_3HvH4LoadedDataV1;
  interval: M3_3HvH4LifecycleSegmentInterval;
  replacementBoundaries: ReturnType<typeof resolveM3_3HvH4ReplacementBoundaries>;
}): M3_3HvH4AxisCoverageEntryV1 {
  const authority = buildM3_3HvH4ExposureSourceAuthorityContractV1().axes.find(
    (a) => a.axis === input.axis,
  )!;
  const reasonCodes: string[] = [];
  const gapReasons: string[] = [];
  let gapKind: M3_3HvH4AxisCoverageEntryV1['gapSummary']['gapKind'] = 'POSSIBLE_GAP';

  const sessions = segmentSessions(input.data, input.interval, input.replacementBoundaries);
  const snapshotTs = filterTimestampsForInterval(
    input.data.hvSnapshotRecordedAt,
    input.interval,
  );
  const socTs = filterTimestampsForInterval(input.data.hvSocEvidenceObservedAt, input.interval);
  const tempTs = filterTimestampsForInterval(
    input.data.hvTemperatureEvidenceObservedAt,
    input.interval,
  );
  const powerTs = filterTimestampsForInterval(
    input.data.hvChargingPowerEvidenceObservedAt,
    input.interval,
  );
  const hvSnapshots = rangeFromTimestamps(snapshotTs);
  const hvSocEvidence = rangeFromTimestamps(socTs);
  const hvTemperatureEvidence = rangeFromTimestamps(tempTs);
  const hvChargingPowerEvidence = rangeFromTimestamps(powerTs);

  const replacementAt = input.interval.startInclusive;

  let earliest: Date | null = null;
  let latest: Date | null = null;
  let earliestTrusted: Date | null = null;
  const sourceSummaries: M3_3HvH4SourceSummaryV1[] = [];

  switch (input.axis) {
    case 'CALENDAR_TIME': {
      earliest = minDate([
        dataEarliestFromSessions(sessions),
        hvSnapshots.earliest,
        replacementAt,
      ]);
      latest = maxDate([dataLatestFromSessions(sessions), hvSnapshots.latest]);
      earliestTrusted = earliest;
      sourceSummaries.push(
        rangeSummary('HvChargeSession.startAt', sessions.length, earliest, latest, 'WINDOW_LIMITED'),
      );
      if (hvSnapshots.count > 0) {
        sourceSummaries.push(
          rangeSummary(
            'HvBatteryHealthSnapshot.recordedAt',
            hvSnapshots.count,
            hvSnapshots.earliest,
            hvSnapshots.latest,
            'WINDOW_LIMITED',
          ),
        );
      }
      break;
    }
    case 'CHARGE_THROUGHPUT_KWH': {
      earliest = dataEarliestFromSessions(sessions);
      latest = dataLatestFromSessions(sessions);
      earliestTrusted = trustedChargeThroughputStart(sessions, input.replacementBoundaries);
      sourceSummaries.push(
        rangeSummary(
          'HvChargeSession (episode authority)',
          sessions.length,
          earliest,
          latest,
          'WINDOW_LIMITED',
          ['NO_CUMULATIVE_VALUE_IN_H4_A1'],
        ),
      );
      gapReasons.push('PROVIDER_QUERY_WINDOW_31D', 'UNKNOWN_COLLECTION_GAP');
      if (sessions.some((s) => (s.metadata as { startedBeforeRange?: boolean })?.startedBeforeRange)) {
        gapReasons.push('SESSION_STARTED_BEFORE_QUERY_RANGE');
      }
      if (input.data.chargeSessionSourceLoad.sourceTruncated) {
        gapReasons.push('CHARGE_SESSION_SOURCE_TRUNCATED');
        gapKind = 'TRUNCATED_HISTORY';
        reasonCodes.push('SOURCE_LOAD_HARD_LIMIT');
      }
      if (earliest && !earliestTrusted) {
        reasonCodes.push('OBSERVED_SESSIONS_WITHOUT_QUALIFIED_NATIVE_TRUST_START');
      }
      break;
    }
    case 'ODOMETER_KM': {
      earliest = hvSnapshots.earliest;
      latest = hvSnapshots.latest;
      earliestTrusted = null;
      sourceSummaries.push(
        rangeSummary(
          'HvBatteryHealthSnapshot.odometerKm',
          hvSnapshots.count,
          earliest,
          latest,
          'WINDOW_LIMITED',
          ['SEGMENT_METADATA_ODOMETER_IS_MIN_MAX_EXTREMA'],
        ),
      );
      reasonCodes.push('ODOMETER_LIFECYCLE_BASELINE_UNKNOWN');
      reasonCodes.push('POINT_CONTEXT_ONLY_NO_INTEGRATION_TRUST');
      break;
    }
    case 'TEMPERATURE_EXPOSURE': {
      earliest = minDate([hvSnapshots.earliest, hvTemperatureEvidence.earliest]);
      latest = maxDate([hvSnapshots.latest, hvTemperatureEvidence.latest]);
      earliestTrusted = null;
      sourceSummaries.push(
        rangeSummary(
          'HvBatteryHealthSnapshot.temperatureC',
          hvSnapshots.count,
          hvSnapshots.earliest,
          hvSnapshots.latest,
          'WINDOW_LIMITED',
        ),
      );
      if (hvTemperatureEvidence.count > 0) {
        sourceSummaries.push(
          rangeSummary(
            'BatteryEvidence.BATTERY_TEMPERATURE_C',
            hvTemperatureEvidence.count,
            hvTemperatureEvidence.earliest,
            hvTemperatureEvidence.latest,
            'WINDOW_LIMITED',
          ),
        );
      }
      gapReasons.push('SNAPSHOT_TRIGGER_BIAS_NOT_CADENCE_COMPLETE');
      reasonCodes.push('POINT_CONTEXT_ONLY_NO_INTEGRATION_TRUST');
      break;
    }
    case 'SOC_WINDOW_EXPOSURE': {
      earliest = minDate([hvSnapshots.earliest, hvSocEvidence.earliest]);
      latest = maxDate([hvSnapshots.latest, hvSocEvidence.latest]);
      earliestTrusted = null;
      sourceSummaries.push(
        rangeSummary(
          'HvBatteryHealthSnapshot.socPercent',
          hvSnapshots.count,
          hvSnapshots.earliest,
          hvSnapshots.latest,
          'WINDOW_LIMITED',
        ),
      );
      if (hvSocEvidence.count > 0) {
        sourceSummaries.push(
          rangeSummary(
            'BatteryEvidence.SOC_PERCENT',
            hvSocEvidence.count,
            hvSocEvidence.earliest,
            hvSocEvidence.latest,
            'WINDOW_LIMITED',
          ),
        );
      }
      gapReasons.push('SOC_TIME_INTEGRATION_NOT_AUTHORIZED');
      reasonCodes.push('POINT_CONTEXT_ONLY_NO_INTEGRATION_TRUST');
      break;
    }
    case 'FAST_CHARGE_EXPOSURE': {
      earliest = minDate([hvSnapshots.earliest, hvChargingPowerEvidence.earliest]);
      latest = maxDate([hvSnapshots.latest, hvChargingPowerEvidence.latest]);
      earliestTrusted = null;
      sourceSummaries.push(
        rangeSummary(
          'HvBatteryHealthSnapshot.chargingPowerKw',
          hvSnapshots.count,
          hvSnapshots.earliest,
          hvSnapshots.latest,
          'WINDOW_LIMITED',
        ),
      );
      gapReasons.push('NATIVE_RECHARGE_SEGMENT_EXCLUDES_CHARGING_POWER');
      reasonCodes.push('POINT_CONTEXT_ONLY_NO_INTEGRATION_TRUST');
      break;
    }
    case 'FULL_EQUIVALENT_CYCLES':
    default:
      earliest = null;
      latest = null;
      earliestTrusted = null;
      gapKind = 'KNOWN_GAP';
      gapReasons.push('FEC_NOT_AVAILABLE');
      break;
  }

  const retentionInference = inferRetention(
    earliest,
    input.axis === 'CHARGE_THROUGHPUT_KWH'
      ? input.data.retentionCutoffs.hvChargeSessionEarliestRemaining
      : input.data.retentionCutoffs.hvSnapshotEarliestRemaining,
    input.axis,
  );
  gapReasons.push(...retentionGapReasons(retentionInference));
  if (retentionInference === 'RETENTION_POLICY_WINDOW_LIMITED') {
    reasonCodes.push('RETENTION_BOUNDARY_NOT_EVIDENCE_START');
    if (gapKind !== 'TRUNCATED_HISTORY') {
      gapKind = 'POSSIBLE_GAP';
    }
  }

  if (!earliest) {
    reasonCodes.push('NO_EVIDENCE_BEFORE_FIRST_OBSERVATION');
    gapKind = 'KNOWN_GAP';
  }

  let boundaryKind: M3_3HvH4ExposureEvidenceStartV1['boundaryKind'] = 'FIRST_DURABLE_OBSERVATION';
  if (input.axis === 'CHARGE_THROUGHPUT_KWH' && earliestTrusted) {
    boundaryKind = 'FIRST_QUALIFIED_SESSION';
  } else if (replacementAt && earliest && earliest.getTime() === replacementAt.getTime()) {
    boundaryKind = 'LIFECYCLE_REPLACEMENT_BOUNDARY';
  }

  const observedCount =
    sessions.length +
    hvSnapshots.count +
    (input.axis === 'SOC_WINDOW_EXPOSURE' ? hvSocEvidence.count : 0) +
    (input.axis === 'TEMPERATURE_EXPOSURE' ? hvTemperatureEvidence.count : 0) +
    (input.axis === 'FAST_CHARGE_EXPOSURE' ? hvChargingPowerEvidence.count : 0);

  const segmentEvidenceState = resolveSegmentEvidenceState({
    axis: input.axis,
    observedCount,
    earliestTrustedAt: earliestTrusted,
    authorityIntegrationAllowed: authority.integrationAllowed,
  });

  if (
    input.axis === 'CHARGE_THROUGHPUT_KWH' &&
    segmentEvidenceState === 'OBSERVED_CONTEXT_ONLY' &&
    authority.coverageClass === 'BOUNDED_GAP_AWARE'
  ) {
    reasonCodes.push('SEGMENT_BOUNDED_ACCUMULATION_NOT_YET_STARTABLE');
  }

  const evidenceStart = buildEvidenceStart({
    axis: input.axis,
    organizationId: input.data.organizationId,
    vehicleId: input.data.vehicleId,
    lifecycleSegmentId: input.interval.lifecycleSegmentId,
    earliestObservedAt: earliest,
    earliestTrustedAt: earliestTrusted,
    source: sourceSummaries[0]?.source ?? 'NONE',
    sourceIdentity: sourceSummaries[0]?.source ?? 'NONE',
    boundaryKind,
    coverageClass: authority.coverageClass,
    reasonCodes: [...reasonCodes, ...gapReasons],
  });

  return {
    axis: input.axis,
    lifecycleSegmentId: input.interval.lifecycleSegmentId,
    coverageClass: authority.coverageClass,
    semanticAuthority: authority.semanticAuthority,
    segmentEvidenceState,
    earliestObservedAt: iso(earliest),
    earliestTrustedAt: iso(earliestTrusted),
    latestObservedAt: iso(latest),
    retentionContinuity: authority.retentionContinuity,
    retentionInference,
    replacementSegmentable: true,
    sourceSummaries,
    gapSummary: { gapKind, reasonCodes: gapReasons },
    integrationAllowed: authority.integrationAllowed,
    reasonCodes,
    evidenceStart,
  };
}

function dataEarliestFromSessions(sessions: { startAt: Date }[]): Date | null {
  return minDate(sessions.map((s) => s.startAt));
}

function dataLatestFromSessions(sessions: { endAt: Date | null; startAt: Date }[]): Date | null {
  return maxDate(sessions.map((s) => s.endAt ?? s.startAt));
}

function rangeSummary(
  source: string,
  rowCount: number,
  earliest: Date | null,
  latest: Date | null,
  retentionContinuity: M3_3HvH4SourceSummaryV1['retentionContinuity'],
  notes: string[] = [],
): M3_3HvH4SourceSummaryV1 {
  return {
    source,
    earliestObservedAt: iso(earliest),
    latestObservedAt: iso(latest),
    rowCount,
    retentionContinuity,
    notes,
  };
}

export function buildM3_3HvH4CoverageReportV1(data: M3_3HvH4LoadedDataV1): M3_3HvH4CoverageReportV1 {
  const replacementBoundaries = resolveM3_3HvH4ReplacementBoundaries(
    data.groundTruthEvents,
    data.evaluationAt,
  );
  const lifecycleSegments = buildM3_3HvH4LifecycleSegmentRefs(replacementBoundaries);
  const segmentIntervals = buildM3_3HvH4LifecycleSegmentIntervals({
    replacementBoundaries,
    evaluationAt: data.evaluationAt,
  });
  const axisAuthorities = buildM3_3HvH4ExposureSourceAuthorityContractV1().axes;

  const axes: M3_3HvH4AxisCoverageEntryV1[] = [];
  for (const interval of segmentIntervals) {
    for (const axis of axisAuthorities) {
      axes.push(
        buildAxisEntryForSegment({
          axis: axis.axis,
          data,
          interval,
          replacementBoundaries,
        }),
      );
    }
  }

  const chargeSessionClassifications = data.chargeSessions.map((session) => {
    const classification = classifyM3_3HvH4ChargeSessionFutureThroughput({
      session,
      replacementBoundaries,
    });
    return {
      sessionId: session.id,
      lifecycleSegmentId: resolveM3_3HvH4LifecycleSegmentForInstant({
        instant: session.startAt,
        replacementBoundaries,
      }),
      futureThroughputEligibility: classification.eligibility,
      reasonCodes: classification.reasonCodes,
    };
  });

  const firewall = assertM3_3HvH4EnergySemanticFirewall();

  return {
    contractVersion: M3_3_HV_H4_EXPOSURE_SOURCE_AUTHORITY_V1,
    reportVersion: M3_3_HV_H4_COVERAGE_REPORT_V1,
    organizationId: data.organizationId,
    vehicleId: data.vehicleId,
    evaluationAt: data.evaluationAt.toISOString(),
    lifecycleSegments,
    axisAuthorities,
    axes,
    chargeSessionClassifications,
    energySemanticFirewall: firewall,
    retentionAuthority: {
      existingAggregatesPreserveChargeThroughput: false,
      hvChargeSessionRetentionDaysDefault: M3_3_HV_H4_DEFAULT_RETENTION_DAYS.hvChargeSessions,
      hvSnapshotRetentionDaysDefault: M3_3_HV_H4_DEFAULT_RETENTION_DAYS.hvProviderSnapshots,
      retentionBoundaryDistinctFromEvidenceStart: true,
    },
    chargeSessionSourceLoad: { ...data.chargeSessionSourceLoad },
    automaticRuntimeReachable: H4_AUTOMATIC_RUNTIME_REACHABLE,
    customerPublicationEligible: false,
    cumulativeExposureValues: false,
  };
}

export function validateM3_3HvH4CoverageReportContract(report: M3_3HvH4CoverageReportV1): void {
  if (report.cumulativeExposureValues !== false) {
    throw new Error('M3.3-HV-H4: cumulativeExposureValues must be false');
  }
  if (report.customerPublicationEligible !== false) {
    throw new Error('M3.3-HV-H4: customerPublicationEligible must be false');
  }
  if (report.automaticRuntimeReachable !== false) {
    throw new Error('M3.3-HV-H4: automaticRuntimeReachable must be false');
  }
  const fec = report.axes.find(
    (a) => a.axis === 'FULL_EQUIVALENT_CYCLES' && a.lifecycleSegmentId === 'HV_SEGMENT_0',
  );
  if (fec?.coverageClass !== 'UNAVAILABLE') {
    throw new Error('M3.3-HV-H4: FEC must remain UNAVAILABLE');
  }
  if (report.chargeSessionSourceLoad.hardLimitReached && !report.chargeSessionSourceLoad.sourceTruncated) {
    throw new Error('M3.3-HV-H4: hardLimitReached requires sourceTruncated');
  }
}
