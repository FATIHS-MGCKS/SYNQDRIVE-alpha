import type {
  CurrentPhysicalStateProjection,
  PhysicalStateBindingScope,
} from './device-connection-physical-state.types';
import type {
  PhysicalStatePreseedCandidate,
  PhysicalStatePreseedDecision,
  PhysicalStatePreseedPlan,
  PhysicalStatePreseedScope,
  PhysicalStatePreseedWriteIntent,
} from './physical-state-preseed.types';

const ZERO_WRITE_INTENT: PhysicalStatePreseedWriteIntent = {
  projection: false,
  transition: false,
  outbox: false,
  episode: false,
  alert: false,
  authorityMode: false,
  eventHistory: false,
};

const ESTABLISH_WRITE_INTENT: PhysicalStatePreseedWriteIntent = {
  projection: true,
  transition: true,
  outbox: false,
  episode: false,
  alert: false,
  authorityMode: false,
  eventHistory: false,
};

function basePlan(input: {
  scope: PhysicalStatePreseedScope;
  binding: PhysicalStateBindingScope;
  existingProjection: CurrentPhysicalStateProjection | null;
  candidates: PhysicalStatePreseedCandidate[];
}): Omit<
  PhysicalStatePreseedPlan,
  'selectedCandidate' | 'decision' | 'reason' | 'wouldWrite' | 'expectedReconcileDecision'
> {
  return {
    scope: input.scope,
    binding: input.binding,
    existingProjection: input.existingProjection,
    candidates: input.candidates,
    evidenceObservedAt: null,
    bindingKey: input.binding.bindingKey,
    evidenceReferenceId: null,
  };
}

/**
 * Select semantic winner by greatest evidenceObservedAt only.
 * Source type never overrides time. Equal-time same state: lexicographic reference tie-break.
 * Equal-time opposing state: fail closed.
 */
export function selectPreseedWinner(
  candidates: PhysicalStatePreseedCandidate[],
): { winner: PhysicalStatePreseedCandidate | null; ambiguous: boolean } {
  if (candidates.length === 0) {
    return { winner: null, ambiguous: false };
  }

  const maxMs = Math.max(...candidates.map((c) => c.evidenceObservedAt.getTime()));
  const atMax = candidates.filter((c) => c.evidenceObservedAt.getTime() === maxMs);
  const states = new Set(atMax.map((c) => c.candidateState));

  if (states.size > 1) {
    return { winner: null, ambiguous: true };
  }

  const sorted = [...atMax].sort((a, b) =>
    a.evidenceReferenceId.localeCompare(b.evidenceReferenceId),
  );
  return { winner: sorted[0] ?? null, ambiguous: false };
}

export function planPhysicalStatePreseed(input: {
  scope: PhysicalStatePreseedScope;
  binding: PhysicalStateBindingScope;
  existingProjection: CurrentPhysicalStateProjection | null;
  candidates: PhysicalStatePreseedCandidate[];
}): PhysicalStatePreseedPlan {
  const base = basePlan(input);

  if (input.existingProjection) {
    return {
      ...base,
      selectedCandidate: null,
      decision: 'SKIP_EXISTING_PROJECTION',
      reason: 'projection_already_exists',
      wouldWrite: ZERO_WRITE_INTENT,
      expectedReconcileDecision: null,
    };
  }

  const admissible = input.candidates.filter(
    (candidate) => candidate.bindingKey === input.binding.bindingKey,
  );

  if (admissible.length === 0) {
    return {
      ...base,
      selectedCandidate: null,
      decision: 'INSUFFICIENT_EVIDENCE',
      reason: 'no_admissible_candidates_for_binding',
      wouldWrite: ZERO_WRITE_INTENT,
      expectedReconcileDecision: null,
    };
  }

  const { winner, ambiguous } = selectPreseedWinner(admissible);

  if (ambiguous) {
    return {
      ...base,
      selectedCandidate: null,
      decision: 'AMBIGUOUS_EQUAL_TIME_CONFLICT',
      reason: 'equal_timestamp_opposing_state',
      wouldWrite: ZERO_WRITE_INTENT,
      expectedReconcileDecision: null,
    };
  }

  if (!winner) {
    return {
      ...base,
      selectedCandidate: null,
      decision: 'INSUFFICIENT_EVIDENCE',
      reason: 'no_winner_selected',
      wouldWrite: ZERO_WRITE_INTENT,
      expectedReconcileDecision: null,
    };
  }

  return {
    ...base,
    selectedCandidate: winner,
    decision: 'WOULD_ESTABLISH',
    reason: 'missing_projection_latest_evidence_wins',
    wouldWrite: ESTABLISH_WRITE_INTENT,
    expectedReconcileDecision: 'ESTABLISHED',
    evidenceObservedAt: winner.evidenceObservedAt.toISOString(),
    evidenceReferenceId: winner.evidenceReferenceId,
  };
}

export function mapPreseedDecisionAfterApply(input: {
  plan: PhysicalStatePreseedPlan;
  reconcileDecision: string;
  projectionExists: boolean;
}): PhysicalStatePreseedDecision {
  if (input.plan.decision === 'SKIP_EXISTING_PROJECTION') {
    return 'SKIP_EXISTING_PROJECTION';
  }

  if (input.reconcileDecision === 'ESTABLISHED') {
    return 'ESTABLISHED';
  }

  if (input.reconcileDecision === 'DUPLICATE' && input.projectionExists) {
    return 'SKIPPED_ALREADY_ESTABLISHED';
  }

  return 'UNEXPECTED_RECONCILE_DECISION';
}
