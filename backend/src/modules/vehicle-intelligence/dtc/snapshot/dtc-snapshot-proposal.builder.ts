import { normalizeDtcCodes } from '../dtc-code-normalizer.util';
import {
  hashDtcCodesContent,
  parseProviderObservedAt,
} from './dtc-snapshot-meta.util';
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
        | 'REJECT_INCOMPLETE_WEBHOOK';
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
  const sourceObservedAt = parseProviderObservedAt(signal.timestamp);
  if (!sourceObservedAt) {
    return {
      ok: false,
      reason: 'OBD_DTC_LIST_TIMESTAMP_INVALID_OR_MISSING',
      outcome: 'REJECT_INVALID_TIMESTAMP',
    };
  }
  if (signal.value === undefined) {
    return {
      ok: false,
      reason: 'OBD_DTC_LIST_VALUE_UNDEFINED',
      outcome: 'REJECT_MISSING_SIGNAL',
    };
  }
  const codes = normalizeDtcCodes(signal.value);
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
  if (input.value === undefined || input.value === null) {
    return {
      ok: false,
      reason: 'WEBHOOK_VALUE_MISSING',
      outcome: 'REJECT_INCOMPLETE_WEBHOOK',
    };
  }
  const sourceObservedAt = parseProviderObservedAt(input.webhookTimestamp);
  if (!sourceObservedAt) {
    return {
      ok: false,
      reason: 'WEBHOOK_TIMESTAMP_INVALID_OR_MISSING',
      outcome: 'REJECT_INVALID_TIMESTAMP',
    };
  }
  const codes = normalizeDtcCodes(input.value);
  return {
    ok: true,
    proposal: assembleProposal({
      vehicleId: input.vehicleId,
      organizationId: input.organizationId,
      channel: 'webhook_obd_dtc_list',
      completeness: 'webhook_partial_upsert_only',
      binding: input.binding,
      sourceObservedAt,
      codes,
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
