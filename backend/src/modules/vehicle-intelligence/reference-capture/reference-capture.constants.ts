export const REFERENCE_CAPTURE_CONNECTION_PROFILE = 'DIMO_LTE_R1' as const;
export const REFERENCE_CAPTURE_PROVIDER = 'DIMO' as const;
export const REFERENCE_CAPTURE_MANIFEST_ID = 'DIMO_LTE_R1_REFERENCE_MANIFEST';
export const REFERENCE_CAPTURE_MANIFEST_PATH =
  'docs/audits/manifests/dimo-lte-r1-reference-manifest-v1.json';

/** Versioned Flight Recorder wire/storage contract (RP-040). */
export const REFERENCE_CAPTURE_ENVELOPE_VERSION = '1.0.0';

/** Recorder software/model version stamped on sessions. */
export const REFERENCE_CAPTURE_RECORDER_SOFTWARE_VERSION = '3A.1.0';

export const REFERENCE_CAPTURE_ACQUISITION_TIER = 'T7';
export const REFERENCE_CAPTURE_ACQUISITION_SURFACE = 'VALIDATION_FLIGHT_RECORDER';

export const REFERENCE_CAPTURE_RAW_IDENTITY_PREFIX = 'DIMO::';

/** Known analysis events — minimum set, not observation ceiling. */
export const REFERENCE_CAPTURE_KNOWN_ANALYSIS_EVENTS = [
  'behavior.acceleration',
  'behavior.braking',
  'behavior.cornering',
  'behavior.extremeBraking',
  'behavior.harshAcceleration',
  'behavior.harshBraking',
  'behavior.harshCornering',
  'behavior.speeding',
] as const;
