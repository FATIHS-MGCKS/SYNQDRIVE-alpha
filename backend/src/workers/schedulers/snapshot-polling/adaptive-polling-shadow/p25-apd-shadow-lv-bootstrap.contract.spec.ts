import { evaluateLvProviderTimestampAdmission } from './p25-apd-shadow-lv-bootstrap.contract';

describe('p25-apd-shadow-lv-bootstrap.contract', () => {
  const base = {
    pollStartedAtMs: 1_700_000_000_000,
    pollCompletedAtMs: 1_700_000_060_000,
    reconciliation: true,
    prePollDecision: 'FORCED_SOURCE_TIMESTAMP_MISSING',
  };

  it('admits trustworthy visible LV for bootstrap-eligible forced-missing', () => {
    const r = evaluateLvProviderTimestampAdmission({
      ...base,
      visibleLvProviderTimestampMs: 1_699_999_500_000,
    });
    expect(r).toEqual({ admit: true, usedBootstrapPath: true });
  });

  it('rejects future provider timestamp relative to poll completion', () => {
    const r = evaluateLvProviderTimestampAdmission({
      ...base,
      visibleLvProviderTimestampMs: base.pollCompletedAtMs + 1,
    });
    expect(r.admit).toBe(false);
    if (!r.admit) expect(r.reason).toBe('LV_PROVIDER_TIMESTAMP_AFTER_POLL_COMPLETION');
  });

  it('rejects non-reconciliation polls', () => {
    const r = evaluateLvProviderTimestampAdmission({
      ...base,
      reconciliation: false,
      visibleLvProviderTimestampMs: 1_699_999_500_000,
    });
    expect(r.admit).toBe(false);
  });

  it('rejects WOULD_SKIP (not LV source eligible)', () => {
    const r = evaluateLvProviderTimestampAdmission({
      ...base,
      prePollDecision: 'WOULD_SKIP',
      visibleLvProviderTimestampMs: 1_699_999_500_000,
    });
    expect(r.admit).toBe(false);
  });

  it('admits advancing decision without bootstrap path flag', () => {
    const r = evaluateLvProviderTimestampAdmission({
      ...base,
      prePollDecision: 'IMMEDIATE_SNAPSHOT_REQUIRED',
      visibleLvProviderTimestampMs: 1_699_999_500_000,
    });
    expect(r).toEqual({ admit: true, usedBootstrapPath: false });
  });
});
