import type { ShutdownEvidenceFieldBundle } from '../shutdown-evidence/shutdown-evidence.types';

/** Field bundle for generalized evidence — aligned with M3.2B provenance shape. */
export type GeneralizedEvidenceFieldBundle = ShutdownEvidenceFieldBundle & {
  temperatureC?: number | null;
  temperatureObservedAt?: Date | null;
};

export type GeneralizedEvidenceCaptureOutcome =
  | 'skipped_flag_off'
  | 'skipped_not_ice'
  | 'skipped_no_measurement'
  | 'skipped_no_voltage'
  | 'duplicate'
  | 'created';

export type RestSessionProcessOutcome =
  | 'noop'
  | 'session_opened'
  | 'session_updated'
  | 'session_ended'
  | 'session_invalidated';
