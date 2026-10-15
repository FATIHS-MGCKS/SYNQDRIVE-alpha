import { evaluateDtcSnapshotDecision } from './dtc-snapshot-decision';
import type { DtcSnapshotProposal, DtcSnapshotStoredHead } from './dtc-snapshot.types';

const binding = {
  provider: 'DIMO' as const,
  providerBindingId: 'link-1',
  dimoTokenId: 1,
};

const emptyHead: DtcSnapshotStoredHead = {
  lastAcceptedSourceAtMs: null,
  lastAcceptedCodesHash: null,
  lastAcceptedBindingId: null,
  bindingEpoch: 0,
  dimoTokenId: null,
  lastConfirmedCompleteSourceAtMs: null,
  lastPartialWebhookSourceAtMs: null,
  lastPartialWebhookCodesHash: null,
};

function head(
  partial: Partial<DtcSnapshotStoredHead>,
): DtcSnapshotStoredHead {
  return { ...emptyHead, ...partial };
}

function proposal(
  overrides: Partial<DtcSnapshotProposal> & { sourceMs: number; hash: string; codes?: string[] },
): DtcSnapshotProposal {
  return {
    vehicleId: 'v1',
    organizationId: 'org',
    channel: 'poll_signals_latest',
    completeness: 'signals_latest_complete',
    binding,
    sourceObservedAt: new Date(overrides.sourceMs),
    codes: overrides.codes ?? ['P0301'],
    codesContentHash: overrides.hash,
    fetchObservedAt: new Date(),
    auditRef: 'test',
    ...overrides,
  };
}

describe('evaluateDtcSnapshotDecision', () => {
  it('accepts first snapshot head', () => {
    const d = evaluateDtcSnapshotDecision(emptyHead, proposal({ sourceMs: 1000, hash: 'a' }));
    expect(d.apply).toBe(true);
    expect(d.outcome).toBe('APPLY_CONFIRMED_SNAPSHOT');
    expect(d.allowClears).toBe(true);
  });

  it('rejects older source observation', () => {
    const d = evaluateDtcSnapshotDecision(
      head({
        lastAcceptedSourceAtMs: 2000,
        lastAcceptedCodesHash: 'a',
        lastConfirmedCompleteSourceAtMs: 2000,
        lastAcceptedBindingId: 'link-1',
        bindingEpoch: 1,
        dimoTokenId: 1,
      }),
      proposal({ sourceMs: 1000, hash: 'a' }),
    );
    expect(d.apply).toBe(false);
    expect(d.outcome).toBe('REJECT_OUT_OF_ORDER_SOURCE');
  });

  it('noop on identical timestamp and hash', () => {
    const d = evaluateDtcSnapshotDecision(
      head({
        lastAcceptedSourceAtMs: 2000,
        lastAcceptedCodesHash: 'same',
        lastConfirmedCompleteSourceAtMs: 2000,
        lastAcceptedBindingId: 'link-1',
        bindingEpoch: 1,
        dimoTokenId: 1,
      }),
      proposal({ sourceMs: 2000, hash: 'same' }),
    );
    expect(d.outcome).toBe('NOOP_ALREADY_APPLIED');
    expect(d.apply).toBe(false);
  });

  it('conflict on same timestamp different content', () => {
    const d = evaluateDtcSnapshotDecision(
      head({
        lastAcceptedSourceAtMs: 2000,
        lastAcceptedCodesHash: 'a',
        lastConfirmedCompleteSourceAtMs: 2000,
        lastAcceptedBindingId: 'link-1',
        bindingEpoch: 1,
        dimoTokenId: 1,
      }),
      proposal({ sourceMs: 2000, hash: 'b', codes: ['P0420'] }),
    );
    expect(d.outcome).toBe('REJECT_EQUAL_TIMESTAMP_CONFLICT');
    expect(d.apply).toBe(false);
  });

  it('webhook partial allows upsert without clear', () => {
    const d = evaluateDtcSnapshotDecision(
      head({
        lastAcceptedSourceAtMs: 1000,
        lastAcceptedCodesHash: 'a',
        lastAcceptedBindingId: 'link-1',
        bindingEpoch: 1,
        dimoTokenId: 1,
      }),
      {
        ...proposal({ sourceMs: 2000, hash: 'b' }),
        channel: 'webhook_obd_dtc_list',
        completeness: 'webhook_partial_upsert_only',
      },
    );
    expect(d.outcome).toBe('APPLY_WEBHOOK_PARTIAL');
    expect(d.allowClears).toBe(false);
    expect(d.allowUpserts).toBe(true);
  });

  it('rejects binding mismatch when token differs', () => {
    const d = evaluateDtcSnapshotDecision(
      head({
        lastAcceptedSourceAtMs: 1000,
        lastAcceptedCodesHash: 'a',
        lastAcceptedBindingId: 'other-link',
        bindingEpoch: 1,
        dimoTokenId: 99,
      }),
      proposal({ sourceMs: 2000, hash: 'b' }),
    );
    expect(d.outcome).toBe('REJECT_BINDING_MISMATCH');
  });

  it('defers clears when complete snapshot is older than partial webhook watermark', () => {
    const d = evaluateDtcSnapshotDecision(
      head({
        lastConfirmedCompleteSourceAtMs: 1000,
        lastPartialWebhookSourceAtMs: 3000,
        lastPartialWebhookCodesHash: 'wh',
        lastAcceptedSourceAtMs: 3000,
        lastAcceptedCodesHash: 'wh',
        lastAcceptedBindingId: 'link-1',
        bindingEpoch: 1,
        dimoTokenId: 1,
      }),
      {
        ...proposal({ sourceMs: 2500, hash: 'c', codes: [] }),
        completeness: 'signals_latest_complete',
      },
    );
    expect(d.apply).toBe(true);
    expect(d.outcome).toBe('APPLY_CONFIRMED_SNAPSHOT_DEFER_CLEARS');
    expect(d.allowClears).toBe(false);
  });

  it('rebaseline when binding id changes but token matches', () => {
    const d = evaluateDtcSnapshotDecision(
      head({
        lastAcceptedSourceAtMs: 1000,
        lastAcceptedCodesHash: 'a',
        lastAcceptedBindingId: 'old-link',
        bindingEpoch: 2,
        dimoTokenId: 1,
      }),
      {
        ...proposal({ sourceMs: 2000, hash: 'b', codes: [] }),
        binding: { ...binding, providerBindingId: 'new-link' },
      },
    );
    expect(d.outcome).toBe('APPLY_BINDING_REBASELINE');
    expect(d.allowClears).toBe(true);
  });
});
