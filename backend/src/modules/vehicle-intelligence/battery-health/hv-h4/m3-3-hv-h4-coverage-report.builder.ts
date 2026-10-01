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
import {
  buildM3_3HvH4LifecycleSegmentRefs,
  resolveM3_3HvH4LifecycleSegmentForInstant,
  resolveM3_3HvH4ReplacementBoundaries,
} from './m3-3-hv-h4-lifecycle.util';
import type {
  M3_3HvH4AxisCoverageEntryV1,
  M3_3HvH4CoverageReportV1,
  M3_3HvH4ExposureAxis,
  M3_3HvH4ExposureEvidenceStartV1,
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

function isNearRetentionBoundary(
  observed: Date | null,
  cutoff: Date,
  toleranceMs = MS_PER_DAY,
): boolean {
  if (!observed) return false;
  return Math.abs(observed.getTime() - cutoff.getTime()) <= toleranceMs;
}

function buildEvidenceStart(input: {
  axis: M3_3HvH4ExposureAxis;
  organizationId: string;
  vehicleId: string;
  lifecycleSegmentId: string;
  earliestObservedAt: Date | null;
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
    earliestTrustedAt: iso(input.earliestObservedAt),
    source: input.source,
    sourceIdentity: input.sourceIdentity,
    boundaryKind: input.boundaryKind,
    completenessFromBoundary: input.coverageClass,
    reasonCodes: input.reasonCodes,
  };
}

function segmentSessions(
  data: M3_3HvH4LoadedDataV1,
  segmentId: string,
  replacementBoundaries: ReturnType<typeof resolveM3_3HvH4ReplacementBoundaries>,
): typeof data.chargeSessions {
  return data.chargeSessions.filter((s) => {
    const instant = s.startAt;
    return (
      resolveM3_3HvH4LifecycleSegmentForInstant({
        instant,
        replacementBoundaries,
      }) === segmentId
    );
  });
}

function buildAxisEntryForSegment(input: {
  axis: M3_3HvH4ExposureAxis;
  data: M3_3HvH4LoadedDataV1;
  lifecycleSegmentId: string;
  replacementBoundaries: ReturnType<typeof resolveM3_3HvH4ReplacementBoundaries>;
}): M3_3HvH4AxisCoverageEntryV1 {
  const authority = buildM3_3HvH4ExposureSourceAuthorityContractV1().axes.find(
    (a) => a.axis === input.axis,
  )!;
  const reasonCodes: string[] = [];
  const gapReasons: string[] = [];
  let gapKind: M3_3HvH4AxisCoverageEntryV1['gapSummary']['gapKind'] = 'POSSIBLE_GAP';

  const sessions = segmentSessions(input.data, input.lifecycleSegmentId, input.replacementBoundaries);
  const segmentRef = buildM3_3HvH4LifecycleSegmentRefs(input.replacementBoundaries).find(
    (s) => s.lifecycleSegmentId === input.lifecycleSegmentId,
  );
  const replacementAt = segmentRef?.replacementBoundaryEffectiveAt
    ? new Date(segmentRef.replacementBoundaryEffectiveAt)
    : null;

  let earliest: Date | null = null;
  let latest: Date | null = null;
  const sourceSummaries: M3_3HvH4SourceSummaryV1[] = [];

  switch (input.axis) {
    case 'CALENDAR_TIME': {
      earliest = minDate([
        dataEarliestFromSessions(sessions),
        input.data.hvSnapshots.earliest,
        replacementAt,
      ]);
      latest = maxDate([dataLatestFromSessions(sessions), input.data.hvSnapshots.latest]);
      sourceSummaries.push(
        rangeSummary('HvChargeSession.startAt', sessions.length, earliest, latest, 'WINDOW_LIMITED'),
      );
      if (input.data.hvSnapshots.count > 0) {
        sourceSummaries.push(
          rangeSummary(
            'HvBatteryHealthSnapshot.recordedAt',
            input.data.hvSnapshots.count,
            input.data.hvSnapshots.earliest,
            input.data.hvSnapshots.latest,
            'WINDOW_LIMITED',
          ),
        );
      }
      break;
    }
    case 'CHARGE_THROUGHPUT_KWH': {
      earliest = dataEarliestFromSessions(sessions);
      latest = dataLatestFromSessions(sessions);
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
      break;
    }
    case 'ODOMETER_KM': {
      earliest = input.data.hvSnapshots.earliest;
      latest = input.data.hvSnapshots.latest;
      sourceSummaries.push(
        rangeSummary(
          'HvBatteryHealthSnapshot.odometerKm',
          input.data.hvSnapshots.count,
          earliest,
          latest,
          'WINDOW_LIMITED',
          ['SEGMENT_METADATA_ODOMETER_IS_MIN_MAX_EXTREMA'],
        ),
      );
      reasonCodes.push('ODOMETER_LIFECYCLE_BASELINE_UNKNOWN');
      break;
    }
    case 'TEMPERATURE_EXPOSURE': {
      earliest = minDate([input.data.hvSnapshots.earliest, input.data.hvTemperatureEvidence.earliest]);
      latest = maxDate([input.data.hvSnapshots.latest, input.data.hvTemperatureEvidence.latest]);
      sourceSummaries.push(
        rangeSummary(
          'HvBatteryHealthSnapshot.temperatureC',
          input.data.hvSnapshots.count,
          input.data.hvSnapshots.earliest,
          input.data.hvSnapshots.latest,
          'WINDOW_LIMITED',
        ),
      );
      if (input.data.hvTemperatureEvidence.count > 0) {
        sourceSummaries.push(
          rangeSummary(
            'BatteryEvidence.BATTERY_TEMPERATURE_C',
            input.data.hvTemperatureEvidence.count,
            input.data.hvTemperatureEvidence.earliest,
            input.data.hvTemperatureEvidence.latest,
            'WINDOW_LIMITED',
          ),
        );
      }
      gapReasons.push('SNAPSHOT_TRIGGER_BIAS_NOT_CADENCE_COMPLETE');
      break;
    }
    case 'SOC_WINDOW_EXPOSURE': {
      earliest = minDate([input.data.hvSnapshots.earliest, input.data.hvSocEvidence.earliest]);
      latest = maxDate([input.data.hvSnapshots.latest, input.data.hvSocEvidence.latest]);
      sourceSummaries.push(
        rangeSummary(
          'HvBatteryHealthSnapshot.socPercent',
          input.data.hvSnapshots.count,
          input.data.hvSnapshots.earliest,
          input.data.hvSnapshots.latest,
          'WINDOW_LIMITED',
        ),
      );
      gapReasons.push('SOC_TIME_INTEGRATION_NOT_AUTHORIZED');
      break;
    }
    case 'FAST_CHARGE_EXPOSURE': {
      earliest = minDate([
        input.data.hvSnapshots.earliest,
        input.data.hvChargingPowerEvidence.earliest,
      ]);
      latest = maxDate([input.data.hvSnapshots.latest, input.data.hvChargingPowerEvidence.latest]);
      sourceSummaries.push(
        rangeSummary(
          'HvBatteryHealthSnapshot.chargingPowerKw',
          input.data.hvSnapshots.count,
          input.data.hvSnapshots.earliest,
          input.data.hvSnapshots.latest,
          'WINDOW_LIMITED',
        ),
      );
      gapReasons.push('NATIVE_RECHARGE_SEGMENT_EXCLUDES_CHARGING_POWER');
      break;
    }
    case 'FULL_EQUIVALENT_CYCLES':
    default:
      earliest = null;
      latest = null;
      gapKind = 'KNOWN_GAP';
      gapReasons.push('FEC_NOT_AVAILABLE');
      break;
  }

  if (
    earliest &&
    (input.axis === 'CHARGE_THROUGHPUT_KWH'
      ? isNearRetentionBoundary(earliest, input.data.retentionCutoffs.hvChargeSessionEarliestRemaining)
      : isNearRetentionBoundary(earliest, input.data.retentionCutoffs.hvSnapshotEarliestRemaining))
  ) {
    reasonCodes.push('RETENTION_BOUNDARY_NOT_EVIDENCE_START');
    gapReasons.push('RETENTION_TRUNCATED');
    gapKind = 'TRUNCATED_HISTORY';
  }

  if (!earliest) {
    reasonCodes.push('NO_EVIDENCE_BEFORE_FIRST_OBSERVATION');
    gapKind = 'KNOWN_GAP';
  }

  let boundaryKind: M3_3HvH4ExposureEvidenceStartV1['boundaryKind'] = 'FIRST_DURABLE_OBSERVATION';
  if (replacementAt && earliest && earliest.getTime() === replacementAt.getTime()) {
    boundaryKind = 'LIFECYCLE_REPLACEMENT_BOUNDARY';
  }
  if (reasonCodes.includes('RETENTION_BOUNDARY_NOT_EVIDENCE_START')) {
    boundaryKind = 'RETENTION_BOUNDARY';
  }

  const evidenceStart = buildEvidenceStart({
    axis: input.axis,
    organizationId: input.data.organizationId,
    vehicleId: input.data.vehicleId,
    lifecycleSegmentId: input.lifecycleSegmentId,
    earliestObservedAt: earliest,
    source: sourceSummaries[0]?.source ?? 'NONE',
    sourceIdentity: sourceSummaries[0]?.source ?? 'NONE',
    boundaryKind,
    coverageClass: authority.coverageClass,
    reasonCodes: [...reasonCodes, ...gapReasons],
  });

  return {
    axis: input.axis,
    lifecycleSegmentId: input.lifecycleSegmentId,
    coverageClass: authority.coverageClass,
    semanticAuthority: authority.semanticAuthority,
    earliestObservedAt: iso(earliest),
    earliestTrustedAt: iso(earliest),
    latestObservedAt: iso(latest),
    retentionContinuity: authority.retentionContinuity,
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
  const axisAuthorities = buildM3_3HvH4ExposureSourceAuthorityContractV1().axes;

  const axes: M3_3HvH4AxisCoverageEntryV1[] = [];
  for (const segment of lifecycleSegments) {
    for (const axis of axisAuthorities) {
      axes.push(
        buildAxisEntryForSegment({
          axis: axis.axis,
          data,
          lifecycleSegmentId: segment.lifecycleSegmentId,
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
}
