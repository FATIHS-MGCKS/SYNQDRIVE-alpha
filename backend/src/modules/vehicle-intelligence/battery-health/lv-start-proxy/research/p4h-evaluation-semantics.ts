/**
 * Research-only evaluation time semantics for START_DIP_PROXY cadence gate replay.
 * Production ingest continues to use implicit `evaluatedAt = now` in extract service.
 */
export type P4hEvaluationMode = 'LIVE_INGEST' | 'HISTORICAL_REPLAY';

export const P4H_HISTORICAL_REPLAY_SEMANTICS_DOC =
  'HISTORICAL_REPLAY sets evaluatedAt to query window end (tripStart+120s). ' +
  'This models whether provider buckets for the fixed crank window were complete when ' +
  'the window closed — not live ingest freshness. Cadence/coverage/duplicate gates still apply.';

export type P4hEvaluationContext = {
  /** Wall-clock processing time for LIVE_INGEST (defaults to Date.now() when omitted). */
  liveIngestAt?: Date;
  queryWindowToUtc: string;
  /**
   * Optional override for HISTORICAL_REPLAY (must be documented in research output).
   * When omitted, uses queryWindowToUtc.
   */
  historicalReplayAtUtc?: string;
};

export function resolveP4hEvaluatedAt(
  mode: P4hEvaluationMode,
  context: P4hEvaluationContext,
): { evaluatedAt: Date; semantics: string } {
  if (mode === 'LIVE_INGEST') {
    const evaluatedAt = context.liveIngestAt ?? new Date();
    return {
      evaluatedAt,
      semantics:
        'LIVE_INGEST: evaluatedAt is actual processing wall-clock; provider_delay measures freshness at ingest.',
    };
  }

  const anchor =
    context.historicalReplayAtUtc ?? context.queryWindowToUtc;
  return {
    evaluatedAt: new Date(anchor),
    semantics: P4H_HISTORICAL_REPLAY_SEMANTICS_DOC,
  };
}
