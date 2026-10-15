import {
  evaluateDtcSnapshotDecision,
  needsEpisodeReconciliation,
} from './dtc-snapshot-decision';
import { hashDtcCodesContent } from './dtc-snapshot-meta.util';
import type { DtcSnapshotProposal, DtcSnapshotStoredHead } from './dtc-snapshot.types';

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
        lastConfirmedCompleteCodesHash: 'a',
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
        lastConfirmedCompleteCodesHash: 'same',
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

  it('refreshes watermark without upserts when timestamp advances with same codes hash', () => {
    const d = evaluateDtcSnapshotDecision(
      head({
        lastAcceptedSourceAtMs: 2000,
        lastConfirmedCompleteCodesHash: 'same',
        lastConfirmedCompleteSourceAtMs: 2000,
        lastAcceptedBindingId: 'link-1',
        bindingEpoch: 1,
        dimoTokenId: 1,
      }),
      proposal({ sourceMs: 3000, hash: 'same', codes: ['P0301'] }),
      { activeDtcCodes: new Set(['P0301']) },
    );
    expect(d.outcome).toBe('REFRESH_SOURCE_WATERMARK');
    expect(d.apply).toBe(true);
    expect(d.allowUpserts).toBe(false);
    expect(d.allowClears).toBe(false);
  });

  it('conflict on same timestamp different content', () => {
    const d = evaluateDtcSnapshotDecision(
      head({
        lastAcceptedSourceAtMs: 2000,
        lastConfirmedCompleteCodesHash: 'a',
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
        lastConfirmedCompleteCodesHash: 'a',
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
        lastConfirmedCompleteCodesHash: 'a',
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
        lastConfirmedCompleteCodesHash: 'empty',
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

  it('T100→T200→T150→T250 complete/partial reconciliation timeline', () => {
    const emptyHash = hashDtcCodesContent([]);
    const p0301Hash = hashDtcCodesContent(['P0301']);

    const afterT100 = head({
      lastConfirmedCompleteSourceAtMs: 100,
      lastConfirmedCompleteCodesHash: emptyHash,
      lastAcceptedSourceAtMs: 100,
      lastAcceptedBindingId: 'link-1',
      bindingEpoch: 1,
      dimoTokenId: 1,
    });

    const t200Partial = evaluateDtcSnapshotDecision(
      afterT100,
      {
        ...proposal({ sourceMs: 200, hash: p0301Hash, codes: ['P0301'] }),
        channel: 'webhook_obd_dtc_list',
        completeness: 'webhook_partial_upsert_only',
      },
      { activeDtcCodes: new Set() },
    );
    expect(t200Partial.outcome).toBe('APPLY_WEBHOOK_PARTIAL');

    const afterT200 = head({
      ...afterT100,
      lastPartialWebhookSourceAtMs: 200,
      lastPartialWebhookCodesHash: p0301Hash,
      lastAcceptedSourceAtMs: 200,
    });

    const t150Complete = evaluateDtcSnapshotDecision(
      afterT200,
      {
        ...proposal({ sourceMs: 150, hash: emptyHash, codes: [] }),
        completeness: 'signals_latest_complete',
      },
      { activeDtcCodes: new Set(['P0301']) },
    );
    expect(t150Complete.outcome).toBe('APPLY_CONFIRMED_SNAPSHOT_DEFER_CLEARS');
    expect(t150Complete.allowClears).toBe(false);

    const t250Complete = evaluateDtcSnapshotDecision(
      afterT200,
      {
        ...proposal({ sourceMs: 250, hash: emptyHash, codes: [] }),
        completeness: 'signals_latest_complete',
      },
      { activeDtcCodes: new Set(['P0301']) },
    );
    expect(t250Complete.outcome).toBe('APPLY_CONFIRMED_SNAPSHOT');
    expect(t250Complete.allowClears).toBe(true);

    expect(
      needsEpisodeReconciliation(afterT200, proposal({ sourceMs: 250, hash: emptyHash, codes: [] }), new Set(['P0301'])),
    ).toBe(true);
  });

  it('does not REFRESH complete empty hash while partial reconciliation pending', () => {
    const emptyHash = hashDtcCodesContent([]);
    const h = head({
      lastConfirmedCompleteSourceAtMs: 100,
      lastConfirmedCompleteCodesHash: emptyHash,
      lastPartialWebhookSourceAtMs: 200,
      lastPartialWebhookCodesHash: hashDtcCodesContent(['P0301']),
      lastAcceptedBindingId: 'link-1',
      bindingEpoch: 1,
      dimoTokenId: 1,
    });
    const d = evaluateDtcSnapshotDecision(
      h,
      proposal({ sourceMs: 250, hash: emptyHash, codes: [] }),
      { activeDtcCodes: new Set(['P0301']) },
    );
    expect(d.outcome).not.toBe('REFRESH_SOURCE_WATERMARK');
    expect(d.allowClears).toBe(true);
  });

  it('rebaseline when binding id changes but token matches', () => {
    const d = evaluateDtcSnapshotDecision(
      head({
        lastAcceptedSourceAtMs: 1000,
        lastConfirmedCompleteCodesHash: 'a',
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
