import type { F5RevisionEvidenceInterval } from './f5-ground-truth-correlation.types';

export type F5ReplacementBoundaryV1 = {
  groundTruthEventId: string;
  effectiveAt: Date;
};

export function deriveUnlabeledSegmentKey(
  organizationId: string,
  vehicleId: string,
  batteryScope: string,
): string {
  return `${organizationId}::${vehicleId}::${batteryScope}::unlabeled`;
}

export type F5RevisionSegmentAssignmentV1 =
  | {
      kind: 'assigned';
      epochIndex: number;
      segmentKey: string;
    }
  | {
      kind: 'unlabeled_no_replacement_boundaries';
      segmentKey: string;
    }
  | { kind: 'intervention_crossing' }
  | { kind: 'missing_anchor_bounds' };

export function computeDeterministicSegmentEpochCount(boundaryCount: number): number {
  return boundaryCount + 1;
}

export function compareReplacementBoundaries(a: F5ReplacementBoundaryV1, b: F5ReplacementBoundaryV1): number {
  const dt = a.effectiveAt.getTime() - b.effectiveAt.getTime();
  if (dt !== 0) return dt;
  return a.groundTruthEventId.localeCompare(b.groundTruthEventId);
}

export function deriveDeterministicSegmentKey(input: {
  organizationId: string;
  vehicleId: string;
  batteryScope: string;
  epochIndex: number;
  orderedBoundaryIds: string[];
}): string {
  const boundaryTail =
    input.epochIndex === 0
      ? `before:${input.orderedBoundaryIds[0] ?? 'none'}`
      : `after:${input.orderedBoundaryIds[input.epochIndex - 1] ?? 'none'}`;
  return `${input.organizationId}::${input.vehicleId}::${input.batteryScope}::epoch:${input.epochIndex}::${boundaryTail}`;
}

export function intervalCrossesEffectiveAt(
  firstIncludedAnchorAt: Date,
  lastIncludedAnchorAt: Date,
  effectiveAt: Date,
): boolean {
  const a = firstIncludedAnchorAt.getTime();
  const b = lastIncludedAnchorAt.getTime();
  const t = effectiveAt.getTime();
  return a <= t && t <= b;
}

export function assignRevisionToLongitudinalSegment(
  revision: F5RevisionEvidenceInterval,
  boundariesAsc: F5ReplacementBoundaryV1[],
  batteryScope: string,
): F5RevisionSegmentAssignmentV1 {
  const { firstIncludedAnchorAt, lastIncludedAnchorAt } = revision;
  if (!firstIncludedAnchorAt || !lastIncludedAnchorAt) {
    return { kind: 'missing_anchor_bounds' };
  }
  if (boundariesAsc.length === 0) {
    return {
      kind: 'unlabeled_no_replacement_boundaries',
      segmentKey: deriveUnlabeledSegmentKey(revision.organizationId, revision.vehicleId, batteryScope),
    };
  }

  for (const boundary of boundariesAsc) {
    if (intervalCrossesEffectiveAt(firstIncludedAnchorAt, lastIncludedAnchorAt, boundary.effectiveAt)) {
      return { kind: 'intervention_crossing' };
    }
  }

  const orderedBoundaryIds = boundariesAsc.map((b) => b.groundTruthEventId);
  const first = firstIncludedAnchorAt.getTime();
  const last = lastIncludedAnchorAt.getTime();

  if (last < boundariesAsc[0]!.effectiveAt.getTime()) {
    return {
      kind: 'assigned',
      epochIndex: 0,
      segmentKey: deriveDeterministicSegmentKey({
        organizationId: revision.organizationId,
        vehicleId: revision.vehicleId,
        batteryScope,
        epochIndex: 0,
        orderedBoundaryIds,
      }),
    };
  }

  const lastBoundary = boundariesAsc[boundariesAsc.length - 1]!;
  if (first >= lastBoundary.effectiveAt.getTime()) {
    const epochIndex = boundariesAsc.length;
    return {
      kind: 'assigned',
      epochIndex,
      segmentKey: deriveDeterministicSegmentKey({
        organizationId: revision.organizationId,
        vehicleId: revision.vehicleId,
        batteryScope,
        epochIndex,
        orderedBoundaryIds,
      }),
    };
  }

  for (let i = 1; i < boundariesAsc.length; i += 1) {
    const prev = boundariesAsc[i - 1]!;
    const next = boundariesAsc[i]!;
    if (first >= prev.effectiveAt.getTime() && last < next.effectiveAt.getTime()) {
      return {
        kind: 'assigned',
        epochIndex: i,
        segmentKey: deriveDeterministicSegmentKey({
          organizationId: revision.organizationId,
          vehicleId: revision.vehicleId,
          batteryScope,
          epochIndex: i,
          orderedBoundaryIds,
        }),
      };
    }
  }

  return { kind: 'intervention_crossing' };
}

