/**
 * P4 fallback / safety certification matrix (pure, no provider I/O).
 */
import { planDtc02AdaptivePollCheck } from '../adaptive/dtc-02-adaptive-planner';
import type { Dtc02AdaptivePlannerInput } from '../adaptive/dtc-02-adaptive-planner.types';
import { planDtc02WebhookIngress } from '../snapshot/dtc-02-webhook-capability';
import { evaluateDtcSnapshotDecision } from '../snapshot/dtc-snapshot-decision';
import { buildPollSignalsLatestProposal, buildWebhookObdDtcProposal } from '../snapshot/dtc-snapshot-proposal.builder';
import { hashDtcCodesContent } from '../snapshot/dtc-snapshot-meta.util';
import type { DtcSnapshotStoredHead } from '../snapshot/dtc-snapshot.types';

const T0 = Date.parse('2026-10-15T12:00:00Z');
const binding = { provider: 'DIMO' as const, providerBindingId: 'link-1', dimoTokenId: 1 };

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

function plannerBase(overrides: Partial<Dtc02AdaptivePlannerInput> = {}): Dtc02AdaptivePlannerInput {
  return {
    registryLifecycle: 'ACTIVE',
    providerCapability: 'dimo_linked',
    lastSuccessfulDtcCheckAtMs: T0 - 60 * 60_000,
    lastPollFetchAtMs: T0 - 30 * 60_000,
    lastConfirmedCompleteSourceAtMs: T0 - 45 * 60_000,
    lastPartialWebhookSourceAtMs: null,
    webhookEvidenceQuality: 'complete',
    hasActiveDtc: false,
    providerErrorState: 'none',
    evaluatedAtMs: T0,
    ...overrides,
  };
}

