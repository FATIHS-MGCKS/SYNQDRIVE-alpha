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

function channelWatermark(
  head: DtcSnapshotStoredHead,
  proposal: DtcSnapshotProposal,
): { prevMs: number | null; prevHash: string | null } {
  if (proposal.completeness === 'webhook_partial_upsert_only') {
    return {
      prevMs: head.lastPartialWebhookSourceAtMs,
      prevHash: head.lastPartialWebhookCodesHash,
    };
  }
  return {
    prevMs: head.lastConfirmedCompleteSourceAtMs,
    prevHash:
      head.lastConfirmedCompleteSourceAtMs != null ? head.lastAcceptedCodesHash : null,
  };
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
  const { prevMs, prevHash } = channelWatermark(head, proposal);

  if (prevMs != null) {
    if (sourceMs < prevMs) {
      return reject('REJECT_OUT_OF_ORDER_SOURCE', [
        'SOURCE_OBSERVED_AT_REGRESSED',
        `channel=${proposal.completeness}`,
        `incoming=${sourceMs}`,
        `stored=${prevMs}`,
        `epoch=${head.bindingEpoch}`,
      ]);
    }
    if (sourceMs === prevMs) {
      const hashForChannel =
        proposal.completeness === 'webhook_partial_upsert_only'
          ? prevHash
          : prevHash ?? head.lastAcceptedCodesHash;
      if (hashForChannel === proposal.codesContentHash) {
        return {
          outcome: 'NOOP_ALREADY_APPLIED',
          apply: false,
          allowClears: false,
          allowUpserts: false,
          reasons: ['IDENTICAL_CHANNEL_HEAD'],
        };
      }
      return reject('REJECT_EQUAL_TIMESTAMP_CONFLICT', [
        'SAME_SOURCE_TIMESTAMP_DIFFERENT_CONTENT',
        `channel=${proposal.completeness}`,
        `hash_incoming=${proposal.codesContentHash}`,
        `hash_stored=${hashForChannel ?? 'null'}`,
      ]);
    }

    const hashForChannel =
      proposal.completeness === 'webhook_partial_upsert_only'
        ? prevHash
        : prevHash ?? head.lastAcceptedCodesHash;
    if (hashForChannel === proposal.codesContentHash) {
      return {
        outcome: 'REFRESH_SOURCE_WATERMARK',
        apply: true,
        allowClears: false,
        allowUpserts: false,
        reasons: ['NEWER_TIMESTAMP_SAME_CODESET'],
      };
    }
  }

  const isWebhookPartial = proposal.completeness === 'webhook_partial_upsert_only';
  const isComplete = proposal.completeness === 'signals_latest_complete';

  let allowClears = isComplete;
  let outcome: DtcSnapshotDecision['outcome'] = isComplete
    ? 'APPLY_CONFIRMED_SNAPSHOT'
    : 'APPLY_WEBHOOK_PARTIAL';
  const reasons: string[] = isComplete
    ? ['SIGNALS_LATEST_COMPLETE_SNAPSHOT']
    : ['WEBHOOK_UPSERT_ONLY_NO_CLEAR'];

  if (
    isComplete &&
    head.lastPartialWebhookSourceAtMs != null &&
    sourceMs < head.lastPartialWebhookSourceAtMs
  ) {
    allowClears = false;
    outcome = 'APPLY_CONFIRMED_SNAPSHOT_DEFER_CLEARS';
    reasons.push('DEFER_CLEARS_NEWER_PARTIAL_WEBHOOK');
  }

  if (rotation === 'rebaseline') {
    outcome = 'APPLY_BINDING_REBASELINE';
    reasons.unshift('BINDING_ROTATION_REBASELINE', `epoch_next=${head.bindingEpoch + 1}`);
    if (isWebhookPartial) {
      allowClears = false;
    }
  }

  return {
    outcome,
    apply: true,
    allowClears,
    allowUpserts: true,
    reasons,
  };
}
