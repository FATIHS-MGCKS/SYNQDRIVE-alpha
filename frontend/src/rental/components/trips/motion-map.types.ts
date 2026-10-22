export type TripMotionMapReadStatus =
  | 'NOT_AVAILABLE'
  | 'PENDING'
  | 'FAILED'
  | 'SUCCEEDED'
  | 'SUCCEEDED_EMPTY';

export type TripMotionMapGeometrySource = 'NONE' | 'MOTION_POSITION_GRID' | 'MAPBOX_ROUTE_ALIGNED';

export type TripMotionMapSample = {
  bucketLabelUtc: string;
  speedKmh: number | null;
  motionState: string;
  evidenceQuality: string;
  latitude: number | null;
  longitude: number | null;
  positionAvailability: string | null;
};

export type TripMotionMapEvent = {
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

export type TripMotionMapStop = {
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

export type TripMotionMapPayload = {
  status: TripMotionMapReadStatus;
  previewLabel: 'S4 Motion · vorläufig';
  runId: string | null;
  workItemId: string | null;
  pinnedSnapshotHash: string | null;
  combinedInputIdentity: string | null;
  algorithmVersions: {
    c4: string;
    fsm: string;
    events: string;
    bundle: string;
  } | null;
  computedAtUtc: string | null;
  geometrySource: TripMotionMapGeometrySource;
  geometryNote: string | null;
  samples: TripMotionMapSample[];
  events: TripMotionMapEvent[];
  stopEpisodes: TripMotionMapStop[];
  limitations: string[];
  failureCode: string | null;
};

export type TripMotionMapPopoverState =
  | {
      kind: 'sample';
      sample: TripMotionMapSample;
      x: number;
      y: number;
    }
  | {
      kind: 'event';
      event: TripMotionMapEvent;
      x: number;
      y: number;
    }
  | {
      kind: 'stop';
      stop: TripMotionMapStop;
      x: number;
      y: number;
    };
