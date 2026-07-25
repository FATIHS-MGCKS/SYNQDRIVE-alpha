/**
 * Prompt 32 — Post-deployment acceptance matrix (WOB-L 7503 fixtures).
 * Validates orchestrator + evidence path with deterministic fallback (no live Mistral).
 */
import { runPipelineScenario } from '../__fixtures__/fleet-ai-pipeline.harness';
import {
  FLEET_AI_FLOW_SCENARIOS,
  type FleetAiFlowScenario,
} from '../__fixtures__/fleet-ai-flow.fixtures';

const PLATE = 'WOB-L 7503';

const ACCEPTANCE_CASES: Array<{
  id: string;
  questionDe: string;
  scenarioId: string;
  locale: 'de' | 'en';
}> = [
  {
    id: 'Q1-location-current',
    questionDe: `Wo befindet sich ${PLATE} aktuell?`,
    scenarioId: 'location-fresh',
    locale: 'de',
  },
  {
    id: 'Q2-live-vs-last-known',
    questionDe: 'Ist die Position live oder nur zuletzt bekannt?',
    scenarioId: 'location-last-known',
    locale: 'de',
  },
  {
    id: 'Q3-position-age',
    questionDe: 'Wie alt ist die Position?',
    scenarioId: 'location-stale',
    locale: 'de',
  },
  {
    id: 'Q4-health-status',
    questionDe: `Wie ist die Fahrzeuggesundheit von ${PLATE}?`,
    scenarioId: 'health-unremarkable',
    locale: 'de',
  },
  {
    id: 'Q5-health-missing',
    questionDe: 'Welche Health-Daten fehlen oder sind veraltet?',
    scenarioId: 'health-limited-data',
    locale: 'de',
  },
  {
    id: 'Q6-dtc-warning',
    questionDe: 'Gibt es aktive DTCs oder Warnleuchten?',
    scenarioId: 'health-critical-dtc',
    locale: 'de',
  },
  {
    id: 'Q7-overdue-why',
    questionDe: `Warum wird ${PLATE} als überfällige Rückgabe angezeigt?`,
    scenarioId: 'overdue-true',
    locale: 'de',
  },
  {
    id: 'Q8-booking-cause',
    questionDe: 'Welche Buchung verursacht den Status?',
    scenarioId: 'overdue-true',
    locale: 'de',
  },
  {
    id: 'Q9-extension',
    questionDe: 'Wurde eine Verlängerung berücksichtigt?',
    scenarioId: 'overdue-extension-approved',
    locale: 'de',
  },
  {
    id: 'Q10-inconsistent',
    questionDe: 'Ist der Status möglicherweise inkonsistent?',
    scenarioId: 'overdue-stale-runtime',
    locale: 'de',
  },
  {
    id: 'Q11-combined-summary',
    questionDe: 'Fasse Standort, Telemetrie, Buchung und Gesundheit zusammen.',
    scenarioId: 'combined-full-summary',
    locale: 'de',
  },
  {
    id: 'Q12-admin-plain-de',
    questionDe: `Erkläre den Zustand von ${PLATE} für einen Org-Admin verständlich.`,
    scenarioId: 'combined-full-summary',
    locale: 'de',
  },
];

function findScenario(id: string): FleetAiFlowScenario {
  const scenario = FLEET_AI_FLOW_SCENARIOS.find((entry) => entry.id === id);
  if (!scenario) throw new Error(`Missing fixture scenario: ${id}`);
  return scenario;
}

describe('Fleet AI acceptance — WOB-L 7503 (Prompt 32)', () => {
  for (const acceptance of ACCEPTANCE_CASES) {
    it(`${acceptance.id}: ${acceptance.questionDe.slice(0, 48)}…`, async () => {
      const scenario = findScenario(acceptance.scenarioId);
      const locale = acceptance.locale;
      const message =
        locale === 'de' ? acceptance.questionDe : scenario.messages.en;

      const result = await runPipelineScenario({
        route: scenario.route(locale),
        toolOutcomes: scenario.toolOutcomes,
        message,
        locale,
        useDeterministicFallback: scenario.useDeterministicFallback ?? true,
      });

      if (scenario.expectNoStructuredResponse) {
        expect(result.structuredResponse).toBeUndefined();
      } else {
        expect(result.structuredResponse?.responseType).toBe(scenario.expectedResponseType);
        expect(result.structuredResponse?.sources?.length).toBeGreaterThanOrEqual(0);
        expect(result.structuredResponse?.dataFreshness).toBeDefined();
      }
      expect(result.responseText).toMatch(scenario.textPattern);
      expect(result.responseText).not.toMatch(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
      );
      expect(result.responseText).not.toMatch(/DIMO Agent|dimo agent/i);
      expect(result.performance.totalMs).toBeLessThan(5000);
    });
  }

  it('EN mirror: location fresh', async () => {
    const scenario = findScenario('location-fresh');
    const result = await runPipelineScenario({
      route: scenario.route('en'),
      toolOutcomes: scenario.toolOutcomes,
      message: scenario.messages.en,
      locale: 'en',
      useDeterministicFallback: true,
    });
    expect(result.responseText).toMatch(/Live position|52\.42/i);
    expect(result.structuredResponse?.responseType).toBe('LOCATION_SUMMARY');
  });

  it('provider outage: location timeout uses partial deterministic path', async () => {
    const scenario = findScenario('location-provider-timeout');
    const result = await runPipelineScenario({
      route: scenario.route('de'),
      toolOutcomes: scenario.toolOutcomes,
      message: scenario.messages.de,
      locale: 'de',
      useDeterministicFallback: true,
    });
    expect(result.structuredResponse?.responseType).toBe('PARTIAL_DATA');
    expect(result.partial).toBe(true);
  });
});
