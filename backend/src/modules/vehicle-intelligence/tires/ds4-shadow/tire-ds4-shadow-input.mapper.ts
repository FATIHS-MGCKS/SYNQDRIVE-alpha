import type { DiV0MotionCoreShadowTripMapReadResponse } from '../../driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow-trip-map-read.types';
import {
  classifyDs4EventQuality,
  durationSecondsFromUtcLabels,
  isManoeuvreEvent,
} from './tire-ds4-shadow-admission';
import { TIRE_DS4_SHADOW_INPUT_PAYLOAD_SCHEMA_VERSION } from './tire-ds4-shadow-adapter.version';
import { m3ContributionJPerKgPerKm } from './tire-ds4-shadow-m3-dynamics';
import {
  computeTemporalCoverage,
  type TireDs4ShadowTripWindowContext,
} from './tire-ds4-shadow-temporal-coverage';
import type {
  TireDs4ShadowChannelSummary,
  TireDs4ShadowEventQualityCoverage,
  TireDs4ShadowInputPayloadV3,
} from './tire-ds4-shadow.types';

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

function accumulateChannel(
  channel: TireDs4ShadowChannelSummary,
  event: Parameters<typeof m3ContributionJPerKgPerKm>[0],
  tripDistanceKm: number | null,
): void {
  const classification = classifyDs4EventQuality(event.quality, event.artefactSuspect);
  const durationS = durationSecondsFromUtcLabels(event.startLabelUtc, event.endLabelUtc);

  if (classification === 'OK') {
    channel.okCount += 1;
    if (durationS != null) channel.okDurationS += durationS;
    channel.okDeltaKmhAbsSum += Math.abs(event.deltaKmh);
    if (tripDistanceKm != null && tripDistanceKm > 0) {
      const m3 = m3ContributionJPerKgPerKm(event, tripDistanceKm);
      if (m3 != null) {
        channel.okM3JPerKgPerKmSum += m3;
        channel.okM3EventCount += 1;
      }
    }
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
  trip: TireDs4ShadowTripWindowContext,
): TireDs4ShadowInputPayloadV3 {
  const acceleration = emptyChannel();
  const deceleration = emptyChannel();
  const tripDistanceKm =
    Number.isFinite(trip.tripDistanceKm) && trip.tripDistanceKm > 0
      ? trip.tripDistanceKm
      : null;

  for (const event of read.events) {
    if (!isManoeuvreEvent(event)) continue;
    if (event.displayKind === 'ACCELERATION') {
      accumulateChannel(acceleration, event, tripDistanceKm);
    } else {
      accumulateChannel(deceleration, event, tripDistanceKm);
    }
  }

  const eventQualityCoverage = resolveEventQualityCoverage(acceleration, deceleration);
  const hasAdmissibleSignal =
    acceleration.okCount > 0 ||
    deceleration.okCount > 0 ||
    acceleration.degradedCount > 0 ||
    deceleration.degradedCount > 0;

  const { temporalCoverage, detail: temporalCoverageDetail } = computeTemporalCoverage(
    read,
    trip,
  );

  return {
    schemaVersion: TIRE_DS4_SHADOW_INPUT_PAYLOAD_SCHEMA_VERSION,
    neutral: !hasAdmissibleSignal,
    shadowBundleVersion: read.algorithmVersions?.bundle ?? null,
    tripDistanceKm,
    speedAuthority: read.speedAuthority,
    acceleration,
    deceleration,
    eventQualityCoverage,
    temporalCoverage,
    temporalCoverageDetail,
    limitations: read.limitations ?? [],
    newerFailedRunId: read.newerFailedRunId,
    newerFailedRunStatus: read.newerFailedRunStatus,
  };
}

export function eventQualityCoverageFromPayload(
  payload: TireDs4ShadowInputPayloadV3,
): TireDs4ShadowEventQualityCoverage {
  return resolveEventQualityCoverage(payload.acceleration, payload.deceleration);
}
