import { TIRE_DS4_SHADOW_INPUT_PAYLOAD_SCHEMA_VERSION } from './tire-ds4-shadow-adapter.version';
import type { TireDs4ShadowChannelSummary, TireDs4ShadowInputPayloadV3 } from './tire-ds4-shadow.types';

function emptyChannel(): TireDs4ShadowChannelSummary {
  return {
    okCount: 0,
    okDurationS: 0,
    okDeltaKmhAbsSum: 0,
    okM3JPerKgPerKmSum: 0,
    okM3EventCount: 0,
    degradedCount: 0,
    limitedCount: 0,
    excludedArtefactCount: 0,
    excludedOtherQualityCount: 0,
  };
}

export function buildNeutralTireDs4ShadowInputPayloadV3(
  reason: string,
): TireDs4ShadowInputPayloadV3 {
  return {
    schemaVersion: TIRE_DS4_SHADOW_INPUT_PAYLOAD_SCHEMA_VERSION,
    neutral: true,
    shadowBundleVersion: null,
    tripDistanceKm: null,
    speedAuthority: null,
    acceleration: emptyChannel(),
    deceleration: emptyChannel(),
    eventQualityCoverage: 'NONE',
    temporalCoverage: 'NONE',
    temporalCoverageDetail: {
      tripWindowSeconds: 0,
      labelledSampleSeconds: 0,
      validDrivingSeconds: 0,
      confirmedStationarySeconds: 0,
      degradedLabelSeconds: 0,
      invalidLabelSeconds: 0,
      gapSeconds: 0,
      unknownSeconds: 0,
      labelledFraction: null,
      accountableFraction: null,
      fableHypothesis85PctThreshold: 0.85,
      verified: false,
    },
    limitations: [reason],
    newerFailedRunId: null,
    newerFailedRunStatus: null,
  };
}
