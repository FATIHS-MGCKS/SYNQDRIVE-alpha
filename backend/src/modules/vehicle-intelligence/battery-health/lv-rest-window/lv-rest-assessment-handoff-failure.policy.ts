import type { LvRestAssessmentHandoffMetadata } from './lv-rest-assessment-handoff.metadata';
import {
  LV_REST_ASSESSMENT_HANDOFF_OUTCOME,
  LV_REST_ASSESSMENT_HANDOFF_STATUS,
} from './lv-rest-assessment-handoff.metadata';

/**
 * Narrow automatic rearm eligibility for repaired legacy assess persistence 54000.
 * Requires durable FAILED handoff metadata — not merely absent DLQ.
 */
export function isLegacyPersistence54000HandoffFailure(
  handoff: Pick<
    LvRestAssessmentHandoffMetadata,
    'status' | 'outcome' | 'failureHistory'
  > | null | undefined,
): boolean {
  if (!handoff || handoff.status !== LV_REST_ASSESSMENT_HANDOFF_STATUS.FAILED) {
    return false;
  }
  if (handoff.outcome !== LV_REST_ASSESSMENT_HANDOFF_OUTCOME.PERSISTENCE_FAILED) {
    return false;
  }
  const history = handoff.failureHistory;
  if (!history || history.errorCode !== 'HANDLER_FAILED') {
    return false;
  }
  const message = (history.errorMessage ?? '').toLowerCase();
  return (
    message.includes('54000') ||
    message.includes('index row size') ||
    message.includes('program_limit_exceeded')
  );
}
