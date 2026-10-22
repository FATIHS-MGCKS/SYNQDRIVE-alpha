import type { MotionFsmStopEpisode } from '../core/kinematics/motion-fsm';
import type { DiV0MotionCoreShadowPayloadV1, DiV0MotionCoreShadowPersistedEventRow } from './di-v0-motion-core-shadow.types';
import type {
  DiV0MotionCoreShadowTripMapEventDto,
  DiV0MotionCoreShadowTripMapGeometrySource,
  DiV0MotionCoreShadowTripMapSampleDto,
  DiV0MotionCoreShadowTripMapStopDto,
} from './di-v0-motion-core-shadow-trip-map-read.types';

export type MotionMapPositionRow = {
  bucketLabelUtc: string;
  latitude: number | null;
  longitude: number | null;
  availability: string | null;
};

export type MotionMapRoutePointForAlign = {
  timestamp: string;
  latitude: number;
  longitude: number;
};

const ROUTE_ALIGN_TOLERANCE_MS = 2500;
const ROUTE_ALIGN_MIN_RATIO = 0.45;

export function buildMotionTripMapSamples(
  payload: DiV0MotionCoreShadowPayloadV1,
  positions: MotionMapPositionRow[],
  routePoints: MotionMapRoutePointForAlign[],
): {
  samples: DiV0MotionCoreShadowTripMapSampleDto[];
  geometrySource: DiV0MotionCoreShadowTripMapGeometrySource;
  geometryNote: string | null;
} {
  const posByLabel = new Map(positions.map((p) => [p.bucketLabelUtc, p]));
  const fsmByLabel = new Map(payload.fsmLabels.map((l) => [l.bucketLabelUtc, l]));

  const baseSamples: DiV0MotionCoreShadowTripMapSampleDto[] = payload.speeds.map((speed) => {
    const pos = posByLabel.get(speed.bucketLabelUtc);
    const fsm = fsmByLabel.get(speed.bucketLabelUtc);
    return {
      bucketLabelUtc: speed.bucketLabelUtc,
      speedKmh: speed.speedKmh,
      motionState: fsm?.state ?? 'UNKNOWN',
      evidenceQuality: fsm?.evidenceQuality ?? 'UNKNOWN',
      latitude: pos?.latitude ?? null,
      longitude: pos?.longitude ?? null,
      positionAvailability: pos?.availability ?? null,
    };
  });

  const grid = applyPositionGrid(baseSamples);
  return tryAlignSamplesToRoute(grid.samples, routePoints);
}

function applyPositionGrid(samples: DiV0MotionCoreShadowTripMapSampleDto[]): {
  samples: DiV0MotionCoreShadowTripMapSampleDto[];
  geometrySource: DiV0MotionCoreShadowTripMapGeometrySource;
  geometryNote: string | null;
} {
  const positioned = samples.filter((s) => s.latitude != null && s.longitude != null).length;
  if (positioned >= 2) {
    return {
      samples,
      geometrySource: 'MOTION_POSITION_GRID',
      geometryNote: null,
    };
  }
  return {
    samples,
    geometrySource: 'NONE',
    geometryNote: 'Keine ausreichende GPS-Geometrie im Motion-Raster.',
  };
}

