import type {
  RawFuelSignalSample,
  RawFuelRiseDetectionContext,
} from '../raw-fuel-signal-sample.types';
import {
  RFRF_RISE_DETECTION_VERSION,
  RFRF_RISE_DETECTOR_VERSION,
} from '../raw-fuel-rise-detector.config';

export function buildDetectionContext(
  overrides: Partial<RawFuelRiseDetectionContext> = {},
): RawFuelRiseDetectionContext {
  return {
    organizationId: 'org-test',
    vehicleId: 'veh-test',
    scanWindowStart: new Date('2026-09-06T08:00:00.000Z'),
    scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
    absoluteSignalTrust: 'TRUSTED',
    relativeSignalAvailable: false,
    signalProvider: 'DIMO',
    detectionVersion: RFRF_RISE_DETECTION_VERSION,
    detectorVersion: RFRF_RISE_DETECTOR_VERSION,
    routeEvidenceAvailable: false,
    stationaryEvidenceAvailable: false,
    ...overrides,
  };
}

export function sampleAt(
  iso: string,
  absoluteLiters?: number | null,
  relativePercent?: number | null,
): RawFuelSignalSample {
  return {
    timestamp: new Date(iso),
    absoluteLiters,
    relativePercent,
  };
}

export function stablePlateauSamples(
  startIso: string,
  value: number,
  count: number,
  stepSeconds = 60,
  channel: 'absolute' | 'relative' = 'absolute',
): RawFuelSignalSample[] {
  const start = new Date(startIso).getTime();
  return Array.from({ length: count }, (_, i) => {
    const timestamp = new Date(start + i * stepSeconds * 1000);
    return channel === 'absolute'
      ? { timestamp, absoluteLiters: value, relativePercent: null }
      : { timestamp, absoluteLiters: null, relativePercent: value };
  });
}

export function linearRiseSamples(
  startIso: string,
  values: number[],
  stepSeconds = 60,
): RawFuelSignalSample[] {
  const start = new Date(startIso).getTime();
  return values.map((absoluteLiters, i) => ({
    timestamp: new Date(start + i * stepSeconds * 1000),
    absoluteLiters,
    relativePercent: null,
  }));
}
