import type { TripMapRoutePoint } from './trips-map.types';
import type {
  TripMotionMapEvent,
  TripMotionMapPayload,
  TripMotionMapSample,
} from './motion-map.types';

const ROUTE_ALIGN_TOLERANCE_MS = 2500;
const ROUTE_ALIGN_MIN_RATIO = 0.45;
const GAP_BREAK_SECONDS = 3;

export function resolveMotionSamplesForMap(
  payload: TripMotionMapPayload,
  routePoints: TripMapRoutePoint[],
): {
  samples: TripMotionMapSample[];
  geometrySource: TripMotionMapPayload['geometrySource'];
  geometryNote: string | null;
} {
  if (payload.geometrySource === 'MOTION_POSITION_GRID') {
    return {
      samples: payload.samples,
      geometrySource: payload.geometrySource,
      geometryNote: payload.geometryNote,
    };
  }
  if (routePoints.length < 2) {
    return {
      samples: payload.samples,
      geometrySource: payload.geometrySource,
      geometryNote: payload.geometryNote,
    };
  }
  const routeTimes = routePoints
    .map((p) => ({ ...p, t: Date.parse(p.timestamp) }))
    .filter((p) => Number.isFinite(p.t));
  if (routeTimes.length < 2) {
    return { samples: payload.samples, geometrySource: payload.geometrySource, geometryNote: payload.geometryNote };
  }

  let matched = 0;
  const aligned = payload.samples.map((sample) => {
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
  const ratio = payload.samples.length > 0 ? matched / payload.samples.length : 0;
  if (matched >= 2 && ratio >= ROUTE_ALIGN_MIN_RATIO) {
    return {
      samples: aligned,
      geometrySource: 'MAPBOX_ROUTE_ALIGNED',
      geometryNote: 'Positionen zeitlich an die Mapbox-Route angeglichen.',
    };
  }
  return {
    samples: payload.samples,
    geometrySource: payload.geometrySource,
    geometryNote: payload.geometryNote,
  };
}

export function buildMotionSpeedLineFeatures(
  samples: TripMotionMapSample[],
): GeoJSON.Feature<GeoJSON.LineString>[] {
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  let segment: TripMotionMapSample[] = [];

  const flush = () => {
    for (let i = 0; i < segment.length - 1; i++) {
      const a = segment[i];
      const b = segment[i + 1];
      if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) continue;
      if (a.speedKmh == null || b.speedKmh == null) continue;
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [[a.longitude, a.latitude], [b.longitude, b.latitude]],
        },
        properties: {
          speed: a.speedKmh,
          bucketLabelUtc: a.bucketLabelUtc,
          motionState: a.motionState,
        },
      });
    }
    segment = [];
  };

  for (const sample of samples) {
    const prev = segment[segment.length - 1];
    if (prev) {
      const gapS =
        (Date.parse(sample.bucketLabelUtc) - Date.parse(prev.bucketLabelUtc)) / 1000;
      const positionBreak =
        sample.latitude == null ||
        sample.longitude == null ||
        prev.latitude == null ||
        prev.longitude == null;
      if (positionBreak || gapS > GAP_BREAK_SECONDS) {
        flush();
      }
    }
    if (sample.latitude != null && sample.longitude != null) {
      segment.push(sample);
    } else if (segment.length > 0) {
      flush();
    }
  }
  flush();
  return features;
}

export function findNearestMotionSample(
  samples: TripMotionMapSample[],
  targetLabelUtc: string,
): TripMotionMapSample | null {
  const targetT = Date.parse(targetLabelUtc);
  if (!Number.isFinite(targetT)) return null;
  let best: TripMotionMapSample | null = null;
  let bestDelta = Infinity;
  for (const s of samples) {
    const t = Date.parse(s.bucketLabelUtc);
    if (!Number.isFinite(t)) continue;
    const delta = Math.abs(t - targetT);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = s;
    }
  }
  return best;
}

export function motionEventLabel(event: TripMotionMapEvent): string {
  if (event.displayKind === 'START') return 'Anfahren';
  if (event.displayKind === 'DECELERATION') return 'Bremsen';
  return 'Beschleunigen';
}

export function formatMotionBucketTime(labelUtc: string): string {
  const d = new Date(labelUtc);
  if (Number.isNaN(d.getTime())) return labelUtc;
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function isMotionMapActive(payload: TripMotionMapPayload | null): boolean {
  return payload?.status === 'SUCCEEDED' || payload?.status === 'SUCCEEDED_EMPTY';
}

export function createMotionEventMarkerElement(
  event: TripMotionMapEvent,
  isDark: boolean,
  onClick: () => void,
  isSelected = false,
): HTMLButtonElement {
  const isStart = event.displayKind === 'START';
  const isAccel = event.displayKind === 'ACCELERATION';
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `trips-map-event-marker trips-map-event-marker--motion${
    event.artefactSuspect ? ' trips-map-event-marker--artefact' : ''
  }${isAccel || isStart ? ' trips-map-event-marker--accel' : ' trips-map-event-marker--brake'}${
    isSelected ? ' trips-map-event-marker--selected' : ''
  }`;
  el.style.width = event.artefactSuspect ? '18px' : '16px';
  el.style.height = event.artefactSuspect ? '18px' : '16px';
  el.setAttribute('aria-label', motionEventLabel(event));
  el.innerHTML = isStart ? '▶' : isAccel ? '▲' : '▼';
  if (isDark) el.classList.add('trips-map-event-marker--dark');
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return el;
}
