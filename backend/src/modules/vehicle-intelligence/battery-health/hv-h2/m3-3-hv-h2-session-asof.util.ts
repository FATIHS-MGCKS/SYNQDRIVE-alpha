import type { HvChargeSession } from '@prisma/client';

export interface HvH2SessionAsOfEvaluation {
  /** Session had not started yet at evaluationAt. */
  notStartedAtEvaluationAt: boolean;
  /** Session was still open (no end or end after evaluationAt). */
  ongoingAtEvaluationAt: boolean;
  /**
   * Current row metadata cannot be treated as knowable at evaluationAt
   * (e.g. updatedAt after evaluationAt without durable session version history).
   */
  sessionStateKnowableAtEvaluationAt: boolean;
}

export function evaluateHvChargeSessionAsOf(
  session: Pick<HvChargeSession, 'startAt' | 'endAt' | 'updatedAt'>,
  evaluationAt: Date,
): HvH2SessionAsOfEvaluation {
  const evalMs = evaluationAt.getTime();
  const notStartedAtEvaluationAt = session.startAt.getTime() > evalMs;
  const ongoingAtEvaluationAt =
    session.endAt == null || session.endAt.getTime() > evalMs;
  const sessionStateKnowableAtEvaluationAt = session.updatedAt.getTime() <= evalMs;
  return {
    notStartedAtEvaluationAt,
    ongoingAtEvaluationAt,
    sessionStateKnowableAtEvaluationAt,
  };
}
