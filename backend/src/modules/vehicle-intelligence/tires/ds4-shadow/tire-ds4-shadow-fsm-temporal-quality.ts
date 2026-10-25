import type {
  DiV0MotionCoreShadowTripMapReadResponse,
  DiV0MotionCoreShadowTripMapSampleDto,
  DiV0MotionCoreShadowTripMapStopDto,
} from '../../driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow-trip-map-read.types';
import { isPlausibleSpeedKmh } from './tire-ds4-shadow-m3-dynamics';

/** DS4 Motion FSM evidence classes (not manoeuvre event OK/DEGRADED/LIMITED). */
export type MotionFsmEvidenceQualityToken = 'DIRECT' | 'INFERRED' | 'INDETERMINATE';

const FSM_QUALITY_TOKENS = new Set<string>(['DIRECT', 'INFERRED', 'INDETERMINATE']);

export function isMotionFsmEvidenceQualityToken(quality: string): boolean {
  return FSM_QUALITY_TOKENS.has(quality.trim().toUpperCase());
}

export function normalizeMotionFsmEvidenceQuality(
  quality: string,
): MotionFsmEvidenceQualityToken | null {
  const q = quality.trim().toUpperCase();
  if (q === 'DIRECT') return 'DIRECT';
  if (q === 'INFERRED') return 'INFERRED';
  if (q === 'INDETERMINATE') return 'INDETERMINATE';
  return null;
}

/** Legacy unit-fixture tokens on samples (event QC vocabulary) — not used for M3 event admission. */
export type LegacySampleQualityClass = 'OK' | 'DEGRADED' | 'LIMITED' | 'ARTEFACT' | 'OTHER';

export function classifyLegacySampleQuality(quality: string): LegacySampleQualityClass {
  const q = quality.trim().toUpperCase();
  if (q === 'OK') return 'OK';
  if (q === 'DEGRADED') return 'DEGRADED';
  if (q === 'LIMITED') return 'LIMITED';
  if (q === 'ARTEFACT_SUSPECT' || q === 'ARTEFACT') return 'ARTEFACT';
  return 'OTHER';
}

const MOVING_FSM_STATES = new Set(['MOVING', 'STARTING']);

const STATIONARY_FSM_STATES = new Set(['STATIONARY', 'STOP_CANDIDATE']);

export function isMovingMotionFsmState(motionState: string): boolean {
  return MOVING_FSM_STATES.has(motionState.trim().toUpperCase());
}

export function isStationaryMotionFsmState(motionState: string): boolean {
  return STATIONARY_FSM_STATES.has(motionState.trim().toUpperCase());
}

export function hasAuthoritativeSpeedSample(
  sample: DiV0MotionCoreShadowTripMapSampleDto,
  speedAuthority: DiV0MotionCoreShadowTripMapReadResponse['speedAuthority'],
): boolean {
  if (speedAuthority == null) return false;
  if (sample.speedKmh == null || !isPlausibleSpeedKmh(sample.speedKmh)) return false;
  return true;
}

/** DIRECT FSM label counts as accountable movement only with motion state + speed authority. */
export function isAccountableFsmDrivingSecond(
  sample: DiV0MotionCoreShadowTripMapSampleDto,
  speedAuthority: DiV0MotionCoreShadowTripMapReadResponse['speedAuthority'],
  minMovingSpeedKmh: number,
): boolean {
  if (normalizeMotionFsmEvidenceQuality(sample.evidenceQuality) !== 'DIRECT') return false;
  if (!isMovingMotionFsmState(sample.motionState)) return false;
  if (!hasAuthoritativeSpeedSample(sample, speedAuthority)) return false;
  return sample.speedKmh! > minMovingSpeedKmh;
}

export function isAccountableFsmStationarySecond(
  sample: DiV0MotionCoreShadowTripMapSampleDto,
  speedAuthority: DiV0MotionCoreShadowTripMapReadResponse['speedAuthority'],
  minMovingSpeedKmh: number,
): boolean {
  if (normalizeMotionFsmEvidenceQuality(sample.evidenceQuality) !== 'DIRECT') return false;
  if (!isStationaryMotionFsmState(sample.motionState)) return false;
  if (!hasAuthoritativeSpeedSample(sample, speedAuthority)) {
    return sample.speedKmh == null;
  }
  return sample.speedKmh! <= minMovingSpeedKmh;
}

export function isEligibleFsmStopEpisode(stop: DiV0MotionCoreShadowTripMapStopDto): boolean {
  if (!stop.observed || stop.inferred) return false;
  if (normalizeMotionFsmEvidenceQuality(stop.evidenceQuality) !== 'DIRECT') return false;
  if (!stop.endEarliestUtc || !stop.endLatestUtc) return false;
  const startLatestMs = Date.parse(stop.startLatestUtc);
  const endEarliestMs = Date.parse(stop.endEarliestUtc);
  if (!Number.isFinite(startLatestMs) || !Number.isFinite(endEarliestMs) || endEarliestMs < startLatestMs) {
    return false;
  }
  return true;
}
