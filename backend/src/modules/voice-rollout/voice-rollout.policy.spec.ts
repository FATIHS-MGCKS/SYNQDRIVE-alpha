import {
  isLegacyDiagnosticRolloutAllowed,
  isRolloutTierAtLeast,
  isSurfaceRolloutTierAllowed,
  VOICE_ROLLOUT_STATUSES_REQUIRING_CONFIRM,
} from './voice-rollout.policy';

describe('VoiceRolloutPolicy', () => {
  it('orders rollout tiers from DISABLED through PRODUCTION', () => {
    expect(isRolloutTierAtLeast('PRODUCTION', 'CANARY')).toBe(true);
    expect(isRolloutTierAtLeast('CANARY', 'PRODUCTION')).toBe(false);
    expect(isRolloutTierAtLeast('INTERNAL_TEST', 'STAGING')).toBe(false);
  });

  it('treats DISABLED and SUSPENDED as non-operational', () => {
    expect(isRolloutTierAtLeast('DISABLED', 'INTERNAL_TEST')).toBe(false);
    expect(isRolloutTierAtLeast('SUSPENDED', 'INTERNAL_TEST')).toBe(false);
  });

  it('allows inbound/outbound from INTERNAL_TEST upward', () => {
    expect(isSurfaceRolloutTierAllowed('inbound', 'INTERNAL_TEST')).toBe(true);
    expect(isSurfaceRolloutTierAllowed('outbound', 'STAGING')).toBe(true);
    expect(isSurfaceRolloutTierAllowed('inbound', 'DISABLED')).toBe(false);
  });

  it('requires CANARY for automation surface', () => {
    expect(isSurfaceRolloutTierAllowed('automation', 'STAGING')).toBe(false);
    expect(isSurfaceRolloutTierAllowed('automation', 'CANARY')).toBe(true);
    expect(isSurfaceRolloutTierAllowed('automation', 'PRODUCTION')).toBe(true);
  });

  it('never allows legacy diagnostic on PRODUCTION rollout tier', () => {
    expect(isLegacyDiagnosticRolloutAllowed('PRODUCTION')).toBe(false);
    expect(isLegacyDiagnosticRolloutAllowed('CANARY')).toBe(true);
    expect(isLegacyDiagnosticRolloutAllowed('INTERNAL_TEST')).toBe(true);
    expect(isSurfaceRolloutTierAllowed('legacy_diagnostic', 'PRODUCTION')).toBe(false);
  });

  it('requires confirmation for PRODUCTION, SUSPENDED, and DISABLED', () => {
    expect(VOICE_ROLLOUT_STATUSES_REQUIRING_CONFIRM.has('PRODUCTION')).toBe(true);
    expect(VOICE_ROLLOUT_STATUSES_REQUIRING_CONFIRM.has('SUSPENDED')).toBe(true);
    expect(VOICE_ROLLOUT_STATUSES_REQUIRING_CONFIRM.has('DISABLED')).toBe(true);
    expect(VOICE_ROLLOUT_STATUSES_REQUIRING_CONFIRM.has('CANARY')).toBe(false);
  });
});
