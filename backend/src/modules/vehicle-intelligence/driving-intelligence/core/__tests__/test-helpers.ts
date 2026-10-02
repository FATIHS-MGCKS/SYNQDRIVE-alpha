import type { NormalizedPositionObservation, TelemetrySourceFamily } from '../types';

export function presentObs(
  bucketLabel: string,
  latitude: number,
  longitude: number,
  sourceFamily: TelemetrySourceFamily = 'RUPTELA_R1',
): NormalizedPositionObservation {
  const startMs = Date.parse(bucketLabel);
  const intervalEnd = new Date(startMs + 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const referenceTime = new Date(startMs + 500).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return {
    bucketLabel,
    intervalStart: bucketLabel,
    intervalEnd,
    referenceTime,
    availability: 'PRESENT',
    latitude,
    longitude,
    sourceFamily,
    provenance: { sourceSignal: 'currentLocationCoordinates', derivedFrom: ['test'] },
  };
}

export function signalNullObs(
  bucketLabel: string,
  sourceFamily: TelemetrySourceFamily = 'RUPTELA_R1',
): NormalizedPositionObservation {
  const startMs = Date.parse(bucketLabel);
  const intervalEnd = new Date(startMs + 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const referenceTime = new Date(startMs + 500).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return {
    bucketLabel,
    intervalStart: bucketLabel,
    intervalEnd,
    referenceTime,
    availability: 'SIGNAL_NULL',
    sourceFamily,
    provenance: { sourceSignal: 'currentLocationCoordinates', derivedFrom: ['test'] },
  };
}
