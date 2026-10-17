import {
 assessObdDtcValue,
 assessProviderTimestamp,
} from './dtc-payload-validation';
import { evaluateDtcSnapshotDecision } from './dtc-snapshot-decision';
import { hashDtcCodesContent } from './dtc-snapshot-meta.util';
import {
 buildWebhookObdDtcProposal,
 type DtcSnapshotProposalBuildResult,
} from './dtc-snapshot-proposal.builder';
import type {
 DtcSnapshotBindingIdentity,
 DtcSnapshotDecision,
 DtcSnapshotStoredHead,
} from './dtc-snapshot.types';

export type Dtc02WebhookCapabilityClass =
 | 'CONFIRMED_COMPLETE'
 | 'PARTIAL'
 | 'STALE'
 | 'DUPLICATE'
 | 'UNKNOWN';

export type Dtc02WebhookProviderCompletenessAttestation =
 | 'none'
 | 'provider_confirmed_snapshot';

export type Dtc02WebhookIngressPlan = {
 classification: Dtc02WebhookCapabilityClass;
 shouldApply: boolean;
 reasons: string[];
 build: DtcSnapshotProposalBuildResult | null;
 previewDecision: DtcSnapshotDecision | null;
};

function providerEvidenceClass(
 value: unknown,
 webhookTimestamp: string | null,
 fetchObservedAt: Date,
 attestation: Dtc02WebhookProviderCompletenessAttestation,
):
 | { kind: 'UNKNOWN'; reasons: string[] }
 | {
 kind: 'PARTIAL' | 'CONFIRMED_COMPLETE';
 codes: string[];
 sourceObservedAt: Date;
 completenessAttestation: Dtc02WebhookProviderCompletenessAttestation;
 reasons: string[];
 } {
 const payload = assessObdDtcValue(value);
 if (
 payload.valueClass === 'MISSING' ||
 payload.valueClass === 'NULL' ||
 payload.valueClass === 'INVALID' ||
 payload.valueClass === 'PARTIAL'
 ) {
 return {
 kind: 'UNKNOWN',
 reasons: [`PAYLOAD_${payload.valueClass}`],
 };
 }

 const ts = assessProviderTimestamp(webhookTimestamp, fetchObservedAt);
 if (ts.class === 'MISSING' || ts.class === 'INVALID' || ts.class === 'FUTURE') {
 return {
 kind: 'UNKNOWN',
 reasons: [`TIMESTAMP_${ts.class}`],
 };
 }

 const sourceObservedAt = ts.class === 'VALID' ? ts.observedAt : new Date(0);
 const hasExplicitComplete =
 attestation === 'provider_confirmed_snapshot' &&
 (payload.valueClass === 'VALID_EMPTY' || payload.valueClass === 'VALID_NONEMPTY');

 if (hasExplicitComplete) {
 return {
 kind: 'CONFIRMED_COMPLETE',
 codes: payload.codes,
 sourceObservedAt,
 completenessAttestation: attestation,
 reasons: ['PROVIDER_CONFIRMED_SNAPSHOT_ATTESTATION'],
 };
 }

 if (payload.valueClass === 'VALID_EMPTY' || payload.valueClass === 'VALID_NONEMPTY') {
 return {
 kind: 'PARTIAL',
 codes: payload.codes,
 sourceObservedAt,
 completenessAttestation: 'none',
 reasons: ['WEBHOOK_UPSERT_ONLY_NO_COMPLETENESS_ATTESTATION'],
 };
 }

 return { kind: 'UNKNOWN', reasons: ['UNCLASSIFIED_PAYLOAD'] };
}

function mapPreviewToCapability(
 providerKind: 'PARTIAL' | 'CONFIRMED_COMPLETE',
 preview: DtcSnapshotDecision,
): Dtc02WebhookCapabilityClass {
 if (preview.outcome === 'NOOP_ALREADY_APPLIED') {
 return 'DUPLICATE';
 }
 if (preview.outcome === 'REJECT_OUT_OF_ORDER_SOURCE') {
 return 'STALE';
 }
 return providerKind;
}

/**
 * Pure ingress plan: provider evidence + stored head preview (01A decision engine).
 * Never treats missing completeness as confirmed-empty snapshot.
 */