describe('DTC-02 P4 safety certification matrix', () => {
  describe('adaptive shadow planner (no enqueue side effects)', () => {
    const cases: Array<{
      name: string;
      input: Partial<Dtc02AdaptivePlannerInput>;
      expectLegacyPreserved: boolean;
      expectNoDeferBeyondLegacy: boolean;
    }> = [
      {
        name: 'missing provider capability',
        input: { providerCapability: 'unknown' },
        expectLegacyPreserved: true,
        expectNoDeferBeyondLegacy: true,
      },
      {
        name: 'missing successful DTC check',
        input: { lastSuccessfulDtcCheckAtMs: null },
        expectLegacyPreserved: true,
        expectNoDeferBeyondLegacy: true,
      },
      {
        name: 'stale success',
        input: { lastSuccessfulDtcCheckAtMs: T0 - 8 * 60 * 60_000, webhookEvidenceQuality: 'stale' },
        expectLegacyPreserved: true,
        expectNoDeferBeyondLegacy: true,
      },
      {
        name: 'partial webhook evidence',
        input: { webhookEvidenceQuality: 'partial' },
        expectLegacyPreserved: true,
        expectNoDeferBeyondLegacy: true,
      },
      {
        name: 'provider 403',
        input: { providerErrorState: 'auth_denied' },
        expectLegacyPreserved: true,
        expectNoDeferBeyondLegacy: true,
      },
      {
        name: 'provider timeout',
        input: { providerErrorState: 'transient' },
        expectLegacyPreserved: true,
        expectNoDeferBeyondLegacy: true,
      },
      {
        name: 'offboarded vehicle',
        input: { registryLifecycle: 'OFFBOARDED' },
        expectLegacyPreserved: true,
        expectNoDeferBeyondLegacy: true,
      },
      {
        name: 'active DTC accelerates within legacy bound',
        input: { hasActiveDtc: true },
        expectLegacyPreserved: true,
        expectNoDeferBeyondLegacy: true,
      },
    ];

    it.each(cases)('$name', ({ input, expectLegacyPreserved, expectNoDeferBeyondLegacy }) => {
      const plan = planDtc02AdaptivePollCheck(plannerBase(input));
      if (expectNoDeferBeyondLegacy) {
        expect(plan.proposedNextCheckAtMs).toBeLessThanOrEqual(plan.legacyNextCheckAtMs);
      }
      if (expectLegacyPreserved && input.registryLifecycle === 'OFFBOARDED') {
        expect(plan.excluded).toBe(true);
      }
      expect(plan.projectedPollReductionMs).toBeLessThanOrEqual(0);
    });
  });

  describe('webhook / poll apply safety (no false clears)', () => {
    it('partial webhook never allows clears', () => {
      const built = buildWebhookObdDtcProposal({
        vehicleId: 'v1',
        organizationId: 'org',
        binding,
        fetchObservedAt: new Date('2026-10-15T12:00:00Z'),
        auditRef: 'wh',
        value: [],
        webhookTimestamp: '2026-10-15T11:00:00Z',
      });
      if (!built.ok) throw new Error(built.reason);
      const decision = evaluateDtcSnapshotDecision(emptyHead, built.proposal, {
        activeDtcCodes: new Set(['P0301']),
      });
      expect(decision.allowClears).toBe(false);
    });

    it('duplicate webhook is noop without episode mutation', () => {
      const hash = hashDtcCodesContent(['P0301']);
      const head: DtcSnapshotStoredHead = {
        ...emptyHead,
        lastPartialWebhookSourceAtMs: Date.parse('2026-10-15T11:00:00Z'),
        lastPartialWebhookCodesHash: hash,
        lastAcceptedBindingId: 'link-1',
        bindingEpoch: 1,
        dimoTokenId: 1,
      };
      const plan = planDtc02WebhookIngress({
        vehicleId: 'v1',
        organizationId: 'org',
        binding,
        fetchObservedAt: new Date('2026-10-15T12:00:00Z'),
        auditRef: 'wh-dup',
        value: 'P0301',
        webhookTimestamp: '2026-10-15T11:00:00Z',
        head,
        activeDtcCodes: new Set(['P0301']),
      });
      expect(plan.classification).toBe('DUPLICATE');
      expect(plan.shouldApply).toBe(false);
    });

    it('out-of-order webhook rejected', () => {
      const head: DtcSnapshotStoredHead = {
        ...emptyHead,
        lastPartialWebhookSourceAtMs: Date.parse('2026-10-15T12:00:00Z'),
        lastPartialWebhookCodesHash: hashDtcCodesContent(['P0420']),
        lastAcceptedBindingId: 'link-1',
        bindingEpoch: 1,
        dimoTokenId: 1,
      };
      const plan = planDtc02WebhookIngress({
        vehicleId: 'v1',
        organizationId: 'org',
        binding,
        fetchObservedAt: new Date('2026-10-15T12:00:00Z'),
        auditRef: 'wh-stale',
        value: 'P0301',
        webhookTimestamp: '2026-10-15T10:00:00Z',
        head,
        activeDtcCodes: new Set(['P0420']),
      });
      expect(plan.classification).toBe('STALE');
      expect(plan.shouldApply).toBe(false);
    });

    it('partial webhook after complete poll does not clear on older complete', () => {
      let head = emptyHead;
      const active = new Set<string>();
      const complete = buildPollSignalsLatestProposal({
        vehicleId: 'v1',
        organizationId: 'org',
        binding,
        fetchObservedAt: new Date('2026-10-15T12:00:00Z'),
        auditRef: 'poll',
        obdDtcListSignal: { timestamp: '2026-10-15T11:00:00Z', value: ['P0301', 'P0420'] },
      });
      if (!complete.ok) throw new Error(complete.reason);
      const d1 = evaluateDtcSnapshotDecision(head, complete.proposal, { activeDtcCodes: active });
      expect(d1.allowClears).toBe(true);

      const wh = buildWebhookObdDtcProposal({
        vehicleId: 'v1',
        organizationId: 'org',
        binding,
        fetchObservedAt: new Date('2026-10-15T13:00:00Z'),
        auditRef: 'wh-partial',
        value: 'P0301',
        webhookTimestamp: '2026-10-15T12:00:00Z',
      });
      head = {
        ...emptyHead,
        lastConfirmedCompleteSourceAtMs: Date.parse('2026-10-15T11:00:00Z'),
        lastConfirmedCompleteCodesHash: hashDtcCodesContent(['P0301', 'P0420']),
        lastAcceptedBindingId: 'link-1',
        bindingEpoch: 1,
        dimoTokenId: 1,
      };
      active.add('P0301');
      active.add('P0420');
      if (!wh.ok) throw new Error(wh.reason);
      const d2 = evaluateDtcSnapshotDecision(head, wh.proposal, { activeDtcCodes: active });
      expect(d2.allowClears).toBe(false);
    });
  });
});
