import type { DiV0R1ObdAcquisitionRequest } from '../../di-v0-r1-obd-acquisition.types';

/** Canonical `DimoVehicle.rawJson` device shape — resolves to RUPTELA_R1 via the shared resolver. */
export const RUPTELA_DEVICE_IDENTITY = {
  aftermarketDevice: { serial: 'R1-TEST-7503' },
  syntheticDevice: null,
};

export const SYNTHETIC_DEVICE_IDENTITY = {
  aftermarketDevice: null,
  syntheticDevice: { id: 'synthetic-test' },
};

export function baseR1Request(fromUtc: string, toUtc: string): DiV0R1ObdAcquisitionRequest {
  return {
    organizationId: 'org-s3b-test',
    vehicleId: 'vehicle-s3b-test',
    tripId: 'trip-s3b-test',
    dimoTokenId: 7503,
    dimoDeviceIdentity: RUPTELA_DEVICE_IDENTITY,
    fromUtc,
    toUtc,
  };
}

/** ~9% sparse speed pattern over 100 buckets (structural WOB analogue). */
export function wobSparseR1Rows(fromUtc: string): Record<string, unknown>[] {
  const start = Date.parse(fromUtc);
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < 100; i++) {
    if (i % 11 !== 0) continue;
    const ts = new Date(start + i * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    rows.push({
      timestamp: ts,
      speed: 42 + (i % 5),
      powertrainCombustionEngineSpeed: 1800,
      obdThrottlePosition: 12,
      obdEngineLoad: 30,
      powertrainCombustionEngineECT: 88,
      powertrainTransmissionCurrentGear: 4,
    });
  }
  return rows;
}

/** Legacy stale/mistimed speeding — single high R1 speed bucket. */
export function legacyStaleSpeedingRow(label: string): Record<string, unknown> {
  return {
    timestamp: label,
    speed: 145,
    powertrainCombustionEngineSpeed: 2200,
    obdThrottlePosition: 80,
    obdEngineLoad: 55,
    powertrainCombustionEngineECT: 90,
    powertrainTransmissionCurrentGear: 5,
  };
}

/** Carries an unqueried `isIgnitionOn` field: S3B must ignore it (ignition is not in the V0_2 query). */
export function engineIgnitionDropoutRow(label: string): Record<string, unknown> {
  return {
    timestamp: label,
    speed: 65,
    powertrainCombustionEngineSpeed: 1500,
    obdThrottlePosition: 20,
    obdEngineLoad: 40,
    powertrainCombustionEngineECT: 85,
    powertrainTransmissionCurrentGear: 4,
    isIgnitionOn: 0,
  };
}
