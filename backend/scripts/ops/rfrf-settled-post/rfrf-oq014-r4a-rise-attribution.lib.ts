import type { DetectedRiseDraft } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-state-machine';

export interface R4aEventRiseAnchors {
  eventId: string;
  eventTimestamp: Date;
  episodeWindowFrom: Date;
  episodeWindowTo: Date;
}

export type R4aRiseAttributionResult =
  | { status: 'ATTRIBUTED'; rise: DetectedRiseDraft }
  | { status: 'AMBIGUOUS'; candidateCount: number; reason: string }
  | { status: 'NONE'; reason: string };

const INDISTINGUISHABLE_PROXIMITY_MS = 60_000;

function riseContainsEventTimestamp(rise: DetectedRiseDraft, eventTimestamp: Date): boolean {
  const t = eventTimestamp.getTime();
  return rise.riseOnsetAt.getTime() <= t && t <= rise.riseEndAt.getTime();
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

function distanceToRiseIntervalMs(rise: DetectedRiseDraft, eventTimestamp: Date): number {
  const t = eventTimestamp.getTime();
  const start = rise.riseOnsetAt.getTime();
  const end = rise.riseEndAt.getTime();
  if (t < start) return start - t;
  if (t > end) return t - end;
  return 0;
}

/**
 * Attribute exactly one channel rise to a canonical calibration event using
 * episode window + event timestamp anchors — never highest-peak heuristics alone.
 */
export function attributeChannelRiseToCanonicalEvent(
  rises: DetectedRiseDraft[],
  anchors: R4aEventRiseAnchors,
): R4aRiseAttributionResult {
  const inEpisode = rises.filter((r) =>
    riseOverlapsEpisodeWindow(r, anchors.episodeWindowFrom, anchors.episodeWindowTo),
  );
  if (inEpisode.length === 0) {
    return { status: 'NONE', reason: 'NO_RISE_IN_EPISODE_WINDOW' };
  }

  const containing = inEpisode.filter((r) => riseContainsEventTimestamp(r, anchors.eventTimestamp));
  if (containing.length === 1) {
    return { status: 'ATTRIBUTED', rise: containing[0] };
  }
  if (containing.length > 1) {
    return {
      status: 'AMBIGUOUS',
      candidateCount: containing.length,
      reason: 'MULTIPLE_RISES_CONTAIN_EVENT_TIMESTAMP',
    };
  }

  const ranked = inEpisode
    .map((rise) => ({ rise, distMs: distanceToRiseIntervalMs(rise, anchors.eventTimestamp) }))
    .sort((a, b) => a.distMs - b.distMs);

  if (
    ranked.length >= 2 &&
    ranked[1].distMs - ranked[0].distMs < INDISTINGUISHABLE_PROXIMITY_MS
  ) {
    return {
      status: 'AMBIGUOUS',
      candidateCount: inEpisode.length,
      reason: 'INDISTINGUISHABLE_RISE_PROXIMITY_TO_EVENT_ANCHOR',
    };
  }

  return { status: 'ATTRIBUTED', rise: ranked[0].rise };
}
