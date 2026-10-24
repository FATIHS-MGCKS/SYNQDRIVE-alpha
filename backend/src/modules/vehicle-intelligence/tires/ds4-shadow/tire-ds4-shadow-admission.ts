import type { DiV0MotionCoreShadowTripMapEventDto } from '../../driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow-trip-map-read.types';

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

export function durationSecondsFromUtcLabels(startLabelUtc: string, endLabelUtc: string): number | null {
  const startMs = Date.parse(startLabelUtc);
  const endMs = Date.parse(endLabelUtc);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return (endMs - startMs) / 1000;
}

export function isManoeuvreEvent(event: DiV0MotionCoreShadowTripMapEventDto): boolean {
  return event.displayKind === 'ACCELERATION' || event.displayKind === 'DECELERATION';
}
