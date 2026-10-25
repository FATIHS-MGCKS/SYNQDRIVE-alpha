import type { DiV0MotionCoreShadowTripMapEventDto } from '../../driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow-trip-map-read.types';
import { classifyDs4EventQuality, isManoeuvreEvent } from './tire-ds4-shadow-admission';

const MAX_PLAUSIBLE_SPEED_KMH = 400;

export function isPlausibleSpeedKmh(speedKmh: number): boolean {
  return Number.isFinite(speedKmh) && speedKmh >= 0 && speedKmh <= MAX_PLAUSIBLE_SPEED_KMH;
}

/** ΔKE per kg for one manoeuvre segment (J/kg), using speeds in km/h. */
export function kineticDeltaJPerKg(startSpeedKmh: number, endSpeedKmh: number): number | null {
  if (!isPlausibleSpeedKmh(startSpeedKmh) || !isPlausibleSpeedKmh(endSpeedKmh)) {
    return null;
  }
  const v0 = startSpeedKmh / 3.6;
  const v1 = endSpeedKmh / 3.6;
  return 0.5 * Math.abs(v1 * v1 - v0 * v0);
}

/**
 * M3 contribution for one OK event: 0.5|v_end²−v_start²| / tripDistanceKm (J/kg/km).
 * Returns null when distance invalid or speeds excluded.
 */
export function m3ContributionJPerKgPerKm(
  event: DiV0MotionCoreShadowTripMapEventDto,
  tripDistanceKm: number,
): number | null {
  if (!Number.isFinite(tripDistanceKm) || tripDistanceKm <= 0) return null;
  if (!isManoeuvreEvent(event)) return null;
  if (classifyDs4EventQuality(event.quality, event.artefactSuspect) !== 'OK') return null;
  const deltaKe = kineticDeltaJPerKg(event.startSpeedKmh, event.endSpeedKmh);
  if (deltaKe == null) return null;
  return deltaKe / tripDistanceKm;
}

export function sumM3OkEventsJPerKgPerKm(
  events: DiV0MotionCoreShadowTripMapEventDto[],
  displayKind: 'ACCELERATION' | 'DECELERATION',
  tripDistanceKm: number,
): { okM3JPerKgPerKmSum: number; okM3EventCount: number } {
  let sum = 0;
  let count = 0;
  for (const event of events) {
    if (event.displayKind !== displayKind) continue;
    const m3 = m3ContributionJPerKgPerKm(event, tripDistanceKm);
    if (m3 == null) continue;
    sum += m3;
    count += 1;
  }
  return { okM3JPerKgPerKmSum: sum, okM3EventCount: count };
}
