/**
 * Injectable calibration bundle — provisional numeric thresholds only.
 * Structural rules remain in code keyed by structuralVersion.
 */
export interface DiV0CalibrationBundle {
  calibrationVersion: string;
  /** PILOT_DERIVED_NOT_VALIDATED — C1D provisional registry. */
  stopStationaryBandMaxKmh: number;
  stopMovingBandMinKmh: number;
  l3CrawlBandMaxKmh: number;
  holdNoiseDisplacementM: number;
  holdMovementLowerBoundMinKmh: number;
  confidenceHighSpeedRangePct: number;
  confidenceModerateSpeedRangeAbsKmh: number;
  confidenceModerateSpeedRangePct: number;
  r1CorroborationAbsKmh: number;
  r1ConflictAbsKmh: number;
}
