import type {
  DtcSnapshotDecision,
  DtcSnapshotProposal,
  DtcSnapshotStoredHead,
} from './dtc-snapshot.types';

function reject(
  outcome: DtcSnapshotDecision['outcome'],
  reasons: string[],
): DtcSnapshotDecision {
  return {
    outcome,
    apply: false,
    allowClears: false,
    allowUpserts: false,
    reasons,
  };
}

/**
 * Pure fail-closed decision for a single DTC snapshot proposal vs stored head.
 */
export function evaluateDtcSnapshotDecision(
  head: DtcSnapshotStoredHead,
  proposal: DtcSnapshotProposal,
): DtcSnapshotDecision {
  if (head.lastAcceptedBindingId && head.lastAcceptedBindingId !== proposal.binding.providerBindingId) {
    return reject('REJECT_BINDING_MISMATCH', [
      'BINDING_ID_MISMATCH',
      `stored=${head.lastAcceptedBindingId}`,
      `incoming=${proposal.binding.providerBindingId}`,
    ]);
  }

  const sourceMs = proposal.sourceObservedAt.getTime();
  const prevMs = head.lastAcceptedSourceAtMs;

  if (prevMs != null) {
    if (sourceMs < prevMs) {
      return reject('REJECT_OUT_OF_ORDER_SOURCE', [
        'SOURCE_OBSERVED_AT_REGRESSED',
        `incoming=${sourceMs}`,
        `stored=${prevMs}`,
      ]);
    }
    if (sourceMs === prevMs) {
      if (head.lastAcceptedCodesHash === proposal.codesContentHash) {
        return {
          outcome: 'NOOP_ALREADY_APPLIED',
          apply: false,
          allowClears: false,
          allowUpserts: false,
          reasons: ['IDENTICAL_SOURCE_HEAD'],
        };
      }
      return reject('REJECT_EQUAL_TIMESTAMP_CONFLICT', [
        'SAME_SOURCE_TIMESTAMP_DIFFERENT_CONTENT',
        `hash_incoming=${proposal.codesContentHash}`,
        `hash_stored=${head.lastAcceptedCodesHash ?? 'null'}`,
      ]);
    }
  }

  if (proposal.completeness === 'webhook_partial_upsert_only') {
    return {
      outcome: 'APPLY_WEBHOOK_PARTIAL',
      apply: true,
      allowClears: false,
      allowUpserts: true,
      reasons: ['WEBHOOK_UPSERT_ONLY_NO_CLEAR'],
    };
  }

  return {
    outcome: 'APPLY_CONFIRMED_SNAPSHOT',
    apply: true,
    allowClears: true,
    allowUpserts: true,
    reasons: ['SIGNALS_LATEST_COMPLETE_SNAPSHOT'],
  };
}
