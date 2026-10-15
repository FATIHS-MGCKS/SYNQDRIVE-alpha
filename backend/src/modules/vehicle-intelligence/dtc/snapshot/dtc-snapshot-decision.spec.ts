import { evaluateDtcSnapshotDecision } from './dtc-snapshot-decision';
import type { DtcSnapshotProposal } from './dtc-snapshot.types';

const binding = {
  provider: 'DIMO' as const,
  providerBindingId: 'link-1',
  dimoTokenId: 1,
};

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
    const d = evaluateDtcSnapshotDecision(
      { lastAcceptedSourceAtMs: null, lastAcceptedCodesHash: null, lastAcceptedBindingId: null },
      proposal({ sourceMs: 1000, hash: 'a' }),
    );
    expect(d.apply).toBe(true);
    expect(d.outcome).toBe('APPLY_CONFIRMED_SNAPSHOT');
    expect(d.allowClears).toBe(true);
  });

  it('rejects older source observation', () => {
    const d = evaluateDtcSnapshotDecision(
      {
        lastAcceptedSourceAtMs: 2000,
        lastAcceptedCodesHash: 'a',
        lastAcceptedBindingId: 'link-1',
      },
      proposal({ sourceMs: 1000, hash: 'a' }),
    );
    expect(d.apply).toBe(false);
    expect(d.outcome).toBe('REJECT_OUT_OF_ORDER_SOURCE');
  });

  it('noop on identical timestamp and hash', () => {
    const d = evaluateDtcSnapshotDecision(
      {
        lastAcceptedSourceAtMs: 2000,
        lastAcceptedCodesHash: 'same',
        lastAcceptedBindingId: 'link-1',
      },
      proposal({ sourceMs: 2000, hash: 'same' }),
    );
    expect(d.outcome).toBe('NOOP_ALREADY_APPLIED');
    expect(d.apply).toBe(false);
  });

  it('conflict on same timestamp different content', () => {
    const d = evaluateDtcSnapshotDecision(
      {
        lastAcceptedSourceAtMs: 2000,
        lastAcceptedCodesHash: 'a',
        lastAcceptedBindingId: 'link-1',
      },
      proposal({ sourceMs: 2000, hash: 'b', codes: ['P0420'] }),
    );
    expect(d.outcome).toBe('REJECT_EQUAL_TIMESTAMP_CONFLICT');
    expect(d.apply).toBe(false);
  });

  it('webhook partial allows upsert without clear', () => {
    const d = evaluateDtcSnapshotDecision(
      { lastAcceptedSourceAtMs: 1000, lastAcceptedCodesHash: 'a', lastAcceptedBindingId: 'link-1' },
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

  it('rejects binding mismatch', () => {
    const d = evaluateDtcSnapshotDecision(
      {
        lastAcceptedSourceAtMs: 1000,
        lastAcceptedCodesHash: 'a',
        lastAcceptedBindingId: 'other-link',
      },
      proposal({ sourceMs: 2000, hash: 'b' }),
    );
    expect(d.outcome).toBe('REJECT_BINDING_MISMATCH');
  });
});
