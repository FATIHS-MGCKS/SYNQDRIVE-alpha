import { ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME } from '../../energy-events/erd-recharge-projection/erd-canonical-recharge-projector.types';

const ENQUEUE_OUTCOMES = new Set<string>([
  ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.CREATED,
  ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.RECONCILED,
  ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.HANDOFF_COMPLETED,
  ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.NO_OP,
]);

export function shouldAttemptChargingEnrichmentEnqueueAfterProjection(
  projectorOutcome: string,
): boolean {
  return ENQUEUE_OUTCOMES.has(projectorOutcome);
}
