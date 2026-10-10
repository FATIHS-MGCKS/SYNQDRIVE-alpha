import type { DetectedRiseDraft } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-state-machine';
import type { R4aResolvedCanonicalEventAnchors } from './rfrf-oq014-r4a-canonical-event-anchors.lib';
import { anchorIsVerifiedForAttribution } from './rfrf-oq014-r4a-canonical-event-anchors.lib';

export interface R4aEventRiseAnchors {
  eventId: string;
  canonicalRefuelTimestamp: Date;
  episodeWindowFrom: Date;
  episodeWindowTo: Date;
}

export type R4aRiseAttributionResult =
  | { status: 'ATTRIBUTED'; rise: DetectedRiseDraft }
  | { status: 'AMBIGUOUS'; candidateCount: number; reason: string }
  | { status: 'NONE'; reason: string }
  | { status: 'UNVERIFIED_EVENT_ANCHOR'; reason: string }
  | { status: 'INVALID_EVENT_ANCHOR'; reason: string }
  | { status: 'ANCHOR_NOT_CONTAINED_IN_RISE'; reason: string };

function risePhysicalEpisodeBounds(rise: DetectedRiseDraft): { startMs: number; endMs: number } {
  const risePointTimes = rise.risePoints.map((p) => p.timestamp.getTime());
  const preTimes = rise.prePlateau.samples.map((p) => p.timestamp.getTime());
  const postTimes = rise.postPlateau?.samples.map((p) => p.timestamp.getTime()) ?? [];
  const candidates = [
    rise.riseOnsetAt.getTime(),
    rise.riseEndAt.getTime(),
    ...risePointTimes,
    ...preTimes,
    ...postTimes,
  ];
  return { startMs: Math.min(...candidates), endMs: Math.max(...candidates) };
}

function riseContainsCanonicalTimestamp(rise: DetectedRiseDraft, canonicalRefuelTimestamp: Date): boolean {
  const t = canonicalRefuelTimestamp.getTime();
  const { startMs, endMs } = risePhysicalEpisodeBounds(rise);
  return startMs <= t && t <= endMs;
}

function riseOverlapsEpisodeWindow(
  rise: DetectedRiseDraft,
  episodeWindowFrom: Date,
  episodeWindowTo: Date,
): boolean {
  return (
    rise.riseOnsetAt.getTime() <= episodeWindowTo.getTime() &&
    rise.riseEndAt.getTime() >= episodeWindowFrom.getTime()
  );
}

/**
 * Attribute a channel rise only when an independently verified canonical refuel timestamp
 * lies inside exactly one detected rise interval — no nearest-rise fallback.
 */
export function attributeChannelRiseToCanonicalEvent(
  rises: DetectedRiseDraft[],
  resolvedAnchors: R4aResolvedCanonicalEventAnchors,
): R4aRiseAttributionResult {
  if (!anchorIsVerifiedForAttribution(resolvedAnchors)) {
    return {
      status: 'UNVERIFIED_EVENT_ANCHOR',
      reason: resolvedAnchors.provenanceDetail,
    };
  }

  const canonicalRefuelTimestamp = new Date(resolvedAnchors.canonicalRefuelTimestampUtc!);
  if (!Number.isFinite(canonicalRefuelTimestamp.getTime())) {
    return { status: 'INVALID_EVENT_ANCHOR', reason: 'CANONICAL_REFUEL_TIMESTAMP_INVALID' };
  }

  const episodeWindowFrom = new Date(resolvedAnchors.queryWindowFromUtc);
  const episodeWindowTo = new Date(resolvedAnchors.queryWindowToUtc);
  if (!Number.isFinite(episodeWindowFrom.getTime()) || !Number.isFinite(episodeWindowTo.getTime())) {
    return { status: 'INVALID_EVENT_ANCHOR', reason: 'QUERY_WINDOW_INVALID' };
  }

  const inEpisode = rises.filter((r) =>
    riseOverlapsEpisodeWindow(r, episodeWindowFrom, episodeWindowTo),
  );
  if (inEpisode.length === 0) {
    return { status: 'NONE', reason: 'NO_RISE_IN_EPISODE_WINDOW' };
  }

  const containing = inEpisode.filter((r) =>
    riseContainsCanonicalTimestamp(r, canonicalRefuelTimestamp),
  );
  if (containing.length === 1) {
    return { status: 'ATTRIBUTED', rise: containing[0] };
  }
  if (containing.length > 1) {
    return {
      status: 'AMBIGUOUS',
      candidateCount: containing.length,
      reason: 'MULTIPLE_RISES_CONTAIN_CANONICAL_REFUEL_TIMESTAMP',
    };
  }

  return {
    status: 'ANCHOR_NOT_CONTAINED_IN_RISE',
    reason: 'CANONICAL_REFUEL_TIMESTAMP_NOT_INSIDE_ANY_DETECTED_RISE',
  };
}
