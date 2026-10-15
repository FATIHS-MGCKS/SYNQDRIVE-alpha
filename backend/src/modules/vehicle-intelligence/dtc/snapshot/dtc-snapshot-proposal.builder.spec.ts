import {
  buildPollSignalsLatestProposal,
  buildWebhookObdDtcProposal,
} from './dtc-snapshot-proposal.builder';

const binding = {
  provider: 'DIMO' as const,
  providerBindingId: 'link-1',
  dimoTokenId: 42,
};

describe('dtc snapshot proposal builders', () => {
  const base = {
    vehicleId: 'v1',
    organizationId: 'org',
    binding,
    fetchObservedAt: new Date('2026-10-15T12:00:00Z'),
    auditRef: 'ref',
  };

  it('poll rejects missing signal object (fetch without DTC data)', () => {
    const r = buildPollSignalsLatestProposal({ ...base, obdDtcListSignal: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.outcome).toBe('REJECT_FETCH_WITHOUT_SIGNAL');
  });

  it('poll rejects missing timestamp', () => {
    const r = buildPollSignalsLatestProposal({
      ...base,
      obdDtcListSignal: { value: [] },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.outcome).toBe('REJECT_INVALID_TIMESTAMP');
  });

  it('poll accepts explicit empty list with provider timestamp', () => {
    const r = buildPollSignalsLatestProposal({
      ...base,
      obdDtcListSignal: { timestamp: '2026-10-15T11:00:00Z', value: [] },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.proposal.codes).toEqual([]);
  });

  it('webhook rejects missing timestamp', () => {
    const r = buildWebhookObdDtcProposal({
      ...base,
      value: ['P0301'],
      webhookTimestamp: null,
    });
    expect(r.ok).toBe(false);
  });

  it('webhook builds partial upsert proposal', () => {
    const r = buildWebhookObdDtcProposal({
      ...base,
      value: 'P0301',
      webhookTimestamp: '2026-10-15T11:00:00Z',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.proposal.completeness).toBe('webhook_partial_upsert_only');
      expect(r.proposal.codes).toEqual(['P0301']);
    }
  });
});
