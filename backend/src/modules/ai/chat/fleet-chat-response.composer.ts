import type { FleetChatComposerInput } from './fleet-chat-orchestrator.types';
import { buildActiveRulesBlock } from './fleet-chat-policy';

export interface FleetChatComposedResponse {
  readonly directResponse: string | null;
  readonly llmUserContext: string | null;
  readonly skipLlm: boolean;
}

export function composeFleetChatResponse(
  input: FleetChatComposerInput,
): FleetChatComposedResponse {
  if (input.route.clarificationNeeded) {
    const clarification = input.route.clarificationNeeded;
    const text =
      input.language === 'de' ? clarification.messageDe : clarification.messageEn;
    return {
      directResponse: text,
      llmUserContext: null,
      skipLlm: true,
    };
  }

  if (input.route.primaryIntent === 'UNSUPPORTED') {
    return {
      directResponse:
        input.language === 'de'
          ? 'Diese Anfrage kann ich im Flotten-Assistenten nicht beantworten. Bitte stellen Sie eine fahrzeug- oder flottenbezogene Frage.'
          : 'I cannot answer this request in the fleet assistant. Please ask a fleet- or vehicle-related question.',
      llmUserContext: null,
      skipLlm: true,
    };
  }

  if (
    input.toolRecords.length === 0 &&
    (input.route.primaryIntent === 'SYNQDRIVE_KNOWLEDGE' ||
      input.route.primaryIntent === 'GENERAL_FLEET_QUESTION')
  ) {
    return {
      directResponse: null,
      llmUserContext: buildGeneralKnowledgeContext(input),
      skipLlm: false,
    };
  }

  if (input.toolRecords.length === 0) {
    return {
      directResponse:
        input.language === 'de'
          ? 'Ich konnte keine passenden Domain-Daten laden. Bitte präzisieren Sie Ihre Frage.'
          : 'I could not load matching domain data. Please rephrase your question.',
      llmUserContext: null,
      skipLlm: true,
    };
  }

  const lines: string[] = [
    `User (${input.language}): ${input.userMessage.slice(0, 500)}`,
    `Primary intent: ${input.route.primaryIntent}`,
  ];

  if (input.route.vehicleReferences[0]?.displayName) {
    lines.push(
      `Vehicle: ${input.route.vehicleReferences[0].displayName} (${input.route.vehicleReferences[0].licensePlate ?? 'no plate'})`,
    );
  }

  if (input.partial) {
    lines.push(
      input.language === 'de'
        ? 'Hinweis: Teilweise Daten — fehlende Fakten nicht erfinden.'
        : 'Note: partial data — do not invent missing facts.',
    );
  }

  for (const summary of input.evidenceSummaries.slice(0, 14)) {
    lines.push(`[${summary.source}] ${summary.summary}`);
  }

  const rulesBlock =
    input.activeScenarios && input.activeScenarios.length > 0
      ? buildActiveRulesBlock(input.language, input.activeScenarios)
      : null;
  if (rulesBlock) {
    lines.push(rulesBlock);
  }

  return {
    directResponse: null,
    llmUserContext: lines.join('\n').slice(0, 6_000),
    skipLlm: false,
  };
}

function buildGeneralKnowledgeContext(input: FleetChatComposerInput): string {
  const lines = [
    `User (${input.language}): ${input.userMessage.slice(0, 500)}`,
    `Intent: ${input.route.primaryIntent}`,
    'Mode: grounded fleet assistant — use only provided facts.',
  ];
  return lines.join('\n');
}
