import type { DiV0MotionCoreShadowTripMapEventDto } from '../../driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow-trip-map-read.types';
import type { DiV0MotionCoreShadowTripMapReadResponse } from '../../driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow-trip-map-read.types';
import {
  classifyDs4EventQuality,
  durationSecondsFromUtcLabels,
  isManoeuvreEvent,
} from './tire-ds4-shadow-admission';
import { TIRE_DS4_SHADOW_INPUT_PAYLOAD_SCHEMA_VERSION } from './tire-ds4-shadow-adapter.version';
import type {
  TireDs4ShadowChannelSummary,
  TireDs4ShadowEventQualityCoverage,
  TireDs4ShadowInputPayloadV2,
  TireDs4ShadowTemporalCoverage,
} from './tire-ds4-shadow.types';

function emptyChannel(): TireDs4ShadowChannelSummary {
  return {
    okCount: 0,
    okDurationS: 0,
    okDeltaKmhAbsSum: 0,
    degradedCount: 0,
    limitedCount: 0,
    excludedArtefactCount: 0,
    excludedOtherQualityCount: 0,
  };
}

function accumulateChannel(
  channel: TireDs4ShadowChannelSummary,
  event: DiV0MotionCoreShadowTripMapEventDto,
): void {
  const classification = classifyDs4EventQuality(event.quality, event.artefactSuspect);
  const durationS = durationSecondsFromUtcLabels(event.startLabelUtc, event.endLabelUtc);

  if (classification === 'OK') {
    channel.okCount += 1;
    if (durationS != null) channel.okDurationS += durationS;
    channel.okDeltaKmhAbsSum += Math.abs(event.deltaKmh);
  } else if (classification === 'DEGRADED') {
    channel.degradedCount += 1;
  } else if (classification === 'LIMITED') {
    channel.limitedCount += 1;
  } else if (classification === 'ARTEFACT_SUSPECT') {
    channel.excludedArtefactCount += 1;
  } else {
    channel.excludedOtherQualityCount += 1;
  }
}

function resolveEventQualityCoverage(
  acceleration: TireDs4ShadowChannelSummary,
  deceleration: TireDs4ShadowChannelSummary,
): TireDs4ShadowEventQualityCoverage {
  const admissible =
    acceleration.okCount +
    acceleration.degradedCount +
    deceleration.okCount +
    deceleration.degradedCount;
  if (admissible === 0) return 'NONE';
  return 'PARTIAL';
}

export function mapDs4TripMapToTireShadowInput(
  read: DiV0MotionCoreShadowTripMapReadResponse,
): TireDs4ShadowInputPayloadV2 {
  const acceleration = emptyChannel();
  const deceleration = emptyChannel();

  for (const event of read.events) {
    if (!isManoeuvreEvent(event)) continue;
    if (event.displayKind === 'ACCELERATION') {
      accumulateChannel(acceleration, event);
    } else {
      accumulateChannel(deceleration, event);
    }
  }

  const eventQualityCoverage = resolveEventQualityCoverage(acceleration, deceleration);
  const hasAdmissibleSignal =
    acceleration.okCount > 0 ||
    deceleration.okCount > 0 ||
    acceleration.degradedCount > 0 ||
    deceleration.degradedCount > 0;

  return {
    schemaVersion: TIRE_DS4_SHADOW_INPUT_PAYLOAD_SCHEMA_VERSION,
    neutral: !hasAdmissibleSignal,
    shadowBundleVersion: read.algorithmVersions?.bundle ?? null,
    acceleration,
    deceleration,
    eventQualityCoverage,
    temporalCoverage: 'UNVERIFIED',
    limitations: read.limitations ?? [],
    newerFailedRunId: read.newerFailedRunId,
    newerFailedRunStatus: read.newerFailedRunStatus,
  };
}

export function eventQualityCoverageFromPayload(
  payload: TireDs4ShadowInputPayloadV2,
): TireDs4ShadowEventQualityCoverage {
  return resolveEventQualityCoverage(payload.acceleration, payload.deceleration);
}
