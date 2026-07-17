import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ciSafeVoiceScenarios,
  liveVoiceScenarios,
  VOICE_STAGING_E2E_SCENARIOS,
  VOICE_STAGING_SCENARIO_COUNT,
  voiceScenariosByTier,
} from './voice-staging-e2e.matrix';

const repoRoot = resolve(__dirname, '../../../../');

describe('Voice staging E2E scenario matrix', () => {
  it('defines exactly 28 scenarios', () => {
    expect(VOICE_STAGING_SCENARIO_COUNT).toBe(28);
    const ids = VOICE_STAGING_E2E_SCENARIOS.map((scenario) => scenario.id);
    expect(ids).toEqual(Array.from({ length: 28 }, (_, index) => index + 1));
  });

  it.each(VOICE_STAGING_E2E_SCENARIOS)(
    'scenario #$id ($key) references existing automated tests or manual-only live staging',
    (scenario) => {
      expect(scenario.automatedTests.length).toBeGreaterThan(0);
      expect(scenario.manualSection).toMatch(/^§/);

      if (!['e2e-manual-live', 'e2e-manual-failure'].includes(scenario.tier)) {
        for (const testPath of scenario.automatedTests) {
          expect(existsSync(resolve(repoRoot, testPath))).toBe(true);
        }
      } else if (scenario.tier === 'e2e-manual-live') {
        for (const testPath of scenario.automatedTests) {
          expect(existsSync(resolve(repoRoot, testPath))).toBe(true);
        }
      }
    },
  );

  it('classifies CI-safe vs live-call scenarios', () => {
    expect(ciSafeVoiceScenarios().length).toBeGreaterThanOrEqual(20);
    expect(liveVoiceScenarios().length).toBe(4);
    expect(liveVoiceScenarios().every((scenario) => scenario.requiresLiveCalls)).toBe(true);
  });

  it('keeps security scenarios CI-safe', () => {
    const security = VOICE_STAGING_E2E_SCENARIOS.filter((scenario) =>
      [7, 8, 9, 10, 13, 20, 24].includes(scenario.id),
    );
    expect(security.every((scenario) => scenario.ciSafe)).toBe(true);
  });

  it('documents tier distribution for operators', () => {
    const tiers = {
      unit: voiceScenariosByTier('unit').length,
      integrationMock: voiceScenariosByTier('integration-mock').length,
      ciMock: voiceScenariosByTier('ci-mock').length,
      preflight: voiceScenariosByTier('preflight').length,
      e2eManualLive: voiceScenariosByTier('e2e-manual-live').length,
      e2eManualFailure: voiceScenariosByTier('e2e-manual-failure').length,
    };
    expect(
      tiers.unit +
        tiers.integrationMock +
        tiers.ciMock +
        tiers.preflight +
        tiers.e2eManualLive +
        tiers.e2eManualFailure,
    ).toBe(28);
  });
});
