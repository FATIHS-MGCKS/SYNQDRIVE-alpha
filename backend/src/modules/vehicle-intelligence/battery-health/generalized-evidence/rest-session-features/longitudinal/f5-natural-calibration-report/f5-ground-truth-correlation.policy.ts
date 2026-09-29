import { BatteryGroundTruthType } from '@prisma/client';
import {
  buildGroundTruthSuccessorsByPriorId,
  isGroundTruthActiveAtAsOf,
} from '../../../../ground-truth/ground-truth-historical-authority.util';
import {
  F5_GROUND_TRUTH_CORRELATION_BATTERY_SCOPE,
  F5_LONGITUDINAL_SCOPE_AUTHORITY,
} from './f5-ground-truth-correlation.constants';
import type {
  F5GroundTruthCorrelationBlockV2,
  F5GroundTruthRowForCorrelation,
  F5GroundTruthTemporalRegionV1,
  F5NatNaturalEvidenceStatusV1,
  F5RevisionEvidenceInterval,
  F5SegmentationSummaryForCorrelation,
} from './f5-ground-truth-correlation.types';
import {
  compareReplacementBoundaries,
  type F5ReplacementBoundaryV1,
} from './f5-longitudinal-segmentation.policy';

export function classifyEvidenceIntervalVsReplacementEffectiveAt(
  firstIncludedAnchorAt: Date | null,
  lastIncludedAnchorAt: Date | null,
  effectiveAt: Date,
): F5GroundTruthTemporalRegionV1 {
  if (!firstIncludedAnchorAt || !lastIncludedAnchorAt) {
    return 'UNKNOWN';
  }
  const a = firstIncludedAnchorAt.getTime();
  const b = lastIncludedAnchorAt.getTime();
  const t = effectiveAt.getTime();
  if (b < t) {
    return 'PRE_EVENT';
  }
  if (a > t) {
    return 'POST_EVENT';
  }
  return 'INTERVENTION_WINDOW';
}

function compareReplacementGt(a: F5GroundTruthRowForCorrelation, b: F5GroundTruthRowForCorrelation): number {
  const dt = a.effectiveAt.getTime() - b.effectiveAt.getTime();
  if (dt !== 0) return dt;
  return a.id.localeCompare(b.id);
}

function vehicleKey(organizationId: string, vehicleId: string): string {
  return `${organizationId}::${vehicleId}`;
}

function naturalEvidenceStatus(count: number): F5NatNaturalEvidenceStatusV1 {
  return count > 0 ? 'PRESENT' : 'NONE';
}

const NAT008_NATURAL_AUTHORITIES = new Set(['WORKSHOP', 'CONFIRMED_DOCUMENT']);

export function isNat008NaturalWorkshopRow(row: F5GroundTruthRowForCorrelation): boolean {
  return (
    row.groundTruthType === BatteryGroundTruthType.WORKSHOP_MEASUREMENT &&
    NAT008_NATURAL_AUTHORITIES.has(row.sourceAuthority)
  );
}

export function isNat009NaturalReplacementRow(row: F5GroundTruthRowForCorrelation): boolean {
  return row.groundTruthType === BatteryGroundTruthType.BATTERY_REPLACEMENT;
}

export function filterAdmissibleGroundTruthAtAsOf(
  rows: F5GroundTruthRowForCorrelation[],
  asOf: Date,
  primaryVehicleKeys: Set<string>,
): {
  admissible: F5GroundTruthRowForCorrelation[];
  rejectedCrossScopeCount: number;
  replacementBoundariesByVehicle: Map<string, F5ReplacementBoundaryV1[]>;
} {
  const successorsByPriorId = buildGroundTruthSuccessorsByPriorId(rows);
  const admissible: F5GroundTruthRowForCorrelation[] = [];
  let rejectedCrossScopeCount = 0;

  for (const row of rows) {
    if (!primaryVehicleKeys.has(vehicleKey(row.organizationId, row.vehicleId))) {
      continue;
    }
    if (row.batteryScope !== F5_GROUND_TRUTH_CORRELATION_BATTERY_SCOPE) {
      rejectedCrossScopeCount += 1;
      continue;
    }
    if (!isGroundTruthActiveAtAsOf(row, asOf, successorsByPriorId)) {
      continue;
    }
    admissible.push(row);
  }

  const replacementBoundariesByVehicle = new Map<string, F5ReplacementBoundaryV1[]>();
  for (const row of admissible) {
    if (row.groundTruthType !== BatteryGroundTruthType.BATTERY_REPLACEMENT) continue;
    const vk = vehicleKey(row.organizationId, row.vehicleId);
    const list = replacementBoundariesByVehicle.get(vk) ?? [];
    list.push({ groundTruthEventId: row.id, effectiveAt: row.effectiveAt });
    replacementBoundariesByVehicle.set(vk, list);
  }
  for (const [vk, list] of replacementBoundariesByVehicle) {
    list.sort((a, b) => compareReplacementBoundaries(a, b));
    replacementBoundariesByVehicle.set(vk, list);
  }

  return { admissible, rejectedCrossScopeCount, replacementBoundariesByVehicle };
}

export type ComputeF5GroundTruthCorrelationInput = {
  asOf: Date;
  primaryRevisionIntervals: F5RevisionEvidenceInterval[];
  groundTruthRows: F5GroundTruthRowForCorrelation[];
  primaryVehicleKeys: Set<string>;
  segmentationSummary: F5SegmentationSummaryForCorrelation;
};

export function computeDeterministicSegmentEpochCount(boundaryCount: number): number {
  return boundaryCount + 1;
}

