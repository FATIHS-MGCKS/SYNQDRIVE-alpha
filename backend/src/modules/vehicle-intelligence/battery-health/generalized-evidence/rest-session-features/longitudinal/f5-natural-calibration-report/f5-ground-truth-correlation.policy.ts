import { BatteryGroundTruthType } from '@prisma/client';
import { isActiveGroundTruthEvent } from '../../../../ground-truth/ground-truth-active-authority.util';
import {
  F5_GROUND_TRUTH_CORRELATION_BATTERY_SCOPE,
  F5_LONGITUDINAL_SCOPE_AUTHORITY,
} from './f5-ground-truth-correlation.constants';
import type {
  F5GroundTruthCorrelationBlockV2,
  F5GroundTruthRowForCorrelation,
  F5GroundTruthTemporalRegionV1,
  F5RevisionEvidenceInterval,
} from './f5-ground-truth-correlation.types';
import type { F5MaturityStateV1 } from './f5-natural-calibration-report.types';

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

export function computeDeterministicSegmentEpochCount(replacementEffectiveAtsAsc: Date[]): number {
  return replacementEffectiveAtsAsc.length + 1;
}

function compareReplacementGt(a: F5GroundTruthRowForCorrelation, b: F5GroundTruthRowForCorrelation): number {
  const dt = a.effectiveAt.getTime() - b.effectiveAt.getTime();
  if (dt !== 0) return dt;
  return a.id.localeCompare(b.id);
}

function naturalEvidenceMaturityFromCount(count: number): F5MaturityStateV1 {
  if (count <= 0) return 'COLLECTING';
  if (count === 1) return 'DISTRIBUTION_VISIBLE';
  return 'REPEATABILITY_VISIBLE';
}

export type ComputeF5GroundTruthCorrelationInput = {
  asOf: Date;
  primaryRevisionIntervals: F5RevisionEvidenceInterval[];
  groundTruthRows: F5GroundTruthRowForCorrelation[];
  /** Vehicles in primary cohort scope (org+vehicle allow-list for bounded correlation). */
  primaryVehicleKeys: Set<string>;
};

function vehicleKey(organizationId: string, vehicleId: string): string {
  return `${organizationId}::${vehicleId}`;
}

export function isAdmissibleGroundTruthAtAsOf(
  row: F5GroundTruthRowForCorrelation,
  asOf: Date,
): boolean {
  if (!isActiveGroundTruthEvent(row)) {
    return false;
  }
  if (row.createdAt.getTime() > asOf.getTime()) {
    return false;
  }
  if (row.effectiveAt.getTime() > asOf.getTime()) {
    return false;
  }
  for (const rev of row.revocations) {
    if (rev.revokedAt.getTime() <= asOf.getTime()) {
      return false;
    }
  }
  return true;
}

