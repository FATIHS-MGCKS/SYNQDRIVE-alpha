import type { FleetChatAnswerScenario } from './fleet-chat-policy.constants';

export interface FleetChatScenarioRule {
  readonly scenario: FleetChatAnswerScenario;
  readonly ruleDe: string;
  readonly ruleEn: string;
}

/**
 * Compact scenario rules — injected only when the orchestrator detects the scenario.
 * The LLM must not reinterpret domain status; these rules govern phrasing only.
 */
export const FLEET_CHAT_SCENARIO_RULES: readonly FleetChatScenarioRule[] = [
  {
    scenario: 'live_position',
    ruleDe:
      'Live-Position: Nur wenn Domain-Tool live-Frische und isLastKnownLocation=false. Direkte Antwort + Zeitpunkt + Quelle nennen.',
    ruleEn:
      'Live position: only when domain tool reports live freshness and isLastKnownLocation=false. State timestamp and source.',
  },
  {
    scenario: 'last_known_position',
    ruleDe:
      'Last-Known-Position: isLastKnownLocation=true — nie „aktuell“ oder „live“ sagen. „Letzte bekannte Position“ + observedAt + Einschränkung.',
    ruleEn:
      'Last-known position: isLastKnownLocation=true — never say current/live. Use last-known wording + timestamp + limitation.',
  },
  {
    scenario: 'stale_position',
    ruleDe:
      'Veraltete Position: freshness signal_delayed/offline/no_signal — nicht als aktuell darstellen. Alter und Unsicherheit nennen.',
    ruleEn:
      'Stale position: freshness degraded — do not present as current. Mention age and uncertainty.',
  },
  {
    scenario: 'health_full',
    ruleDe:
      'Health vollständig: limitedData=false und pipeline verfügbar — Domain-Slices aus Tool zusammenfassen, nicht neu bewerten.',
    ruleEn:
      'Health full data: limitedData=false — summarize domain slices from tool only.',
  },
  {
    scenario: 'health_limited',
    ruleDe:
      'Health Limited Data: limitedData=true oder availability partial — Lücken benennen; fehlende Domänen ≠ „alles in Ordnung“.',
    ruleEn:
      'Health limited: limitedData=true or partial availability — name gaps; missing ≠ healthy.',
  },
  {
    scenario: 'overdue_return',
    ruleDe:
      'Überfällige Rückgabe: Ursache nur aus explain_overdue_return (Reason Codes, endDate). Keine eigene Fristberechnung.',
    ruleEn:
      'Overdue return: use explain_overdue_return explanation only — do not recalculate deadlines.',
  },
  {
    scenario: 'status_inconsistent',
    ruleDe:
      'Inkonsistenter Status: inconsistencyFlags aus Domain-Kontext nennen; keine Schönfärbung.',
    ruleEn:
      'Inconsistent status: surface inconsistencyFlags — do not smooth over conflicts.',
  },
  {
    scenario: 'permission_denied',
    ruleDe:
      'Fehlende Berechtigung: permission_denied — keine Details, keine Existenz leaken. Rolle/Modul in SynqDrive anfordern.',
    ruleEn:
      'Permission denied: withhold details; suggest requesting access in SynqDrive.',
  },
  {
    scenario: 'vehicle_ambiguous',
    ruleDe:
      'Mehrdeutigkeit: mehrere Fahrzeuge — Kandidaten (Kennzeichen) nennen, Nutzer um Präzisierung bitten. Nicht raten.',
    ruleEn:
      'Ambiguous vehicle: list candidate plates and ask user to clarify — never guess.',
  },
  {
    scenario: 'partial_tool_results',
    ruleDe:
      'Partielle Tool-Ergebnisse: was bekannt ist und was fehlt trennen; fehlende Teile nicht erfinden.',
    ruleEn:
      'Partial tool results: separate known vs missing — do not invent missing parts.',
  },
  {
    scenario: 'no_data_not_ok',
    ruleDe:
      'Keine Daten ≠ alles in Ordnung: data_not_available/unavailable nicht als „kein Problem“ interpretieren.',
    ruleEn:
      'No data ≠ OK: unavailable data must not be read as healthy or all-clear.',
  },
];

export const FLEET_CHAT_SCENARIO_RULE_BY_SCENARIO: Readonly<
  Record<FleetChatAnswerScenario, FleetChatScenarioRule>
> = Object.freeze(
  FLEET_CHAT_SCENARIO_RULES.reduce(
    (acc, rule) => {
      acc[rule.scenario] = rule;
      return acc;
    },
    {} as Record<FleetChatAnswerScenario, FleetChatScenarioRule>,
  ),
);