export function computeSegmentAwareContinuityMetrics(
  assignments: F5RevisionSegmentAssignmentV1[],
): {
  revisionsPerSegment: Map<string, number>;
  maxRevisionsPerSegment: number;
  repeatabilityPairCount: number;
  segmentAssignedRevisionCount: number;
  interventionCrossingRevisionCount: number;
  unlabeledRevisionCount: number;
  missingAnchorRevisionCount: number;
  totalDerivedSegmentCount: number;
  maxSegmentCountPerVehicle: number;
} {
  const revisionsPerSegment = new Map<string, number>();
  const segmentsPerVehicle = new Map<string, Set<string>>();

  let segmentAssignedRevisionCount = 0;
  let interventionCrossingRevisionCount = 0;
  let unlabeledRevisionCount = 0;
  let missingAnchorRevisionCount = 0;

  for (const assignment of assignments) {
    if (assignment.kind === 'assigned') {
      segmentAssignedRevisionCount += 1;
      revisionsPerSegment.set(
        assignment.segmentKey,
        (revisionsPerSegment.get(assignment.segmentKey) ?? 0) + 1,
      );
      const vehiclePrefix = assignment.segmentKey.split('::epoch:')[0] ?? assignment.segmentKey;
      const set = segmentsPerVehicle.get(vehiclePrefix) ?? new Set<string>();
      set.add(assignment.segmentKey);
      segmentsPerVehicle.set(vehiclePrefix, set);
    } else if (assignment.kind === 'unlabeled_no_replacement_boundaries') {
      unlabeledRevisionCount += 1;
      revisionsPerSegment.set(
        assignment.segmentKey,
        (revisionsPerSegment.get(assignment.segmentKey) ?? 0) + 1,
      );
      const vehiclePrefix = assignment.segmentKey.split('::unlabeled')[0] ?? assignment.segmentKey;
      const set = segmentsPerVehicle.get(vehiclePrefix) ?? new Set<string>();
      set.add(assignment.segmentKey);
      segmentsPerVehicle.set(vehiclePrefix, set);
    } else if (assignment.kind === 'intervention_crossing') {
      interventionCrossingRevisionCount += 1;
    } else if (assignment.kind === 'missing_anchor_bounds') {
      missingAnchorRevisionCount += 1;
    }
  }

  const maxRevisionsPerSegment = Math.max(0, ...revisionsPerSegment.values());
  const repeatabilityPairCount = [...revisionsPerSegment.values()].filter((n) => n >= 2).length;
  const totalDerivedSegmentCount = revisionsPerSegment.size;
  const maxSegmentCountPerVehicle = Math.max(0, ...[...segmentsPerVehicle.values()].map((s) => s.size));

  return {
    revisionsPerSegment,
    maxRevisionsPerSegment,
    repeatabilityPairCount,
    segmentAssignedRevisionCount,
    interventionCrossingRevisionCount,
    unlabeledRevisionCount,
    missingAnchorRevisionCount,
    totalDerivedSegmentCount,
    maxSegmentCountPerVehicle,
  };
}
