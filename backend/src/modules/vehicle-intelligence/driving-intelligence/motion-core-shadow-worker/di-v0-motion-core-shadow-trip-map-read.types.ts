export type DiV0MotionCoreShadowTripMapReadStatus =
  | 'NOT_AVAILABLE'
  | 'PENDING'
  | 'FAILED'
  | 'SUCCEEDED'
  | 'SUCCEEDED_EMPTY';

export type DiV0MotionCoreShadowTripMapGeometrySource =
  | 'NONE'
  | 'MOTION_POSITION_GRID'
  | 'MAPBOX_ROUTE_ALIGNED';

export type DiV0MotionCoreShadowTripMapSampleDto = {
  bucketLabelUtc: string;
  speedKmh: number | null;
  motionState: string;
  evidenceQuality: string;
  latitude: number | null;
  longitude: number | null;
  positionAvailability: string | null;
  /** Master-admin repair comparison when C5.1 preferred speed is active. */
  c4SpeedKmh?: number | null;
  repairState?: string | null;
  repairRejectionReason?: string | null;
};

export type DiV0MotionCoreShadowTripMapEventDto = {
  id: string;
  kind: string;
  displayKind: 'START' | 'ACCELERATION' | 'DECELERATION';
  startLabelUtc: string;
  endLabelUtc: string;
  startSpeedKmh: number;
  endSpeedKmh: number;
  deltaKmh: number;
  peakAccel1sMps2: number | null;
  quality: string;
  artefactSuspect: boolean;
  latitude: number | null;
  longitude: number | null;
  positionResolved: boolean;
};

export type DiV0MotionCoreShadowTripMapStopDto = {
  id: string;
  startEarliestUtc: string;
  startLatestUtc: string;
  endEarliestUtc: string | null;
  endLatestUtc: string | null;
  minDurationS: number;
  maxDurationS: number | null;
  evidenceQuality: string;
  observedLabels: number;
  gapLabels: number;
  firstStationarySource: string;
  observed: boolean;
  inferred: boolean;
  latitude: number | null;
  longitude: number | null;
  positionResolved: boolean;
};

export type DiV0MotionCoreShadowTripMapReadResponse = {
  status: DiV0MotionCoreShadowTripMapReadStatus;
  previewLabel: 'S4 Motion · vorläufig';
  runId: string | null;
  workItemId: string | null;
  pinnedSnapshotHash: string | null;
  combinedInputIdentity: string | null;
  algorithmVersions: {
    c4: string;
    c5_1: string | null;
    fsm: string;
    events: string;
    bundle: string;
  } | null;
  speedAuthority: 'C4_ONLY' | 'C5_1_PREFERRED' | null;
  computedAtUtc: string | null;
  geometrySource: DiV0MotionCoreShadowTripMapGeometrySource;
  geometryNote: string | null;
  samples: DiV0MotionCoreShadowTripMapSampleDto[];
  events: DiV0MotionCoreShadowTripMapEventDto[];
  stopEpisodes: DiV0MotionCoreShadowTripMapStopDto[];
  limitations: string[];
  failureCode: string | null;
  snapshotBindingVerified: boolean;
  newerFailedRunId: string | null;
  newerFailedRunStatus: string | null;
};