export function computeF5GroundTruthCorrelationBlockV2(
  input: ComputeF5GroundTruthCorrelationInput,
): F5GroundTruthCorrelationBlockV2 {
  const { asOf, primaryRevisionIntervals, groundTruthRows, primaryVehicleKeys, segmentationSummary } =
    input;

  const { admissible, rejectedCrossScopeCount, replacementBoundariesByVehicle } =
    filterAdmissibleGroundTruthAtAsOf(groundTruthRows, asOf, primaryVehicleKeys);

  const workshopRows = admissible.filter((r) => r.groundTruthType === BatteryGroundTruthType.WORKSHOP_MEASUREMENT);
  const replacementRows = admissible.filter((r) => isNat009NaturalReplacementRow(r));
  const nat008NaturalRows = admissible.filter((r) => isNat008NaturalWorkshopRow(r));

  const affectedVehicles = new Set(admissible.map((r) => vehicleKey(r.organizationId, r.vehicleId)));

  let maxEpochCount = 0;
  for (const list of replacementBoundariesByVehicle.values()) {
    maxEpochCount = Math.max(maxEpochCount, computeDeterministicSegmentEpochCount(list.length));
  }

  const temporal = {
    preEvent: 0,
    interventionWindow: 0,
    postEvent: 0,
    missingAnchorInterval: 0,
  };

  for (const rev of primaryRevisionIntervals) {
    const revKey = vehicleKey(rev.organizationId, rev.vehicleId);
    if (!primaryVehicleKeys.has(revKey)) continue;

    const boundaries = replacementBoundariesByVehicle.get(revKey) ?? [];
    if (boundaries.length === 0) {
      continue;
    }
    if (!rev.firstIncludedAnchorAt || !rev.lastIncludedAnchorAt) {
      temporal.missingAnchorInterval += boundaries.length;
      continue;
    }

    for (const boundary of boundaries) {
      const region = classifyEvidenceIntervalVsReplacementEffectiveAt(
        rev.firstIncludedAnchorAt,
        rev.lastIncludedAnchorAt,
        boundary.effectiveAt,
      );
      if (region === 'PRE_EVENT') temporal.preEvent += 1;
      else if (region === 'INTERVENTION_WINDOW') temporal.interventionWindow += 1;
      else if (region === 'POST_EVENT') temporal.postEvent += 1;
      else temporal.missingAnchorInterval += 1;
    }
  }

  const replacementCount = replacementRows.length;

  return {
    linkageAvailable: true,
    replacementLabelsAvailable: replacementCount > 0,
    nat008Owner: 'M3.3G',
    nat009Owner: 'M3.3G',
    longitudinalScopeAuthority: F5_LONGITUDINAL_SCOPE_AUTHORITY,
    correlation: {
      admissibleActiveGroundTruthCount: admissible.length,
      workshopMeasurementGroundTruthCount: workshopRows.length,
      batteryReplacementGroundTruthCount: replacementCount,
      affectedVehicleCount: affectedVehicles.size,
      segmentationAvailable: replacementCount > 0 && primaryRevisionIntervals.length > 0,
      activeReplacementBoundaryCount: replacementCount,
      deterministicSegmentEpochCount: maxEpochCount,
      segmentAssignedRevisionCount: segmentationSummary.segmentAssignedRevisionCount,
      interventionCrossingRevisionCount: segmentationSummary.interventionCrossingRevisionCount,
      unlabeledRevisionCount: segmentationSummary.unlabeledRevisionCount,
      missingAnchorRevisionCount: segmentationSummary.missingAnchorRevisionCount,
      totalDerivedSegmentCount: segmentationSummary.totalDerivedSegmentCount,
      maxSegmentCountPerVehicle: segmentationSummary.maxSegmentCountPerVehicle,
      continuityMetricsSegmentAware: true,
      prePostReplacementPoolingBlockedBySegmentAssignment:
        segmentationSummary.prePostReplacementPoolingBlockedBySegmentAssignment,
      temporalRegionRevisionBoundaryPairCounts: temporal,
      temporalRegionPairDenominator: 'primary_cohort_revision_x_admissible_replacement_boundary',
      rejectedCrossScopeCount,
      gtQueryScope: 'PRIMARY_COHORT_ORG_VEHICLE_PAIRS',
    },
    nat008: {
      infrastructureStatus: 'IMPLEMENTED',
      naturalEvidenceStatus: naturalEvidenceStatus(nat008NaturalRows.length),
      naturalEvidenceCount: nat008NaturalRows.length,
      validationSampleMaturity: 'NOT_EVALUATED',
    },
    nat009: {
      infrastructureStatus: 'IMPLEMENTED',
      naturalEvidenceStatus: naturalEvidenceStatus(replacementRows.length),
      naturalEvidenceCount: replacementRows.length,
      validationSampleMaturity: 'NOT_EVALUATED',
    },
    cal007: {
      nonCausal: true,
      causalityIntroduced: false,
    },
    temporalAuthority: {
      interventionTimeField: 'effectiveAt',
      evidenceIntervalFields: ['firstIncludedAnchorAt', 'lastIncludedAnchorAt'],
      groundTruthHistoricalAuthority: 'isGroundTruthActiveAtAsOf',
      groundTruthKnowledgeCutoff:
        'createdAt<=asOf AND effectiveAt<=asOf AND no revocation/supersession by asOf',
      numericInterventionEnvelope: 'NONE',
    },
  };
}

/** Zero GT rows — valid scientific outcome (G3-A). */
export function emptyF5GroundTruthCorrelationBlockV2(
  segmentationSummary: F5SegmentationSummaryForCorrelation,
): F5GroundTruthCorrelationBlockV2 {
  return computeF5GroundTruthCorrelationBlockV2({
    asOf: new Date(0),
    primaryRevisionIntervals: [],
    groundTruthRows: [],
    primaryVehicleKeys: new Set(),
    segmentationSummary,
  });
}