export function computeF5GroundTruthCorrelationBlockV2(
  input: ComputeF5GroundTruthCorrelationInput,
): F5GroundTruthCorrelationBlockV2 {
  const { asOf, primaryRevisionIntervals, groundTruthRows, primaryVehicleKeys } = input;

  let rejectedCrossTenantCount = 0;
  let rejectedCrossVehicleCount = 0;
  let rejectedCrossScopeCount = 0;
  let rejectedNotActiveAtReadCount = 0;
  let rejectedKnowledgeAfterAsOfCount = 0;

  const admissible: F5GroundTruthRowForCorrelation[] = [];

  for (const row of groundTruthRows) {
    if (!isActiveGroundTruthEvent(row)) {
      rejectedNotActiveAtReadCount += 1;
      continue;
    }
    if (row.createdAt.getTime() > asOf.getTime() || row.effectiveAt.getTime() > asOf.getTime()) {
      rejectedKnowledgeAfterAsOfCount += 1;
      continue;
    }
    let revokedAtAsOf = false;
    for (const rev of row.revocations) {
      if (rev.revokedAt.getTime() <= asOf.getTime()) {
        revokedAtAsOf = true;
        break;
      }
    }
    if (revokedAtAsOf) {
      rejectedNotActiveAtReadCount += 1;
      continue;
    }
    if (row.batteryScope !== F5_GROUND_TRUTH_CORRELATION_BATTERY_SCOPE) {
      rejectedCrossScopeCount += 1;
      continue;
    }
    const key = vehicleKey(row.organizationId, row.vehicleId);
    if (primaryVehicleKeys.size > 0 && !primaryVehicleKeys.has(key)) {
      rejectedCrossVehicleCount += 1;
      continue;
    }
    admissible.push(row);
  }

  const workshopRows = admissible.filter(
    (r) => r.groundTruthType === BatteryGroundTruthType.WORKSHOP_MEASUREMENT,
  );
  const replacementRows = admissible.filter(
    (r) => r.groundTruthType === BatteryGroundTruthType.BATTERY_REPLACEMENT,
  );

  const affectedVehicles = new Set(admissible.map((r) => vehicleKey(r.organizationId, r.vehicleId)));

  const replacementsByVehicle = new Map<string, F5GroundTruthRowForCorrelation[]>();
  for (const r of replacementRows) {
    const k = vehicleKey(r.organizationId, r.vehicleId);
    const list = replacementsByVehicle.get(k) ?? [];
    list.push(r);
    replacementsByVehicle.set(k, list);
  }
  for (const [k, list] of replacementsByVehicle) {
    list.sort(compareReplacementGt);
    replacementsByVehicle.set(k, list);
  }

  let maxEpochCount = 0;
  for (const list of replacementsByVehicle.values()) {
    maxEpochCount = Math.max(
      maxEpochCount,
      computeDeterministicSegmentEpochCount(list.map((r) => r.effectiveAt)),
    );
  }

  const temporal = {
    preEvent: 0,
    interventionWindow: 0,
    postEvent: 0,
    unknown: 0,
  };

  for (const rev of primaryRevisionIntervals) {
    const revKey = vehicleKey(rev.organizationId, rev.vehicleId);
    if (!primaryVehicleKeys.has(revKey)) continue;

    const replacements = replacementsByVehicle.get(revKey) ?? [];
    if (replacements.length === 0) {
      temporal.unknown += 1;
      continue;
    }

    for (const gt of replacements) {
      if (gt.organizationId !== rev.organizationId) {
        rejectedCrossTenantCount += 1;
        continue;
      }
      const region = classifyEvidenceIntervalVsReplacementEffectiveAt(
        rev.firstIncludedAnchorAt,
        rev.lastIncludedAnchorAt,
        gt.effectiveAt,
      );
      if (region === 'PRE_EVENT') temporal.preEvent += 1;
      else if (region === 'INTERVENTION_WINDOW') temporal.interventionWindow += 1;
      else if (region === 'POST_EVENT') temporal.postEvent += 1;
      else temporal.unknown += 1;
    }
  }

  const workshopCount = workshopRows.length;
  const replacementCount = replacementRows.length;

  return {
    linkageAvailable: true,
    replacementLabelsAvailable: replacementCount > 0,
    nat008Owner: 'M3.3G',
    nat009Owner: 'M3.3G',
    longitudinalScopeAuthority: F5_LONGITUDINAL_SCOPE_AUTHORITY,
    correlation: {
      admissibleActiveGroundTruthCount: admissible.length,
      workshopMeasurementGroundTruthCount: workshopCount,
      batteryReplacementGroundTruthCount: replacementCount,
      affectedVehicleCount: affectedVehicles.size,
      segmentationAvailable: replacementCount > 0 && primaryRevisionIntervals.length > 0,
      activeReplacementBoundaryCount: replacementCount,
      deterministicSegmentEpochCount: maxEpochCount,
      prePostReplacementPoolingBlocked: true,
      temporalRegionCorrelationCounts: temporal,
      rejectedCrossTenantCount,
      rejectedCrossVehicleCount,
      rejectedCrossScopeCount,
      rejectedNotActiveAtReadCount,
      rejectedKnowledgeAfterAsOfCount,
    },
    nat008: {
      infrastructureStatus: 'IMPLEMENTED',
      naturalEvidenceStatus: naturalEvidenceMaturityFromCount(workshopCount),
    },
    nat009: {
      infrastructureStatus: 'IMPLEMENTED',
      naturalEvidenceStatus: naturalEvidenceMaturityFromCount(replacementCount),
    },
    cal007: {
      nonCausal: true,
      causalityIntroduced: false,
    },
    temporalAuthority: {
      interventionTimeField: 'effectiveAt',
      evidenceIntervalFields: ['firstIncludedAnchorAt', 'lastIncludedAnchorAt'],
      groundTruthKnowledgeCutoff: 'createdAt<=asOf AND effectiveAt<=asOf',
      numericInterventionEnvelope: 'NONE',
    },
  };
}

/** Zero GT rows — valid scientific outcome (G3-A). */
export function emptyF5GroundTruthCorrelationBlockV2(): F5GroundTruthCorrelationBlockV2 {
  return computeF5GroundTruthCorrelationBlockV2({
    asOf: new Date(0),
    primaryRevisionIntervals: [],
    groundTruthRows: [],
    primaryVehicleKeys: new Set(),
  });
}
