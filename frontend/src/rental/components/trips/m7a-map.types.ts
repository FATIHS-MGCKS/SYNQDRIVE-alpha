export type TripM7aMapReadStatus =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'FAILED'
  | 'ROAD_CONTEXT_UNAVAILABLE'
  | 'SUCCEEDED';

export type TripM7aMapOutcome = 'CONFIRMED' | 'AMBIGUOUS' | 'UNKNOWN';

export type TripM7aMapGeometrySource = 'NONE' | 'POSITION_ANCHOR';

export type TripM7aMapPoint = {
  bucketLabelUtc: string;
  outcome: TripM7aMapOutcome;
  osmWayId: number | null;
  headingDeg: number | null;
  candidateWayIds: number[];
  ambiguityReasons: string[];
  availability: string;
  latitude: number | null;
  longitude: number | null;
  positionResolved: boolean;
};

export type TripM7aMapPayload = {
  status: TripM7aMapReadStatus;
  previewLabel: 'M7A Straßenzuordnung · vorläufig';
  runId: string | null;
  workItemId: string | null;
  discoveryIntentKey: string | null;
  runIntentKey: string | null;
  summary: Record<string, unknown> | null;
  pinnedSnapshotHash: string | null;
  combinedInputIdentity: string | null;
  osmSnapshotSha256: string | null;
  computedAtUtc: string | null;
  geometrySource: TripM7aMapGeometrySource;
  geometryNote: string | null;
  mapPoints: TripM7aMapPoint[];
  outcomeSummary: {
    bucketCount: number;
    confirmedCount: number;
    ambiguousCount: number;
    unknownCount: number;
  } | null;
  limitations: string[];
  failureCode: string | null;
};

export type TripM7aMapPopoverState = {
  kind: 'm7aPoint';
  point: TripM7aMapPoint;
  x: number;
  y: number;
};
