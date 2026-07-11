import {
  DEVICE_QUALITY_OBSERVATION_MARKER,
  DEVICE_QUALITY_WORKER_ID,
} from '@modules/vehicle-intelligence/trips/driving-assessment-device-quality.detector';

/** Device-quality auto-observations are covered by DRIVING_ASSESSMENT_DEVICE_QUALITY — not TECHNICAL_OBSERVATION_ACTIVE. */
export function isDeviceQualitySystemObservation(input: {
  createdByWorkerId?: string | null;
  notes?: string | null;
}): boolean {
  if (input.createdByWorkerId === DEVICE_QUALITY_WORKER_ID) return true;
  const notes = input.notes?.trim() ?? '';
  return notes.includes(DEVICE_QUALITY_OBSERVATION_MARKER);
}

export function buildTechnicalObservationConditionCode(observationId: string): string {
  return `technical_observation_active:${observationId}`;
}
