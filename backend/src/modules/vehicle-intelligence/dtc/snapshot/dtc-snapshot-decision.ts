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

function bindingRotation(
  head: DtcSnapshotStoredHead,
  proposal: DtcSnapshotProposal,
): 'same' | 'rebaseline' | 'reject' {
  const storedBinding = head.lastAcceptedBindingId;
  const incoming = proposal.binding.providerBindingId;
  if (!storedBinding || storedBinding === incoming) {
    return 'same';
  }
  if (
    head.dimoTokenId != null &&
    head.dimoTokenId !== proposal.binding.dimoTokenId
  ) {
    return 'reject';
  }
  return 'rebaseline';
}

/**
 * Pure fail-closed decision for a single DTC snapshot proposal vs stored head.
 */
export function evaluateDtcSnapshotDecision(
  head: DtcSnapshotStoredHead,
  proposal: DtcSnapshotProposal,
): DtcSnapshotDecision {
  const rotation = bindingRotation(head, proposal);
  if (rotation === 'reject') {
    return reject('REJECT_BINDING_MISMATCH', [
      'BINDING_ID_MISMATCH',
      `stored=${head.lastAcceptedBindingId}`,
      `incoming=${proposal.binding.providerBindingId}`,
      `stored_token=${head.dimoTokenId}`,
      `incoming_token=${proposal.binding.dimoTokenId}`,
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
        `epoch=${head.bindingEpoch}`,
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

  const isWebhookPartial = proposal.completeness === 'webhook_partial_upsert_only';
  const isComplete = proposal.completeness === 'signals_latest_complete';

  if (rotation === 'rebaseline') {
    if (isWebhookPartial) {
      return {
        outcome: 'APPLY_BINDING_REBASELINE',
        apply: true,
        allowClears: false,
        allowUpserts: true,
        reasons: [
          'BINDING_ROTATION_REBASELINE',
          'WEBHOOK_UPSERT_ONLY_NO_CLEAR',
          `epoch_next=${head.bindingEpoch + 1}`,
        ],
      };
    }
    return {
      outcome: 'APPLY_BINDING_REBASELINE',
      apply: true,
      allowClears: isComplete,
      allowUpserts: true,
      reasons: [
        'BINDING_ROTATION_REBASELINE',
        'SIGNALS_LATEST_COMPLETE_SNAPSHOT',
        `epoch_next=${head.bindingEpoch + 1}`,
      ],
    };
  }

  if (isWebhookPartial) {
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