export function planDtc02WebhookIngress(input: {
 vehicleId: string;
 organizationId: string | null;
 binding: DtcSnapshotBindingIdentity;
 fetchObservedAt: Date;
 auditRef: string;
 value: unknown;
 webhookTimestamp: string | null;
 head: DtcSnapshotStoredHead;
  activeDtcCodes: ReadonlySet<string>;
 providerCompletenessAttestation?: Dtc02WebhookProviderCompletenessAttestation;
}): Dtc02WebhookIngressPlan {
 const attestation = input.providerCompletenessAttestation ?? 'none';
 const evidence = providerEvidenceClass(
 input.value,
 input.webhookTimestamp,
 input.fetchObservedAt,
 attestation,
 );

 if (evidence.kind === 'UNKNOWN') {
 return {
 classification: 'UNKNOWN',
 shouldApply: false,
 reasons: evidence.reasons,
 build: null,
 previewDecision: null,
 };
 }

 const built = buildWebhookObdDtcProposal({
 vehicleId: input.vehicleId,
 organizationId: input.organizationId,
 binding: input.binding,
 fetchObservedAt: input.fetchObservedAt,
 auditRef: input.auditRef,
 value: input.value,
 webhookTimestamp: input.webhookTimestamp,
 completenessEvidence:
 evidence.kind === 'CONFIRMED_COMPLETE'
 ? 'webhook_provider_confirmed_complete'
 : 'webhook_partial_upsert_only',
 });

 if (!built.ok) {
 return {
 classification: 'UNKNOWN',
 shouldApply: false,
 reasons: [built.reason],
 build: built,
 previewDecision: null,
 };
 }

 const preview = evaluateDtcSnapshotDecision(input.head, built.proposal, {
 activeDtcCodes: input.activeDtcCodes,
 });

 const classification = mapPreviewToCapability(evidence.kind, preview);

 if (classification === 'STALE' || classification === 'DUPLICATE') {
 return {
 classification,
 shouldApply: false,
 reasons: [...evidence.reasons, ...preview.reasons],
 build: built,
 previewDecision: preview,
 };
 }

 if (!preview.apply) {
 return {
 classification: 'UNKNOWN',
 shouldApply: false,
 reasons: [...evidence.reasons, ...preview.reasons],
 build: built,
 previewDecision: preview,
 };
 }

 return {
 classification,
 shouldApply: true,
 reasons: [...evidence.reasons, ...preview.reasons],
 build: built,
 previewDecision: preview,
 };
}

/** Defense-in-depth: partial/unknown ingress must never authorize clears. */
export function enforceDtc02NoFalseClear(
 classification: Dtc02WebhookCapabilityClass,
 decision: DtcSnapshotDecision,
): DtcSnapshotDecision {
 if (classification === 'CONFIRMED_COMPLETE') {
 return decision;
 }
 if (!decision.allowClears) {
 return decision;
 }
 return {
 ...decision,
 allowClears: false,
 reasons: [...decision.reasons, 'DTC02_CLAMP_CLEARS_PARTIAL_OR_UNKNOWN'],
 };
}

export function classifyPollProposalCapability(
 completeness: 'signals_latest_complete' | 'webhook_partial_upsert_only' | 'webhook_provider_confirmed_complete',
): Dtc02WebhookCapabilityClass {
 if (completeness === 'signals_latest_complete' || completeness === 'webhook_provider_confirmed_complete') {
 return 'CONFIRMED_COMPLETE';
 }
 return 'PARTIAL';
}

export function previewHeadConflict(
 head: DtcSnapshotStoredHead,
 sourceMs: number,
 codesHash: string,
 channel: 'partial' | 'complete',
): 'STALE' | 'DUPLICATE' | 'OK' {
 const prevMs =
 channel === 'partial' ? head.lastPartialWebhookSourceAtMs : head.lastConfirmedCompleteSourceAtMs;
 const prevHash =
 channel === 'partial' ? head.lastPartialWebhookCodesHash : head.lastConfirmedCompleteCodesHash;
 if (prevMs != null) {
 if (sourceMs < prevMs) return 'STALE';
 if (sourceMs === prevMs && prevHash === codesHash) return 'DUPLICATE';
 }
 return 'OK';
}

export function hashCodesForPreview(codes: string[]): string {
 return hashDtcCodesContent(codes);
}
