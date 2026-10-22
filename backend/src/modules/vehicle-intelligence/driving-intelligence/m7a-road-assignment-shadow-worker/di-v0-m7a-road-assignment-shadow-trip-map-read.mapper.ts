import type {
  DiV0M7aRoadAssignmentShadowBucketDto,
  DiV0M7aRoadAssignmentShadowPayloadV1,
} from './di-v0-m7a-road-assignment-shadow.types';
import type {
  DiV0M7aRoadAssignmentShadowTripMapGeometrySource,
  DiV0M7aRoadAssignmentShadowTripMapOutcomeSummary,
  DiV0M7aRoadAssignmentShadowTripMapPointDto,
} from './di-v0-m7a-road-assignment-shadow-trip-map-read.types';

function isFiniteCoord(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function mapM7aTripMapPoints(
  buckets: DiV0M7aRoadAssignmentShadowBucketDto[],
): DiV0M7aRoadAssignmentShadowTripMapPointDto[] {
  return buckets.map((bucket) => {
    const positionResolved =
      isFiniteCoord(bucket.latitude) && isFiniteCoord(bucket.longitude);
    return {
      bucketLabelUtc: bucket.bucketLabelUtc,
      outcome: bucket.outcome,
      osmWayId: bucket.osmWayId,
      headingDeg: bucket.headingDeg,
      candidateWayIds: bucket.candidateWayIds,
      ambiguityReasons: bucket.ambiguityReasons,
      availability: bucket.availability,
      latitude: positionResolved ? bucket.latitude : null,
      longitude: positionResolved ? bucket.longitude : null,
      positionResolved,
    };
  });
}

export function stripM7aTripMapPointGeometry(
  points: DiV0M7aRoadAssignmentShadowTripMapPointDto[],
): DiV0M7aRoadAssignmentShadowTripMapPointDto[] {
  return points.map((point) => ({
    ...point,
    latitude: null,
    longitude: null,
    positionResolved: false,
  }));
}

export function resolveM7aTripMapGeometry(
  points: DiV0M7aRoadAssignmentShadowTripMapPointDto[],
): {
  geometrySource: DiV0M7aRoadAssignmentShadowTripMapGeometrySource;
  geometryNote: string | null;
  resolvedPointCount: number;
} {
  const resolvedPointCount = points.filter((p) => p.positionResolved).length;
  if (resolvedPointCount === 0) {
    return {
      geometrySource: 'NONE',
      geometryNote: 'Keine verankerten Positionspunkte im gespeicherten Lauf.',
      resolvedPointCount,
    };
  }
  return {
    geometrySource: 'POSITION_ANCHOR',
    geometryNote: null,
    resolvedPointCount,
  };
}

export function buildM7aTripMapOutcomeSummary(
  payload: DiV0M7aRoadAssignmentShadowPayloadV1,
): DiV0M7aRoadAssignmentShadowTripMapOutcomeSummary {
  return {
    bucketCount: payload.summary.bucketCount,
    confirmedCount: payload.summary.confirmedCount,
    ambiguousCount: payload.summary.ambiguousCount,
    unknownCount: payload.summary.unknownCount,
  };
}