function tryAlignSamplesToRoute(
  samples: DiV0MotionCoreShadowTripMapSampleDto[],
  routePoints: MotionMapRoutePointForAlign[],
): {
  samples: DiV0MotionCoreShadowTripMapSampleDto[];
  geometrySource: DiV0MotionCoreShadowTripMapGeometrySource;
  geometryNote: string | null;
} {
  const grid = applyPositionGrid(samples);
  if (grid.geometrySource === 'MOTION_POSITION_GRID' || routePoints.length < 2) {
    return grid;
  }

  const routeTimes = routePoints
    .map((p) => ({ ...p, t: Date.parse(p.timestamp) }))
    .filter((p) => Number.isFinite(p.t));
  if (routeTimes.length < 2) return grid;

  let matched = 0;
  const alignedSamples = samples.map((sample) => {
    const bucketT = Date.parse(sample.bucketLabelUtc);
    if (!Number.isFinite(bucketT)) return sample;
    let best: (typeof routeTimes)[number] | null = null;
    let bestDelta = Infinity;
    for (const rp of routeTimes) {
      const delta = Math.abs(rp.t - bucketT);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = rp;
      }
    }
    if (!best || bestDelta > ROUTE_ALIGN_TOLERANCE_MS) return sample;
    matched += 1;
    return {
      ...sample,
      latitude: best.latitude,
      longitude: best.longitude,
      positionAvailability: 'MAPBOX_ROUTE_ALIGNED',
    };
  });

  const ratio = samples.length > 0 ? matched / samples.length : 0;
  if (matched >= 2 && ratio >= ROUTE_ALIGN_MIN_RATIO) {
    return {
      samples: alignedSamples,
      geometrySource: 'MAPBOX_ROUTE_ALIGNED',
      geometryNote: 'Positionen zeitlich an die Mapbox-Route angeglichen.',
    };
  }
  return grid;
}

export function mapMotionTripMapEvents(
  payload: DiV0MotionCoreShadowPayloadV1,
  sampleByLabel: Map<string, DiV0MotionCoreShadowTripMapSampleDto>,
): DiV0MotionCoreShadowTripMapEventDto[] {
  return payload.events.map((event, index) => mapOneEvent(event, index, sampleByLabel));
}

function mapOneEvent(
  event: DiV0MotionCoreShadowPersistedEventRow,
  index: number,
  sampleByLabel: Map<string, DiV0MotionCoreShadowTripMapSampleDto>,
): DiV0MotionCoreShadowTripMapEventDto {
  const at = sampleByLabel.get(event.startLabel) ?? sampleByLabel.get(event.endLabel);
  const displayKind =
    event.kind === 'DECELERATION'
      ? 'DECELERATION'
      : event.startSpeedKmh < 5
        ? 'START'
        : 'ACCELERATION';
  return {
    id: `motion-ev-${index}-${event.startLabel}`,
    kind: event.kind,
    displayKind,
    startLabelUtc: event.startLabel,
    endLabelUtc: event.endLabel,
    startSpeedKmh: event.startSpeedKmh,
    endSpeedKmh: event.endSpeedKmh,
    deltaKmh: event.deltaKmh,
    peakAccel1sMps2: null,
    quality: event.quality,
    artefactSuspect: event.quality === 'ARTEFACT_SUSPECT',
    latitude: at?.latitude ?? null,
    longitude: at?.longitude ?? null,
    positionResolved: at?.latitude != null && at?.longitude != null,
  };
}

export function mapMotionTripMapStops(
  episodes: MotionFsmStopEpisode[],
  sampleByLabel: Map<string, DiV0MotionCoreShadowTripMapSampleDto>,
): DiV0MotionCoreShadowTripMapStopDto[] {
  return episodes.map((ep, index) => {
    const anchorLabel = ep.lastEvidenceLabel ?? ep.startLatest;
    const at = sampleByLabel.get(anchorLabel) ?? sampleByLabel.get(ep.startLatest);
    const observed = ep.observedLabels > 0;
    const inferred = ep.inferredLabels > 0 && ep.directLabels === 0;
    return {
      id: `motion-stop-${index}-${ep.startLatest}`,
      startEarliestUtc: ep.startEarliest,
      startLatestUtc: ep.startLatest,
      endEarliestUtc: ep.endEarliest,
      endLatestUtc: ep.endLatest,
      minDurationS: ep.minDurationS,
      maxDurationS: ep.maxDurationS,
      evidenceQuality: ep.evidenceQuality,
      observedLabels: ep.observedLabels,
      gapLabels: ep.gapLabels,
      firstStationarySource: ep.firstStationarySource,
      observed,
      inferred: inferred || ep.firstStationarySource === 'GAP_OR_POSITION_INFERENCE',
      latitude: at?.latitude ?? null,
      longitude: at?.longitude ?? null,
      positionResolved: at?.latitude != null && at?.longitude != null,
    };
  });
}
