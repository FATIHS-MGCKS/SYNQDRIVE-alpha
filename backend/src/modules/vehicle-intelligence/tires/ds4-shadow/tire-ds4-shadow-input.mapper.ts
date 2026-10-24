import type { DiV0MotionCoreShadowTripMapEventDto } from '../../driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow-trip-map-read.types';
import type { DiV0MotionCoreShadowTripMapReadResponse } from '../../driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow-trip-map-read.types';
import {
  classifyDs4EventQuality,
  countAdmissibleForQuality,
  countDurationForQuality,
  durationSecondsFromUtcLabels,
  isIntensityBundleAdmissible,
  isManoeuvreEvent,
  ordinalDeltaKmhBucket,
  ordinalIntensityForQuality,
} from './tire-ds4-shadow-admission';
import { TIRE_DS4_SHADOW_INPUT_PAYLOAD_SCHEMA_VERSION } from './tire-ds4-shadow-adapter.version';
import type {
  TireDs4ShadowChannelSummary,
  TireDs4ShadowCoverage,
  TireDs4ShadowInputPayloadV1,
} from './tire-ds4-shadow.types';

function emptyChannel(): TireDs4ShadowChannelSummary {
  return {
    okCount: 0,
    okDurationS: 0,
    degradedCount: 0,
    limitedCount: 0,
    excludedArtefactCount: 0,
    excludedOtherQualityCount: 0,
    ordinalDeltaKmhBuckets: { low: 0, medium: 0, high: 0 },
  };
}

function accumulateChannel(
  channel: TireDs4ShadowChannelSummary,
  event: DiV0MotionCoreShadowTripMapEventDto,
  intensityAdmissible: boolean,
): void {
  const classification = classifyDs4EventQuality(event.quality, event.artefactSuspect);
  const durationS = durationSecondsFromUtcLabels(event.startLabelUtc, event.endLabelUtc);

  if (classification === 'OK') {
    channel.okCount += 1;
    if (durationS != null) channel.okDurationS += durationS;
  } else if (classification === 'DEGRADED') {
    channel.degradedCount += 1;
  } else if (classification === 'LIMITED') {
    channel.limitedCount += 1;
  } else if (classification === 'ARTEFACT_SUSPECT') {
    channel.excludedArtefactCount += 1;
  } else {
    channel.excludedOtherQualityCount += 1;
  }

  if (
    intensityAdmissible &&
    ordinalIntensityForQuality(classification) &&
    countAdmissibleForQuality(classification)
  ) {
    const bucket = ordinalDeltaKmhBucket(event.deltaKmh);
    channel.ordinalDeltaKmhBuckets[bucket] += 1;
  }

  if (!countDurationForQuality(classification) && durationS != null && classification === 'LIMITED') {
    // LIMITED excluded from load; duration not accumulated (counts only for coverage).
  }
}

function resolveCoverage(
  acceleration: TireDs4ShadowChannelSummary,
  deceleration: TireDs4ShadowChannelSummary,
): TireDs4ShadowCoverage {
  const admissible =
    acceleration.okCount +
    acceleration.degradedCount +
    deceleration.okCount +
    deceleration.degradedCount;
  const excluded =
    acceleration.limitedCount +
    acceleration.excludedArtefactCount +
    acceleration.excludedOtherQualityCount +
    deceleration.limitedCount +
    deceleration.excludedArtefactCount +
    deceleration.excludedOtherQualityCount;

  if (admissible === 0) return 'NONE';
  if (excluded > 0 || acceleration.degradedCount > 0 || deceleration.degradedCount > 0) {
    return 'PARTIAL';
  }
  return 'FULL';
}

export function mapDs4TripMapToTireShadowInput(
  read: DiV0MotionCoreShadowTripMapReadResponse,
): TireDs4ShadowInputPayloadV1 {
  const bundle = read.algorithmVersions?.bundle ?? '';
  const intensityAdmissible = isIntensityBundleAdmissible(bundle);

  const acceleration = emptyChannel();
  const deceleration = emptyChannel();

  for (const event of read.events) {
    if (!isManoeuvreEvent(event)) continue;
    if (event.displayKind === 'ACCELERATION') {
      accumulateChannel(acceleration, event, intensityAdmissible);
    } else {
      accumulateChannel(deceleration, event, intensityAdmissible);
    }
  }

  const coverage = resolveCoverage(acceleration, deceleration);
  const hasAdmissibleLoadSignal =
    acceleration.okCount > 0 ||
    deceleration.okCount > 0 ||
    acceleration.degradedCount > 0 ||
    deceleration.degradedCount > 0;

  return {
    schemaVersion: TIRE_DS4_SHADOW_INPUT_PAYLOAD_SCHEMA_VERSION,
    neutral: !hasAdmissibleLoadSignal,
    intensityAdmissible,
    acceleration,
    deceleration,
    limitations: read.limitations ?? [],
    newerFailedRunId: read.newerFailedRunId,
    newerFailedRunStatus: read.newerFailedRunStatus,
  };
}

export function coverageFromPayload(payload: TireDs4ShadowInputPayloadV1): TireDs4ShadowCoverage {
  return resolveCoverage(payload.acceleration, payload.deceleration);
}
