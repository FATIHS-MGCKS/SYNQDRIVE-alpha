import { CALIBRATION_UNSET_V0 } from '../versions';
import type { DiV0CalibrationBundle } from './types';

/** Provisional pilot-derived numbers — NOT production authority (DI_V0_PROVISIONAL_PARAMETERS.md). */
export const CALIBRATION_UNSET_V0_BUNDLE: DiV0CalibrationBundle = {
  calibrationVersion: CALIBRATION_UNSET_V0,
  stopStationaryBandMaxKmh: 3,
  stopMovingBandMinKmh: 5,
  l3CrawlBandMaxKmh: 5,
  holdNoiseDisplacementM: 0.68,
  holdMovementLowerBoundMinKmh: 5,
  confidenceHighSpeedRangePct: 0.1,
  confidenceModerateSpeedRangeAbsKmh: 5,
  confidenceModerateSpeedRangePct: 0.2,
  r1CorroborationAbsKmh: 5,
  r1ConflictAbsKmh: 10,
};
