import type { LvAssessmentTrack } from './lv-estimated-health-assessment.policy';

export type LvPublicationTrackObservability =
  | LvAssessmentTrack
  | 'UNKNOWN';

export function resolvePublicationAuthorityEpochChanged(input: {
  previousTrack: LvPublicationTrackObservability;
  currentTrack: LvAssessmentTrack;
}): boolean {
  if (input.previousTrack === 'UNKNOWN') {
    return true;
  }
  return input.previousTrack !== input.currentTrack;
}

export function isKnownPublicationTrack(
  track: LvPublicationTrackObservability | null | undefined,
): track is LvAssessmentTrack {
  return track === 'TELEMETRY' || track === 'WORKSHOP_OVERRIDE';
}
