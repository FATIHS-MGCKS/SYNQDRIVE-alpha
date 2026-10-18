/**
 * Read-only classification of DTC source-trust surface consistency (P4 certification).
 * Does not repair or mutate production data.
 */

export type Dtc02SourceTrustSurfaceInput = {
  hasSourceHead: boolean;
  headLastPollFetchAtMs: number | null;
  vlsLastDtcPollAtMs: number | null;
  vlsLastSuccessfulCheckAtMs: number | null;
  lastConfirmedCompleteSourceAtMs: number | null;
  lastPartialWebhookSourceAtMs: number | null;
  activeDtcCodes: ReadonlySet<string>;
  vlsObdDtcList: string[] | null;
  outboxPendingCount: number;
  evaluatedAtMs: number;
  operationalStaleMs: number;
};

export type Dtc02SourceTrustDivergenceClass =
  | 'ALIGNED'
  | 'HEAD_POLL_AHEAD_OF_VLS'
  | 'VLS_POLL_AHEAD_OF_HEAD'
  | 'MISSING_SOURCE_HEAD'
  | 'OUTBOX_BACKLOG'
  | 'PARTIAL_AFTER_COMPLETE'
  | 'OPERATIONAL_LIST_DIVERGENCE'
  | 'STALE_SUCCESS_TIMESTAMP';

export type Dtc02SourceTrustReconciliationAssessment = {
  divergences: Dtc02SourceTrustDivergenceClass[];
  /** Fail-closed: adaptive/defer actions must not proceed when true. */
  blocksFutureDeferral: boolean;
  reasons: string[];
};

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export function assessDtc02SourceTrustSurface(
  input: Dtc02SourceTrustSurfaceInput,
): Dtc02SourceTrustReconciliationAssessment {
  const divergences: Dtc02SourceTrustDivergenceClass[] = [];
  const reasons: string[] = [];

  if (!input.hasSourceHead) {
    divergences.push('MISSING_SOURCE_HEAD');
    reasons.push('NO_VEHICLE_DTC_SOURCE_HEAD');
  }

  if (
    input.headLastPollFetchAtMs != null &&
    input.vlsLastDtcPollAtMs != null &&
    input.headLastPollFetchAtMs !== input.vlsLastDtcPollAtMs
  ) {
    if (input.headLastPollFetchAtMs > input.vlsLastDtcPollAtMs) {
      divergences.push('HEAD_POLL_AHEAD_OF_VLS');
      reasons.push('HEAD_LAST_POLL_FETCH_GT_VLS');
    } else {
      divergences.push('VLS_POLL_AHEAD_OF_HEAD');
      reasons.push('VLS_LAST_DTC_POLL_GT_HEAD');
    }
  }

  if (input.outboxPendingCount > 0) {
    divergences.push('OUTBOX_BACKLOG');
    reasons.push('PENDING_SNAPSHOT_OUTBOX');
  }

  if (
    input.lastPartialWebhookSourceAtMs != null &&
    input.lastConfirmedCompleteSourceAtMs != null &&
    input.lastPartialWebhookSourceAtMs > input.lastConfirmedCompleteSourceAtMs
  ) {
    divergences.push('PARTIAL_AFTER_COMPLETE');
    reasons.push('PARTIAL_WEBHOOK_NEWER_THAN_COMPLETE');
  }

  if (input.vlsLastSuccessfulCheckAtMs != null) {
    const age = input.evaluatedAtMs - input.vlsLastSuccessfulCheckAtMs;
    if (age > input.operationalStaleMs) {
      divergences.push('STALE_SUCCESS_TIMESTAMP');
      reasons.push('LAST_SUCCESSFUL_CHECK_STALE');
    }
  }

  const vlsSet = new Set((input.vlsObdDtcList ?? []).map((c) => c.trim()).filter(Boolean));
  if (!setsEqual(input.activeDtcCodes, vlsSet) && input.hasSourceHead) {
    divergences.push('OPERATIONAL_LIST_DIVERGENCE');
    reasons.push('ACTIVE_EPISODES_NE_VLS_OBD_LIST');
  }

  if (divergences.length === 0) {
    return {
      divergences: ['ALIGNED'],
      blocksFutureDeferral: false,
      reasons: [],
    };
  }

  return {
    divergences,
    blocksFutureDeferral: true,
    reasons,
  };
}
