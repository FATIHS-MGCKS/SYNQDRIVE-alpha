import {
 enforceDtc02NoFalseClear,
 planDtc02WebhookIngress,
} from './dtc-02-webhook-capability';
import { hashDtcCodesContent } from './dtc-snapshot-meta.util';
import type { DtcSnapshotStoredHead } from './dtc-snapshot.types';

const binding = {
 provider: 'DIMO' as const,
 providerBindingId: 'link-1',
 dimoTokenId: 1,
};

const emptyHead: DtcSnapshotStoredHead = {
 lastAcceptedSourceAtMs: null,
 lastConfirmedCompleteCodesHash: null,
 lastAcceptedBindingId: null,
 bindingEpoch: 0,
 dimoTokenId: null,
 lastConfirmedCompleteSourceAtMs: null,
 lastPartialWebhookSourceAtMs: null,
 lastPartialWebhookCodesHash: null,
};

describe('planDtc02WebhookIngress', () => {
 const base = {
 vehicleId: 'v1',
 organizationId: 'org',
 binding,
 fetchObservedAt: new Date('2026-10-15T12:00:00Z'),
 auditRef: 'test',
 head: emptyHead,
    activeDtcCodes: new Set<string>(),
 };

 it('classifies missing value as UNKNOWN without apply', () => {
 const plan = planDtc02WebhookIngress({
 ...base,
 value: undefined,
 webhookTimestamp: '2026-10-15T11:00:00Z',
 });
 expect(plan.classification).toBe('UNKNOWN');
 expect(plan.shouldApply).toBe(false);
 });

 it('classifies valid webhook as PARTIAL (never inferred complete empty)', () => {
 const plan = planDtc02WebhookIngress({
 ...base,
 value: [],
 webhookTimestamp: '2026-10-15T11:00:00Z',
 });
 expect(plan.classification).toBe('PARTIAL');
 expect(plan.shouldApply).toBe(true);
 expect(plan.previewDecision?.allowClears).toBe(false);
 });

 it('classifies stale webhook against partial head', () => {
 const head: DtcSnapshotStoredHead = {
 ...emptyHead,
 lastPartialWebhookSourceAtMs: 2_000,
 lastPartialWebhookCodesHash: hashDtcCodesContent(['P0420']),
 lastAcceptedBindingId: 'link-1',
 bindingEpoch: 1,
 dimoTokenId: 1,
 };
 const plan = planDtc02WebhookIngress({
 ...base,
 head,
 value: 'P0301',
 webhookTimestamp: new Date(1_000).toISOString(),
 });
 expect(plan.classification).toBe('STALE');
 expect(plan.shouldApply).toBe(false);
 });

 it('classifies duplicate webhook', () => {
 const hash = hashDtcCodesContent(['P0301']);
 const head: DtcSnapshotStoredHead = {
 ...emptyHead,
 lastPartialWebhookSourceAtMs: 1_000,
 lastPartialWebhookCodesHash: hash,
 lastAcceptedBindingId: 'link-1',
 bindingEpoch: 1,
 dimoTokenId: 1,
 };
 const plan = planDtc02WebhookIngress({
 ...base,
 head,
 value: 'P0301',
 webhookTimestamp: new Date(1_000).toISOString(),
 });
 expect(plan.classification).toBe('DUPLICATE');
 expect(plan.shouldApply).toBe(false);
 });

 it('CONFIRMED_COMPLETE only with explicit attestation', () => {
 const plan = planDtc02WebhookIngress({
 ...base,
 value: [],
 webhookTimestamp: '2026-10-15T11:00:00Z',
 providerCompletenessAttestation: 'provider_confirmed_snapshot',
 });
 expect(plan.classification).toBe('CONFIRMED_COMPLETE');
 expect(plan.previewDecision?.allowClears).toBe(true);
 });
});

describe('enforceDtc02NoFalseClear', () => {
 it('clamps clears for PARTIAL classification', () => {
 const decision = {
 outcome: 'APPLY_WEBHOOK_PARTIAL' as const,
 apply: true,
 allowClears: true,
 allowUpserts: true,
 reasons: [],
 };
 const clamped = enforceDtc02NoFalseClear('PARTIAL', decision);
 expect(clamped.allowClears).toBe(false);
 });
});
