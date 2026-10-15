import type {
  DtcSnapshotDecision,
  DtcSnapshotProposal,
  DtcSnapshotStoredHead,
} from './dtc-snapshot.types';

export interface DtcSnapshotDecisionContext {
  /** Active DTC codes before apply (DB truth). */
  activeDtcCodes: ReadonlySet<string>;
}

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
    prevHash: head.lastConfirmedCompleteCodesHash,
  };
}

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) {
    if (!b.has(x)) return false;
  }
  return true;
}

function proposalCodeSet(proposal: DtcSnapshotProposal): Set<string> {
  return new Set(proposal.codes);
}

/** True when DB episodes differ from proposal or a newer partial still blocks confirmed reconciliation. */
export function needsEpisodeReconciliation(
  head: DtcSnapshotStoredHead,
  proposal: DtcSnapshotProposal,
  activeDtcCodes: ReadonlySet<string>,
): boolean {
  const proposed = proposalCodeSet(proposal);
  if (!setsEqual(activeDtcCodes, proposed)) {
    return true;
  }
  if (
    proposal.completeness === 'signals_latest_complete' &&
    head.lastPartialWebhookSourceAtMs != null &&
    head.lastConfirmedCompleteSourceAtMs != null &&
    head.lastPartialWebhookSourceAtMs > head.lastConfirmedCompleteSourceAtMs &&
    activeDtcCodes.size > 0 &&
    proposed.size === 0
  ) {
    return true;
  }
  return false;
}

/**
 * Pure fail-closed decision for a single DTC snapshot proposal vs stored head.
 */
export function evaluateDtcSnapshotDecision(
  head: DtcSnapshotStoredHead,
  proposal: DtcSnapshotProposal,
  context: DtcSnapshotDecisionContext = { activeDtcCodes: new Set() },
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
  const activeDtcCodes = context.activeDtcCodes;

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
      if (prevHash === proposal.codesContentHash) {
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
        `hash_stored=${prevHash ?? 'null'}`,
      ]);
    }

    if (prevHash === proposal.codesContentHash) {
      if (!needsEpisodeReconciliation(head, proposal, activeDtcCodes)) {
        return {
          outcome: 'REFRESH_SOURCE_WATERMARK',
          apply: true,
          allowClears: false,
          allowUpserts: false,
          reasons: ['NEWER_TIMESTAMP_SAME_CODESET'],
        };
      }
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
