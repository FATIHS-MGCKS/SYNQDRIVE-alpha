import { distanceM, easeInOutCubic, interpolateLngLat } from '../../lib/liveMapUtils';

/** How long to animate between two real GPS points (ms). Slightly less than poll interval. */
export const GPS_INTERP_DURATION_MS = 4500;
/** Dead reckoning: max seconds to predict beyond last GPS point */
export const DR_MAX_PREDICT_S = 6;
/** Minimum speed (km/h) to engage dead reckoning */
export const DR_MIN_SPEED_KMH = 3;
/** Snap when movement is below this distance (m) */
export const SNAP_DISTANCE_MIN_M = 0.5;
/** Teleport when movement exceeds this distance (m) */
export const SNAP_DISTANCE_MAX_M = 2000;

export interface MarkerAnimationFrame {
  position: [number, number];
  heading: number;
}

export interface MarkerAnimationPolicy {
  /** Reserved for a later reduced-motion prompt; snaps instead of interpolating. */
  reducedMotion?: boolean;
}

export interface MarkerAnimationInput extends MarkerAnimationPolicy {
  from: [number, number];
  to: [number, number];
  heading: number;
  speedKmh: number;
  onFrame: (frame: MarkerAnimationFrame) => void;
  requestFrame?: (cb: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
  now?: () => number;
}

export interface MarkerAnimationSession {
  cancel: () => void;
}

/**
 * Project a GPS position forward using speed + heading (dead reckoning).
 */
export function deadReckon(
  from: [number, number],
  headingDeg: number,
  speedKmh: number,
  dtSeconds: number,
): [number, number] {
  const distKm = (speedKmh / 3600) * dtSeconds;
  const distDeg = distKm / 111.32;
  const rad = (headingDeg * Math.PI) / 180;
  const dLng = (distDeg * Math.sin(rad)) / Math.cos((from[1] * Math.PI) / 180);
  const dLat = distDeg * Math.cos(rad);
  return [from[0] + dLng, from[1] + dLat];
}

export function shouldSnapMarkerMove(from: [number, number], to: [number, number]): boolean {
  const distM = distanceM(from, to);
  return distM < SNAP_DISTANCE_MIN_M || distM > SNAP_DISTANCE_MAX_M;
}

export function computeMarkerAnimationFrame(input: {
  from: [number, number];
  to: [number, number];
  heading: number;
  speedKmh: number;
  elapsedMs: number;
  reducedMotion?: boolean;
}): { position: [number, number]; phase: 'interp' | 'dead_reckon' | 'done' } {
  const { from, to, heading, speedKmh, elapsedMs, reducedMotion } = input;

  if (reducedMotion || elapsedMs >= GPS_INTERP_DURATION_MS + DR_MAX_PREDICT_S * 1000) {
    return { position: to, phase: 'done' };
  }

  if (elapsedMs < GPS_INTERP_DURATION_MS) {
    const t = easeInOutCubic(Math.min(elapsedMs / GPS_INTERP_DURATION_MS, 1));
    return {
      position: interpolateLngLat(from, to, t) as [number, number],
      phase: 'interp',
    };
  }

  const canDeadReckon = speedKmh >= DR_MIN_SPEED_KMH;
  if (!canDeadReckon) {
    return { position: to, phase: 'done' };
  }

  const drTime = (elapsedMs - GPS_INTERP_DURATION_MS) / 1000;
  if (drTime >= DR_MAX_PREDICT_S) {
    return { position: to, phase: 'done' };
  }

  const confidence = 1 - (drTime / DR_MAX_PREDICT_S) * 0.6;
  const predictedSpeed = speedKmh * confidence;
  return {
    position: deadReckon(to, heading, predictedSpeed, drTime),
    phase: 'dead_reckon',
  };
}

export function startMarkerAnimation(
  input: MarkerAnimationInput,
): MarkerAnimationSession {
  const requestFrame = input.requestFrame ?? ((cb) => requestAnimationFrame(cb));
  const cancelFrame = input.cancelFrame ?? ((id) => cancelAnimationFrame(id));
  const now = input.now ?? (() => Date.now());

  let rafId = 0;
  let cancelled = false;
  const animStart = now();

  const cancel = () => {
    cancelled = true;
    if (rafId) cancelFrame(rafId);
    rafId = 0;
  };

  const emit = (position: [number, number]) => {
    input.onFrame({ position, heading: input.heading });
  };

  if (input.reducedMotion || shouldSnapMarkerMove(input.from, input.to)) {
    emit(input.to);
    return { cancel };
  }

  const tick = () => {
    if (cancelled) return;

    const elapsed = now() - animStart;
    const frame = computeMarkerAnimationFrame({
      from: input.from,
      to: input.to,
      heading: input.heading,
      speedKmh: input.speedKmh,
      elapsedMs: elapsed,
      reducedMotion: input.reducedMotion,
    });

    emit(frame.position);

    if (frame.phase === 'done') {
      rafId = 0;
      return;
    }

    rafId = requestFrame(tick);
  };

  rafId = requestFrame(tick);
  return { cancel };
}

export function projectLngLatToScreen(
  project: (lngLat: [number, number]) => { x: number; y: number },
  lngLat: [number, number],
  offsetY = 20,
): string {
  const projected = project(lngLat);
  return `translate(${projected.x}px, ${projected.y - offsetY}px) translate(-50%, -100%)`;
}
