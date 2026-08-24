import {
  COMMUNICATION_RETENTION_DAYS_DEFAULTS,
  COMMUNICATION_RETENTION_POLICY_SOURCE,
  computeRetentionCutoffUtc,
  isRetentionPolicyEnabled,
} from './communication-retention.constants';

describe('communication-retention.constants', () => {
  it('disables destructive purge when retention days are zero (NO_POLICY)', () => {
    expect(isRetentionPolicyEnabled(COMMUNICATION_RETENTION_DAYS_DEFAULTS.messageContent)).toBe(false);
    expect(isRetentionPolicyEnabled(COMMUNICATION_RETENTION_DAYS_DEFAULTS.attachment)).toBe(false);
    expect(isRetentionPolicyEnabled(COMMUNICATION_RETENTION_DAYS_DEFAULTS.replyCommandSettled)).toBe(false);
  });

  it('computes UTC cutoffs deterministically', () => {
    const now = new Date('2026-08-23T12:00:00.000Z');
    const cutoff = computeRetentionCutoffUtc(now, 30);
    expect(cutoff?.toISOString()).toBe('2026-07-24T12:00:00.000Z');
    expect(computeRetentionCutoffUtc(now, 0)).toBeNull();
  });

  it('documents NO_POLICY defaults for customer message content', () => {
    expect(COMMUNICATION_RETENTION_DAYS_DEFAULTS.messageContent).toBe(0);
    expect(COMMUNICATION_RETENTION_POLICY_SOURCE.NO_POLICY).toBe('NO_POLICY');
  });
});
