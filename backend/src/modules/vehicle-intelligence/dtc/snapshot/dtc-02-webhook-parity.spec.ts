import {
  buildPollSignalsLatestProposal,
  buildWebhookObdDtcProposal,
} from './dtc-snapshot-proposal.builder';
import { evaluateDtcSnapshotDecision } from './dtc-snapshot-decision';
import { hashDtcCodesContent } from './dtc-snapshot-meta.util';
import type { DtcSnapshotProposal, DtcSnapshotStoredHead } from './dtc-snapshot.types';
import { mapSourceHeadRow } from './dtc-source-head.mapper';

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

type SimHead = DtcSnapshotStoredHead;

function applyDecisionToHead(
  head: SimHead,
  proposal: DtcSnapshotProposal,
  decision: ReturnType<typeof evaluateDtcSnapshotDecision>,
): SimHead {
  if (!decision.apply) return head;
  const ms = proposal.sourceObservedAt.getTime();
  const hash = proposal.codesContentHash;
  const next: SimHead = {
    ...head,
    lastAcceptedSourceAtMs: ms,
    lastAcceptedBindingId: proposal.binding.providerBindingId,
    bindingEpoch: head.bindingEpoch + (decision.outcome === 'APPLY_BINDING_REBASELINE' ? 1 : 0),
    dimoTokenId: proposal.binding.dimoTokenId,
  };
  if (proposal.completeness === 'webhook_partial_upsert_only') {
    return {
      ...next,
      lastPartialWebhookSourceAtMs: ms,
      lastPartialWebhookCodesHash: hash,
    };
  }
  if (
    proposal.completeness === 'signals_latest_complete' ||
    proposal.completeness === 'webhook_provider_confirmed_complete'
  ) {
    return {
      ...next,
      lastConfirmedCompleteSourceAtMs: ms,
      lastConfirmedCompleteCodesHash: hash,
    };
  }
  return next;
}

function simulateActive(
  active: Set<string>,
  proposal: DtcSnapshotProposal,
  decision: ReturnType<typeof evaluateDtcSnapshotDecision>,
): Set<string> {
  const next = new Set(active);
  if (!decision.apply) return next;
  if (decision.allowUpserts) {
    for (const c of proposal.codes) next.add(c);
  }
  if (decision.allowClears) {
    for (const c of [...next]) {
      if (!proposal.codes.includes(c)) next.delete(c);
    }
  }
  return next;
}

function step(
  head: SimHead,
  active: Set<string>,
  built: ReturnType<typeof buildPollSignalsLatestProposal>,
) {
  if (!built.ok) return { head, active, decision: null };
  const decision = evaluateDtcSnapshotDecision(head, built.proposal, { activeDtcCodes: active });
  return {
    head: applyDecisionToHead(head, built.proposal, decision),
    active: simulateActive(active, built.proposal, decision),
    decision,
  };
}

function stepWebhook(
  head: SimHead,
  active: Set<string>,
  input: {
    value: unknown;
    ts: string;
    fetchMs: number;
    completeness?: 'webhook_partial_upsert_only' | 'webhook_provider_confirmed_complete';
  },
) {
  const built = buildWebhookObdDtcProposal({
    vehicleId: 'v1',
    organizationId: 'org',
    binding,
    fetchObservedAt: new Date(input.fetchMs),
    auditRef: `wh-${input.fetchMs}`,
    value: input.value,
    webhookTimestamp: input.ts,
    completenessEvidence: input.completeness,
  });
  if (!built.ok) return { head, active, decision: null, built };
  const decision = evaluateDtcSnapshotDecision(head, built.proposal, { activeDtcCodes: active });
  return {
    head: applyDecisionToHead(head, built.proposal, decision),
    active: simulateActive(active, built.proposal, decision),
    decision,
    built,
  };
}

