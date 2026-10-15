import {
  assessObdDtcValue,
  assessProviderTimestamp,
} from './dtc-payload-validation';
import { hashDtcCodesContent } from './dtc-snapshot-meta.util';
import type {
  DtcSnapshotBindingIdentity,
  DtcSnapshotCompletenessEvidence,
  DtcSnapshotIngressChannel,
  DtcSnapshotProposal,
} from './dtc-snapshot.types';

export type DtcSnapshotProposalBuildResult =
  | { ok: true; proposal: DtcSnapshotProposal }
  | {
      ok: false;
      reason: string;
      outcome:
        | 'REJECT_MISSING_SIGNAL'
        | 'REJECT_INVALID_TIMESTAMP'
        | 'REJECT_FETCH_WITHOUT_SIGNAL'
        | 'REJECT_INCOMPLETE_WEBHOOK'
        | 'REJECT_PARTIAL_PAYLOAD';
    };

export function buildPollSignalsLatestProposal(input: {
  vehicleId: string;
  organizationId: string | null;
  binding: DtcSnapshotBindingIdentity;
  fetchObservedAt: Date;
  auditRef: string;
  obdDtcListSignal: { timestamp?: unknown; value?: unknown } | null | undefined;
}): DtcSnapshotProposalBuildResult {
  const signal = input.obdDtcListSignal;
  if (!signal) {
    return {
      ok: false,
      reason: 'OBD_DTC_LIST_SIGNAL_ABSENT',
      outcome: 'REJECT_FETCH_WITHOUT_SIGNAL',
    };
  }

  const ts = assessProviderTimestamp(signal.timestamp, input.fetchObservedAt);
  if (ts.class === 'MISSING' || ts.class === 'INVALID' || ts.class === 'FUTURE') {
    return {
      ok: false,
      reason: `OBD_DTC_LIST_TIMESTAMP_${ts.class}`,
      outcome: 'REJECT_INVALID_TIMESTAMP',
    };
  }

  const payload = assessObdDtcValue(signal.value);
  if (payload.valueClass === 'MISSING') {
    return {
      ok: false,
      reason: 'OBD_DTC_LIST_VALUE_UNDEFINED',
      outcome: 'REJECT_MISSING_SIGNAL',
    };
  }
  if (payload.valueClass === 'NULL') {
    return {
      ok: false,
      reason: 'OBD_DTC_LIST_VALUE_NULL',
      outcome: 'REJECT_MISSING_SIGNAL',
    };
  }
  if (payload.valueClass === 'PARTIAL') {
    return {
      ok: false,
      reason: 'OBD_DTC_LIST_ALL_TOKENS_INVALID',
      outcome: 'REJECT_PARTIAL_PAYLOAD',
    };
  }

  const codes = payload.codes;
  const sourceObservedAt = ts.class === 'VALID' ? ts.observedAt : new Date(0);
  return {
    ok: true,
    proposal: assembleProposal({
      vehicleId: input.vehicleId,
      organizationId: input.organizationId,
      channel: 'poll_signals_latest',
      completeness: 'signals_latest_complete',
      binding: input.binding,
      sourceObservedAt,
      codes,
      fetchObservedAt: input.fetchObservedAt,
      auditRef: input.auditRef,
    }),
  };
}

export function buildWebhookObdDtcProposal(input: {
  vehicleId: string;
  organizationId: string | null;
  binding: DtcSnapshotBindingIdentity;
  fetchObservedAt: Date;
  auditRef: string;
  value: unknown;
  webhookTimestamp: string | null;
}): DtcSnapshotProposalBuildResult {
  const payload = assessObdDtcValue(input.value);
  if (payload.valueClass === 'MISSING' || payload.valueClass === 'NULL') {
    return {
      ok: false,
      reason: 'WEBHOOK_VALUE_MISSING',
      outcome: 'REJECT_INCOMPLETE_WEBHOOK',
    };
  }
  if (payload.valueClass === 'PARTIAL') {
    return {
      ok: false,
      reason: 'WEBHOOK_ALL_TOKENS_INVALID',
      outcome: 'REJECT_PARTIAL_PAYLOAD',
    };
  }

  const ts = assessProviderTimestamp(input.webhookTimestamp, input.fetchObservedAt);
  if (ts.class === 'MISSING' || ts.class === 'INVALID' || ts.class === 'FUTURE') {
    return {
      ok: false,
      reason: `WEBHOOK_TIMESTAMP_${ts.class}`,
      outcome: 'REJECT_INVALID_TIMESTAMP',
    };
  }

  const sourceObservedAt = ts.class === 'VALID' ? ts.observedAt : new Date(0);
  return {
    ok: true,
    proposal: assembleProposal({
      vehicleId: input.vehicleId,
      organizationId: input.organizationId,
      channel: 'webhook_obd_dtc_list',
      completeness: 'webhook_partial_upsert_only',
      binding: input.binding,
      sourceObservedAt,
      codes: payload.codes,
      fetchObservedAt: input.fetchObservedAt,
      auditRef: input.auditRef,
    }),
  };
}

function assembleProposal(args: {
  vehicleId: string;
  organizationId: string | null;
  channel: DtcSnapshotIngressChannel;
  completeness: DtcSnapshotCompletenessEvidence;
  binding: DtcSnapshotBindingIdentity;
  sourceObservedAt: Date;
  codes: string[];
  fetchObservedAt: Date;
  auditRef: string;
}): DtcSnapshotProposal {
  return {
    vehicleId: args.vehicleId,
    organizationId: args.organizationId,
    channel: args.channel,
    completeness: args.completeness,
    binding: args.binding,
    sourceObservedAt: args.sourceObservedAt,
    codes: args.codes,
    codesContentHash: hashDtcCodesContent(args.codes),
    fetchObservedAt: args.fetchObservedAt,
    auditRef: args.auditRef,
  };
}
