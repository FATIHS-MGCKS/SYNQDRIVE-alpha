import { FLEET_AI_FLOW_SCENARIOS } from '../__fixtures__/fleet-ai-flow.fixtures';
import { runPipelineScenario } from '../__fixtures__/fleet-ai-pipeline.harness';
import { buildFleetAiContext } from '../__fixtures__/fleet-ai-test.fixtures';

describe('Fleet AI full data flow — integration', () => {
  for (const scenario of FLEET_AI_FLOW_SCENARIOS) {
    describe(`${scenario.category}: ${scenario.id}`, () => {
      it.each([
        ['de', scenario.messages.de],
        ['en', scenario.messages.en],
      ])('locale=%s', async (locale, message) => {
        const result = await runPipelineScenario({
          route: scenario.route(locale as 'de' | 'en'),
          toolOutcomes: scenario.toolOutcomes,
          message,
          locale: locale as 'de' | 'en',
          useDeterministicFallback: scenario.useDeterministicFallback ?? true,
        });

        if (scenario.expectNoStructuredResponse) {
          expect(result.structuredResponse).toBeUndefined();
        } else {
          expect(result.structuredResponse?.responseType).toBe(scenario.expectedResponseType);
        }
        expect(result.responseText).toMatch(scenario.textPattern);
        expect(result.responseText).not.toMatch(
          /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
        );
      });
    });
  }

  it('records audit metadata for a representative health flow', async () => {
    const scenario = FLEET_AI_FLOW_SCENARIOS.find((entry) => entry.id === 'health-unremarkable')!;
    const result = await runPipelineScenario({
      route: scenario.route('de'),
      toolOutcomes: scenario.toolOutcomes,
      message: scenario.messages.de,
      locale: 'de',
      useDeterministicFallback: true,
    });

    expect(result.audit.organizationId).toBe(buildFleetAiContext().organizationId);
    expect(result.audit.toolsRequested.length).toBeGreaterThan(0);
    expect(result.performance.totalMs).toBeGreaterThanOrEqual(0);
  });
});
