import type { DimoTripSegmentValidationMechanism } from './dimo-trip-segment-validation.types';

export const DIMO_SEGMENT_VALIDATION_MODEL_VERSION = 'dimo-segment-validation-v1';

/** Buffer around trip window when querying DIMO segments (read-only). */
export const DIMO_SEGMENT_VALIDATION_WINDOW_BUFFER_MS = 5 * 60 * 1000;

export const DIMO_SEGMENT_VALIDATION_TOLERANCES = {
  minorStartEndDeltaSec: 120,
  majorStartEndDeltaSec: 600,
  minorDurationDeltaSec: 180,
  majorDurationDeltaSec: 900,
  minorDistanceDeltaKm: 1.0,
  majorDistanceDeltaKm: 5.0,
} as const;

export const MECHANISM_PROVIDER_SOURCE: Record<DimoTripSegmentValidationMechanism, string> = {
  ignitionDetection: 'dimo:ignitionDetection',
  frequencyAnalysis: 'dimo:frequencyAnalysis',
  changePointDetection: 'dimo:changePointDetection',
};
