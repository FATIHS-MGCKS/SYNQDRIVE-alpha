import type {
  LvAssessmentMode,
  LvAssessmentTrack,
} from './lv-estimated-health-assessment.policy';

export interface LvPublicationArbitrationCandidate {
  assessmentId: string;
  assessmentTrack: LvAssessmentTrack;
  assessmentMode: LvAssessmentMode;
}

export interface LvPublicationTrackArbitrationResult {
  selected: LvPublicationArbitrationCandidate | null;
  epochAssessmentIds: string[];
}

const PUBLICATION_TRACK_PRECEDENCE: Record<LvAssessmentTrack, number> = {
  WORKSHOP_OVERRIDE: 2,
  TELEMETRY: 1,
};

function isQualifyingCanonicalCandidate(
  candidate: LvPublicationArbitrationCandidate,
): boolean {
  return (
    candidate.assessmentMode === 'CANONICAL' &&
    (candidate.assessmentTrack === 'WORKSHOP_OVERRIDE' ||
      candidate.assessmentTrack === 'TELEMETRY')
  );
}

/**
 * D4 — select at most one authoritative assessment from the current recompute epoch.
 * Operates only on explicit epoch candidates; never uses latest-wins heuristics.
 */
export function arbitrateLvPublicationTrack(
  candidates: LvPublicationArbitrationCandidate[],
): LvPublicationTrackArbitrationResult {
  const epochAssessmentIds = candidates.map((row) => row.assessmentId);
  const qualifying = candidates.filter(isQualifyingCanonicalCandidate);

  if (qualifying.length === 0) {
    return { selected: null, epochAssessmentIds };
  }

  let winner = qualifying[0];
  for (const candidate of qualifying.slice(1)) {
    const currentRank = PUBLICATION_TRACK_PRECEDENCE[winner.assessmentTrack];
    const candidateRank = PUBLICATION_TRACK_PRECEDENCE[candidate.assessmentTrack];
    if (candidateRank > currentRank) {
      winner = candidate;
    }
  }

  return { selected: winner, epochAssessmentIds };
}

/**
 * D4 recovery — re-apply arbitration on durable epoch evidence (assessment IDs + tracks).
 */
export function arbitrateLvPublicationTrackFromEpochEvidence(
  epochEvidence: LvPublicationArbitrationCandidate[],
): LvPublicationTrackArbitrationResult {
  return arbitrateLvPublicationTrack(epochEvidence);
}
