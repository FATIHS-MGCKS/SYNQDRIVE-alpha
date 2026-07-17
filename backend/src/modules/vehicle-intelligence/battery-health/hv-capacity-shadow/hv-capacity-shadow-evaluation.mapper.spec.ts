import { sanitizeChargeSessionMetadata } from './hv-capacity-shadow-evaluation.mapper';

describe('hv-capacity-shadow-evaluation.mapper', () => {
  it('strips sensitive DIMO fields from session metadata', () => {
    const sanitized = sanitizeChargeSessionMetadata({
      providerSegmentFingerprint: 'fp-abc',
      durationSeconds: 3600,
      lastReconciledAt: '2026-06-26T00:00:00.000Z',
      reconcileVersion: 1,
      dimoTokenId: 123456,
      providerSegmentId: 'provider-segment-raw',
      qualityStatus: 'QUALIFIED',
      capacityShadowEligible: true,
      changeHistory: [{ at: '2026-06-26T00:00:00.000Z', kind: 'completed' }],
    });

    expect(sanitized).not.toBeNull();
    expect(sanitized).not.toHaveProperty('dimoTokenId');
    expect(sanitized).not.toHaveProperty('providerSegmentId');
    expect(sanitized).not.toHaveProperty('changeHistory');
    expect(sanitized?.providerSegmentFingerprint).toBe('fp-abc');
    expect(sanitized?.qualityStatus).toBe('QUALIFIED');
  });
});
