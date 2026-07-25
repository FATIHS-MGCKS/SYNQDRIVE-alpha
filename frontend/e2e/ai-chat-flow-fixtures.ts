/** Controlled SSE fixtures for AI chat flow E2E — no production customer data. */

export type FlowStreamScenarioId =
  | 'location-fresh'
  | 'health-limited'
  | 'overdue-true'
  | 'combined-location-overdue'
  | 'permission-denied'
  | 'default';

export interface FlowStreamScenario {
  readonly id: FlowStreamScenarioId;
  readonly matchers: RegExp[];
  readonly resultContentDe: string;
  readonly resultContentEn: string;
  readonly structured: Record<string, unknown>;
}

const PLATE = 'WOB-L 7503';

export const FLOW_STREAM_SCENARIOS: readonly FlowStreamScenario[] = [
  {
    id: 'combined-location-overdue',
    matchers: [/und warum überfällig|and why overdue/i],
    resultContentDe: `Kombinierte Fahrzeugzusammenfassung:\nLive-Position für ${PLATE}`,
    resultContentEn: `Combined vehicle summary:\nLive position for ${PLATE}`,
    structured: {
      responseType: 'COMBINED_SUMMARY',
      vehicle: { displayName: 'VW Tiguan 2021', licensePlate: PLATE },
      dataFreshness: {
        freshness: 'live',
        observedAt: '2026-07-24T10:00:00.000Z',
        isLastKnown: false,
        label: 'live_position',
      },
      sources: [
        { label: 'Vehicle location (domain tool)' },
        { label: 'Overdue return explanation (domain tool)' },
      ],
      warnings: [],
      partial: false,
      generatedAt: '2026-07-24T10:05:00.000Z',
      usedDeterministicFallback: true,
      compactSummary: {
        headline: 'Kombinierte Übersicht',
        statusTone: 'warning',
        facts: [
          { id: 'location', label: 'Position', value: '52.42, 10.78', tone: 'info' },
          { id: 'overdue', label: 'Rückgabe', value: 'überfällig', tone: 'critical' },
        ],
      },
    },
  },
  {
    id: 'location-fresh',
    matchers: [/aktuell|currently\?/i],
    resultContentDe: `Live-Position für ${PLATE}: 52.42345, 10.78654. Beobachtet: 2026-07-24T10:00:00.000Z (Frische: live).`,
    resultContentEn: `Live position for ${PLATE}: 52.42345, 10.78654. Observed: 2026-07-24T10:00:00.000Z (freshness: live).`,
    structured: {
      responseType: 'LOCATION_SUMMARY',
      vehicle: { displayName: 'VW Tiguan 2021', licensePlate: PLATE },
      dataFreshness: {
        freshness: 'live',
        observedAt: '2026-07-24T10:00:00.000Z',
        isLastKnown: false,
        label: 'live_position',
      },
      sources: [{ label: 'Vehicle location (domain tool)' }],
      warnings: [],
      partial: false,
      generatedAt: '2026-07-24T10:05:00.000Z',
      usedDeterministicFallback: true,
      compactSummary: {
        headline: 'Live-Position',
        statusTone: 'info',
        facts: [
          { id: 'coords', label: 'Koordinaten', value: '52.42345, 10.78654', tone: 'info' },
        ],
      },
    },
  },
  {
    id: 'health-limited',
    matchers: [/Limited Data|limited data|Limited data/i],
    resultContentDe: `Gesundheit für ${PLATE}: Limited Data — Gesamtstatus unknown.`,
    resultContentEn: `Health for ${PLATE}: Limited Data — overall unknown.`,
    structured: {
      responseType: 'HEALTH_SUMMARY',
      vehicle: { displayName: 'VW Tiguan 2021', licensePlate: PLATE },
      dataFreshness: {
        freshness: 'signal_delayed',
        observedAt: '2026-07-24T09:00:00.000Z',
        isLastKnown: true,
        label: 'limited_data',
      },
      sources: [{ label: 'Vehicle health summary (domain tool)' }],
      warnings: ['Begrenzte Datenlage'],
      partial: true,
      generatedAt: '2026-07-24T10:05:00.000Z',
      usedDeterministicFallback: true,
      compactSummary: {
        headline: 'Limited Data',
        statusTone: 'warning',
        facts: [{ id: 'status', label: 'Gesamtstatus', value: 'unknown', tone: 'warning' }],
      },
    },
  },
  {
    id: 'overdue-true',
    matchers: [/überfällig|overdue/i],
    resultContentDe: `Überfällige Rückgabe für ${PLATE}: Rückgabefrist überschritten.`,
    resultContentEn: `Overdue return for ${PLATE}: return deadline passed.`,
    structured: {
      responseType: 'OVERDUE_EXPLANATION',
      vehicle: { displayName: 'VW Tiguan 2021', licensePlate: PLATE },
      dataFreshness: {
        freshness: 'not_applicable',
        observedAt: null,
        isLastKnown: false,
        label: null,
      },
      sources: [{ label: 'Overdue return explanation (domain tool)' }],
      warnings: [],
      partial: false,
      generatedAt: '2026-07-24T10:05:00.000Z',
      usedDeterministicFallback: true,
      compactSummary: {
        headline: 'Überfällige Rückgabe',
        statusTone: 'critical',
        facts: [{ id: 'reason', label: 'Ursache', value: 'RETURN_DEADLINE_PASSED', tone: 'critical' }],
      },
    },
  },
  {
    id: 'permission-denied',
    matchers: [/ohne Rolle|restricted role|Berechtigung/i],
    resultContentDe: 'Für diese Anfrage fehlen Berechtigungen.',
    resultContentEn: 'Permission denied for this request.',
    structured: {
      responseType: 'PERMISSION_RESTRICTED',
      vehicle: { displayName: 'VW Tiguan 2021', licensePlate: PLATE },
      dataFreshness: {
        freshness: 'not_applicable',
        observedAt: null,
        isLastKnown: false,
        label: null,
      },
      sources: [{ label: 'Vehicle health summary (domain tool)' }],
      warnings: [],
      partial: true,
      generatedAt: '2026-07-24T10:05:00.000Z',
      usedDeterministicFallback: true,
      compactSummary: {
        headline: 'Berechtigung eingeschränkt',
        statusTone: 'warning',
        facts: [{ id: 'perm', label: 'Zugriff', value: 'eingeschränkt', tone: 'warning' }],
      },
      actions: [
        {
          kind: 'request_access',
          messageDe: 'Berechtigung anfordern',
          messageEn: 'Request access',
        },
      ],
    },
  },
];

