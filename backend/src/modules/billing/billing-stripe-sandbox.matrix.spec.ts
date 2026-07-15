import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BILLING_STRIPE_SANDBOX_SCENARIOS,
  SANDBOX_SCENARIO_COUNT,
  ciSafeScenarios,
  manualSandboxScenarios,
  scenariosByTier,
} from './billing-stripe-sandbox.matrix';
import {
  assertTestModeStripeKey,
  loadStripeSandboxFixture,
  withSandboxOrgMetadata,
} from './stripe-sandbox.fixture.util';

const repoRoot = resolve(__dirname, '../../../../');

describe('Billing Stripe sandbox scenario matrix', () => {
  it('defines exactly 32 scenarios', () => {
    expect(SANDBOX_SCENARIO_COUNT).toBe(32);
    const ids = BILLING_STRIPE_SANDBOX_SCENARIOS.map((scenario) => scenario.id);
    expect(ids).toEqual(Array.from({ length: 32 }, (_, index) => index + 1));
  });

  it.each(BILLING_STRIPE_SANDBOX_SCENARIOS)(
    'scenario #$id ($key) references existing automated tests or manual-only live Stripe',
    (scenario) => {
      expect(scenario.automatedTests.length).toBeGreaterThan(0);
      expect(scenario.manualSection).toMatch(/^§/);

      if (scenario.tier !== 'e2e-manual') {
        for (const testPath of scenario.automatedTests) {
          expect(existsSync(resolve(repoRoot, testPath))).toBe(true);
        }
      }

      if (scenario.fixture) {
        expect(() => loadStripeSandboxFixture(scenario.fixture!)).not.toThrow();
        const fixture = loadStripeSandboxFixture(scenario.fixture!);
        expect(fixture.livemode).toBe(false);
      }
    },
  );

  it('classifies CI-safe vs live-sandbox scenarios', () => {
    expect(ciSafeScenarios().length).toBeGreaterThanOrEqual(14);
    expect(manualSandboxScenarios().length).toBeGreaterThanOrEqual(12);
  });

  it('maps webhook-heavy scenarios to ci-mock tier', () => {
    const webhookScenarios = BILLING_STRIPE_SANDBOX_SCENARIOS.filter((scenario) =>
      [13, 14, 15, 17, 18, 19, 20, 21, 26, 27].includes(scenario.id),
    );
    expect(webhookScenarios.every((scenario) => scenario.tier === 'ci-mock')).toBe(true);
    expect(webhookScenarios.every((scenario) => scenario.ciSafe)).toBe(true);
  });

  it('keeps lifecycle scenarios in unit or integration-mock tiers', () => {
    const lifecycle = BILLING_STRIPE_SANDBOX_SCENARIOS.filter((scenario) =>
      [1, 2, 3, 4, 5, 22, 23, 24, 25].includes(scenario.id),
    );
    expect(
      lifecycle.every((scenario) =>
        ['unit', 'integration-mock'].includes(scenario.tier),
      ),
    ).toBe(true);
  });

  it('documents tier distribution for operators', () => {
    const tiers = {
      unit: scenariosByTier('unit').length,
      integrationMock: scenariosByTier('integration-mock').length,
      ciMock: scenariosByTier('ci-mock').length,
      e2eManual: scenariosByTier('e2e-manual').length,
    };
    expect(tiers.unit + tiers.integrationMock + tiers.ciMock + tiers.e2eManual).toBe(32);
  });
});

describe('Stripe sandbox fixtures', () => {
  it('loads invoice.paid fixture in test mode only', () => {
    const fixture = loadStripeSandboxFixture('invoice.paid.json');
    expect(fixture.type).toBe('invoice.paid');
    expect(fixture.livemode).toBe(false);
  });

  it('injects sandbox organization metadata', () => {
    const fixture = withSandboxOrgMetadata(loadStripeSandboxFixture('invoice.paid.json'), 'org-test');
    expect(fixture.data.object.metadata).toEqual(
      expect.objectContaining({ synqdriveOrganizationId: 'org-test' }),
    );
  });

  it('rejects live Stripe keys in sandbox guard', () => {
    expect(() => assertTestModeStripeKey('sk_test_abc')).not.toThrow();
    expect(() => assertTestModeStripeKey('sk_live_abc')).toThrow(/not allowed/i);
    expect(() => assertTestModeStripeKey(undefined)).toThrow(/sk_test/i);
  });
});
