export type DtcSnapshotIngressChannel = 'poll_signals_latest' | 'webhook_obd_dtc_list';

/**
 * Poll: DIMO `signalsLatest.obdDTCList` is treated as a complete latest snapshot when
 * the signal object is present with a valid provider timestamp and parseable value
 * (including an explicit empty list).
 *
 * Webhook: trigger payloads are NOT assumed complete — upsert-only; never clear absent codes.
 */
export type DtcSnapshotCompletenessEvidence =
  | 'signals_latest_complete'
  | 'webhook_partial_upsert_only';

export type DtcSnapshotDecisionOutcome =
  | 'APPLY_CONFIRMED_SNAPSHOT'
  | 'APPLY_CONFIRMED_SNAPSHOT_DEFER_CLEARS'
  | 'APPLY_WEBHOOK_PARTIAL'
  | 'APPLY_BINDING_REBASELINE'
  | 'NOOP_ALREADY_APPLIED'
  | 'REJECT_INELIGIBLE_VEHICLE'
  | 'REJECT_BINDING_MISMATCH'
  | 'REJECT_MISSING_SIGNAL'
  | 'REJECT_INVALID_TIMESTAMP'
  | 'REJECT_INCOMPLETE_WEBHOOK'
  | 'REJECT_PARTIAL_PAYLOAD'
  | 'REJECT_OUT_OF_ORDER_SOURCE'
  | 'REJECT_EQUAL_TIMESTAMP_CONFLICT'
  | 'REJECT_FETCH_WITHOUT_SIGNAL'
  | 'REJECT_PROVIDER_AUTH'
  | 'REJECT_BINDING_VERIFICATION';

export interface DtcSnapshotBindingIdentity {
  provider: 'DIMO';
  providerBindingId: string;
  dimoTokenId: number;
}

export interface DtcSnapshotProposal {
  vehicleId: string;
  organizationId: string | null;
  channel: DtcSnapshotIngressChannel;
  completeness: DtcSnapshotCompletenessEvidence;
  binding: DtcSnapshotBindingIdentity;
  /** Provider-observed time for obdDTCList — never wall-clock substituted. */
  sourceObservedAt: Date;
  codes: string[];
  codesContentHash: string;
  fetchObservedAt: Date;
  auditRef: string;
}

export interface DtcSnapshotStoredHead {
  lastAcceptedSourceAtMs: number | null;
  lastAcceptedCodesHash: string | null;
  lastAcceptedBindingId: string | null;
  bindingEpoch: number;
  dimoTokenId: number | null;
  lastConfirmedCompleteSourceAtMs: number | null;
  lastPartialWebhookSourceAtMs: number | null;
  lastPartialWebhookCodesHash: string | null;
}

export interface DtcSnapshotDecision {
  outcome: DtcSnapshotDecisionOutcome;
  apply: boolean;
  /** When true, downstream may clear codes not present in proposal (poll complete snapshot only). */
  allowClears: boolean;
  allowUpserts: boolean;
  reasons: string[];
}

export type DtcFaultConfirmation = 'confirmed' | 'last_known_unconfirmed';
