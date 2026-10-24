import type { DiV0MotionCoreShadowTripMapEventDto } from '../../driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow-trip-map-read.types';

/** Bundles at or after Fable P2 plausibility gate may use ordinal intensity buckets (counts only). */
export const TIRE_DS4_SHADOW_MIN_BUNDLE_INTENSITY_MARKER = 'EVENT_V0_3_PLAUS_V0_2';

export type TireDs4ShadowQualityClass =
  | 'OK'
  | 'DEGRADED'
  | 'LIMITED'
  | 'ARTEFACT_SUSPECT'
  | 'OTHER';

export function classifyDs4EventQuality(quality: string, artefactSuspect: boolean): TireDs4ShadowQualityClass {
  if (artefactSuspect) return 'ARTEFACT_SUSPECT';
  const q = quality.trim().toUpperCase();
  if (q === 'OK') return 'OK';
  if (q === 'DEGRADED') return 'DEGRADED';
  if (q === 'LIMITED') return 'LIMITED';
  if (q === 'ARTEFACT_SUSPECT') return 'ARTEFACT_SUSPECT';
  return 'OTHER';
}

export function isIntensityBundleAdmissible(shadowBundleVersion: string): boolean {
  return shadowBundleVersion.includes(TIRE_DS4_SHADOW_MIN_BUNDLE_INTENSITY_MARKER);
}

export function durationSecondsFromUtcLabels(startLabelUtc: string, endLabelUtc: string): number | null {
  const startMs = Date.parse(startLabelUtc);
  const endMs = Date.parse(endLabelUtc);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return (endMs - startMs) / 1000;
}

export function ordinalDeltaKmhBucket(deltaKmh: number): 'low' | 'medium' | 'high' {
  const abs = Math.abs(deltaKmh);
  if (abs < 8) return 'low';
  if (abs <= 15) return 'medium';
  return 'high';
}

export function isManoeuvreEvent(event: DiV0MotionCoreShadowTripMapEventDto): boolean {
  return event.displayKind === 'ACCELERATION' || event.displayKind === 'DECELERATION';
}

export function countAdmissibleForQuality(classification: TireDs4ShadowQualityClass): boolean {
  return classification === 'OK' || classification === 'DEGRADED';
}

export function countDurationForQuality(classification: TireDs4ShadowQualityClass): boolean {
  return classification === 'OK' || classification === 'DEGRADED';
}

export function ordinalIntensityForQuality(classification: TireDs4ShadowQualityClass): boolean {
  return classification === 'OK';
}