export function resolveFlowStreamScenario(message: string): FlowStreamScenario {
  const hit = FLOW_STREAM_SCENARIOS.find((scenario) =>
    scenario.matchers.some((matcher) => matcher.test(message)),
  );
  return hit ?? {
    id: 'default',
    matchers: [],
    resultContentDe: 'Ich konnte keine passenden Domain-Daten laden.',
    resultContentEn: 'I could not load matching domain data.',
    structured: {
      responseType: 'PARTIAL_DATA',
      partial: true,
      warnings: [],
      sources: [],
      generatedAt: new Date().toISOString(),
      usedDeterministicFallback: true,
      dataFreshness: {
        freshness: 'not_applicable',
        observedAt: null,
        isLastKnown: false,
        label: null,
      },
    },
  };
}

export function buildFlowSseBody(scenario: FlowStreamScenario): string {
  const resultPayload = {
    id: `flow-${scenario.id}-${Date.now()}`,
    role: 'assistant',
    content: scenario.resultContentDe,
    createdAt: new Date().toISOString(),
    structured: scenario.structured,
  };

  return [
    `event: status\ndata: ${JSON.stringify({ agentReady: true })}\n\n`,
    `event: progress\ndata: ${JSON.stringify({ type: 'thinking', content: 'Analysing domain tools…' })}\n\n`,
    `event: result\ndata: ${JSON.stringify(resultPayload)}\n\n`,
  ].join('');
}

export function flowMessageForScenario(
  scenarioId: FlowStreamScenarioId,
  locale: 'de' | 'en',
): string {
  switch (scenarioId) {
    case 'location-fresh':
      return locale === 'de' ? `Wo steht ${PLATE} aktuell?` : `Where is ${PLATE} currently?`;
    case 'health-limited':
      return locale === 'de' ? `Limited Data ${PLATE}` : `Limited data ${PLATE}`;
    case 'overdue-true':
      return locale === 'de' ? `Warum überfällig ${PLATE}?` : `Why overdue ${PLATE}?`;
    case 'combined-location-overdue':
      return locale === 'de'
        ? `Wo steht ${PLATE} und warum überfällig?`
        : `Where is ${PLATE} and why overdue?`;
    case 'permission-denied':
      return locale === 'de' ? `Gesundheit ohne Rolle ${PLATE}` : `Health restricted role ${PLATE}`;
    default:
      return 'Test';
  }
}