describe('DTC-02 poll/webhook parity (01A decision convergence)', () => {
  it('poll then identical webhook applies partial channel without clearing', () => {
    let head = emptyHead;
    let active = new Set<string>();
    const ts = '2026-10-15T10:00:00Z';
    const poll = buildPollSignalsLatestProposal({
      vehicleId: 'v1',
      organizationId: 'org',
      binding,
      fetchObservedAt: new Date('2026-10-15T12:00:00Z'),
      auditRef: 'p1',
      obdDtcListSignal: { timestamp: ts, value: ['P0301'] },
    });
    ({ head, active } = step(head, active, poll));
    const wh = stepWebhook(head, active, {
      value: 'P0301',
      ts,
      fetchMs: Date.parse('2026-10-15T12:00:00Z'),
    });
    expect(wh.decision?.outcome).toBe('APPLY_WEBHOOK_PARTIAL');
    expect(wh.decision?.allowClears).toBe(false);
  });

  it('duplicate webhook delivery is idempotent on partial channel', () => {
    let head = emptyHead;
    let active = new Set<string>();
    const ts = '2026-10-15T10:00:00Z';
    const first = stepWebhook(head, active, {
      value: 'P0301',
      ts,
      fetchMs: Date.parse('2026-10-15T12:00:00Z'),
    });
    const second = stepWebhook(first.head, first.active, {
      value: 'P0301',
      ts,
      fetchMs: Date.parse('2026-10-15T12:01:00Z'),
    });
    expect(second.decision?.outcome).toBe('NOOP_ALREADY_APPLIED');
  });

  it('webhook then identical poll converges on complete channel watermark', () => {
    let head = emptyHead;
    let active = new Set<string>(['P0301']);
    head = {
      ...head,
      lastPartialWebhookSourceAtMs: Date.parse('2026-10-15T10:00:00Z'),
      lastPartialWebhookCodesHash: hashDtcCodesContent(['P0301']),
      lastAcceptedBindingId: 'link-1',
      bindingEpoch: 1,
      dimoTokenId: 1,
    };
    const poll = buildPollSignalsLatestProposal({
      vehicleId: 'v1',
      organizationId: 'org',
      binding,
      fetchObservedAt: new Date('2026-10-15T12:00:00Z'),
      auditRef: 'p2',
      obdDtcListSignal: { timestamp: '2026-10-15T10:00:00Z', value: ['P0301'] },
    });
    const r = step(head, active, poll);
    expect(r.decision?.apply).toBe(true);
    expect(r.decision?.allowClears).toBe(true);
  });

  it('partial webhook after complete poll does not clear', () => {
    let head = emptyHead;
    let active = new Set<string>();
    const complete = buildPollSignalsLatestProposal({
      vehicleId: 'v1',
      organizationId: 'org',
      binding,
      fetchObservedAt: new Date('2026-10-15T12:00:00Z'),
      auditRef: 'c1',
      obdDtcListSignal: { timestamp: '2026-10-15T09:00:00Z', value: ['P0301', 'P0420'] },
    });
    ({ head, active } = step(head, active, complete));
    const wh = stepWebhook(head, active, {
      value: 'P0301',
      ts: '2026-10-15T10:00:00Z',
      fetchMs: Date.parse('2026-10-15T12:00:00Z'),
    });
    expect(wh.decision?.allowClears).toBe(false);
    expect(wh.active.has('P0420')).toBe(true);
  });

  it('empty partial webhook does not clear active codes', () => {
    let head = emptyHead;
    let active = new Set<string>(['P0301']);
    const wh = stepWebhook(head, active, {
      value: [],
      ts: '2026-10-15T11:00:00Z',
      fetchMs: Date.parse('2026-10-15T12:00:00Z'),
    });
    expect(wh.decision?.allowClears).toBe(false);
    expect(wh.active.has('P0301')).toBe(true);
  });

  it('empty complete poll clears when no newer partial', () => {
    let head = emptyHead;
    let active = new Set<string>(['P0301']);
    head = {
      ...head,
      lastConfirmedCompleteSourceAtMs: Date.parse('2026-10-15T08:00:00Z'),
      lastConfirmedCompleteCodesHash: hashDtcCodesContent(['P0301']),
      lastAcceptedBindingId: 'link-1',
      bindingEpoch: 1,
      dimoTokenId: 1,
    };
    const poll = buildPollSignalsLatestProposal({
      vehicleId: 'v1',
      organizationId: 'org',
      binding,
      fetchObservedAt: new Date('2026-10-15T12:00:00Z'),
      auditRef: 'empty-complete',
      obdDtcListSignal: { timestamp: '2026-10-15T09:00:00Z', value: [] },
    });
    const r = step(head, active, poll);
    expect(r.decision?.allowClears).toBe(true);
    expect(r.active.size).toBe(0);
  });

  it('out-of-order timestamps reject without mutating head monotonicity', () => {
    const head: SimHead = {
      ...emptyHead,
      lastConfirmedCompleteSourceAtMs: 5_000,
      lastConfirmedCompleteCodesHash: hashDtcCodesContent(['P0301']),
      lastAcceptedBindingId: 'link-1',
      bindingEpoch: 1,
      dimoTokenId: 1,
    };
    const poll = buildPollSignalsLatestProposal({
      vehicleId: 'v1',
      organizationId: 'org',
      binding,
      fetchObservedAt: new Date('2026-10-15T12:00:00Z'),
      auditRef: 'ooo',
      obdDtcListSignal: { timestamp: new Date(4_000).toISOString(), value: [] },
    });
    const r = step(head, new Set(['P0301']), poll);
    expect(r.decision?.outcome).toBe('REJECT_OUT_OF_ORDER_SOURCE');
    expect(r.head.lastConfirmedCompleteSourceAtMs).toBe(5_000);
  });

  it('mapSourceHeadRow preserves partial vs complete watermarks', () => {
    const confirmedAt = new Date('2026-10-15T10:00:00Z');
    const partialAt = new Date('2026-10-15T11:00:00Z');
    const row = {
      lastAcceptedSourceAt: confirmedAt,
      lastAcceptedCodesHash: 'h1',
      providerBindingId: 'link-1',
      bindingEpoch: 2,
      dimoTokenId: 9,
      lastConfirmedCompleteSourceAt: confirmedAt,
      lastPartialWebhookSourceAt: partialAt,
      lastPartialWebhookCodesHash: 'h2',
    };
    const mapped = mapSourceHeadRow(row as never);
    expect(mapped.lastConfirmedCompleteSourceAtMs).toBe(confirmedAt.getTime());
    expect(mapped.lastPartialWebhookSourceAtMs).toBe(partialAt.getTime());
  });
});
