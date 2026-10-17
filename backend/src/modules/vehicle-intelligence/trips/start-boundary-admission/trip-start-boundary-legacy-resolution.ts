import type {
  DimoTripSegment,
  RoutePoint,
  TripCoreDataPoint,
} from '../../../dimo/dimo-segments.service';
import { refineTripStartBoundary } from '../trip-evidence.helpers';
import { selectConfirmedStartSegment } from '../start-boundary-window.util';

export type ConfirmedStartBoundaryLegacyResult = {
  startAt: Date;
  source:
    | 'DIMO_SEGMENT'
    | 'ROUTE_ACTIVITY'
    | 'CORE_ACTIVITY'
    | 'SNAPSHOT_CANDIDATE';
  startLatitude: number | null;
  startLongitude: number | null;
  adjustedMs: number;
  dimoSegmentId: string | null;
};

export type StartBoundaryEvidenceContext = {
  boundaryWindowFrom: Date;
  segments: DimoTripSegment[];
  matchingSegment: DimoTripSegment | null;
  routePoints: RoutePoint[];
  /** True when route enrichment was loaded for legacy resolution (no segment match). */
  legacyRouteFetchPerformed: boolean;
};

export function resolveLegacyConfirmedStartBoundary(params: {
  boundaryWindowFrom: Date;
  candidateStartAt: Date;
  confirmedAt: Date;
  corePoints: TripCoreDataPoint[];
  profile: string;
  segments: DimoTripSegment[];
  routePoints: RoutePoint[];
  legacyRouteFetchPerformed: boolean;
}): {
  legacy: ConfirmedStartBoundaryLegacyResult;
  evidence: StartBoundaryEvidenceContext;
} {
  const matchingSegment = selectConfirmedStartSegment(
    params.segments,
    params.candidateStartAt,
    params.confirmedAt,
  );

  const evidence: StartBoundaryEvidenceContext = {
    boundaryWindowFrom: params.boundaryWindowFrom,
    segments: params.segments,
    matchingSegment,
    routePoints: params.routePoints,
    legacyRouteFetchPerformed: params.legacyRouteFetchPerformed,
  };

  if (matchingSegment) {
    const startAt = new Date(matchingSegment.startTime);
    return {
      legacy: {
        startAt,
        source: 'DIMO_SEGMENT',
        startLatitude: matchingSegment.startLatitude,
        startLongitude: matchingSegment.startLongitude,
        adjustedMs: startAt.getTime() - params.candidateStartAt.getTime(),
        dimoSegmentId: matchingSegment.segmentId,
      },
      evidence,
    };
  }

  const refined = refineTripStartBoundary(
    params.candidateStartAt,
    params.corePoints,
    params.routePoints,
    params.profile,
  );

  return {
    legacy: {
      ...refined,
      dimoSegmentId: null,
    },
    evidence,
  };
}
