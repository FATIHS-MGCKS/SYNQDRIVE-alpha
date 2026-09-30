import { validateDimoProviderBudgetConfig } from './dimo-provider-budget.config';

describe('validateDimoProviderBudgetConfig', () => {
  const base = {
    globalBudgetEnabled: true,
    globalMaxInFlight: 10,
    globalAcquireTimeoutMs: 1_000,
    globalLeaseMs: 30_000,
    globalRetryAfterMaxMs: 60_000,
    globalMaxRetries: 3,
    reservedHighPrioritySlots: 2,
    starvationPromotionMs: 30_000,
    providerCooldown429Threshold: 5,
    providerCooldownMs: 30_000,
    acquirePollIntervalMs: 50,
  };

  it('accepts valid configuration', () => {
    expect(validateDimoProviderBudgetConfig(base)).toEqual([]);
  });

  it('rejects invalid reserved slots and cooldown settings', () => {
    expect(
      validateDimoProviderBudgetConfig({ ...base, reservedHighPrioritySlots: 10 }),
    ).toContain('DIMO_GLOBAL_RESERVED_HIGH_SLOTS must be < DIMO_GLOBAL_MAX_IN_FLIGHT');
    expect(
      validateDimoProviderBudgetConfig({ ...base, providerCooldown429Threshold: 0 }),
    ).toContain('DIMO_PROVIDER_COOLDOWN_429_THRESHOLD must be > 0');
    expect(validateDimoProviderBudgetConfig({ ...base, providerCooldownMs: 0 })).toContain(
      'DIMO_PROVIDER_COOLDOWN_MS must be > 0',
    );
  });
});
