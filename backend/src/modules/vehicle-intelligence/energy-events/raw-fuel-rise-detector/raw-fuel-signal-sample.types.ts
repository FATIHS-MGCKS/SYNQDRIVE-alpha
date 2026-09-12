/** Provider-neutral fuel telemetry sample for RFRF F3 detector input. */
export interface RawFuelSignalSample {
  timestamp: Date;
  absoluteLiters?: number | null;
  relativePercent?: number | null;
}

/** Scan context separate from per-sample payload. */
export interface RawFuelRiseDetectionContext {
  organizationId: string;
  vehicleId: string;
  scanWindowStart: Date;
  scanWindowEnd: Date;
  absoluteSignalTrust: 'TRUSTED' | 'UNTRUSTED' | 'UNKNOWN';
  relativeSignalAvailable: boolean;
  signalProvider?: string | null;
  detectionVersion: string;
  detectorVersion: string;
  routeEvidenceAvailable?: boolean | null;
  stationaryEvidenceAvailable?: boolean | null;
}

export interface RawFuelRiseDetectionInput {
  context: RawFuelRiseDetectionContext;
  samples: RawFuelSignalSample[];
}
