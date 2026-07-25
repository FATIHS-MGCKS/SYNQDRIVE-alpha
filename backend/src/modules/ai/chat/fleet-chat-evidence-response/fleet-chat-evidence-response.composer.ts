import type { FleetChatResponseType } from './fleet-chat-evidence-response.enums';
import type {
  FleetChatEvidenceApiResponse,
  FleetChatEvidenceComposeInput,
  FleetChatEvidencePrepareResult,
  FleetChatEvidenceSummaryItem,
  FleetChatResponseAction,
  FleetChatResponseSourceRef,
} from './fleet-chat-evidence-response.types';
import {
  collectInconsistencyFlags,
  collectWarnings,
  hasPermissionDenied,
  resolveDataFreshness,
  resolveVehicleRef,
} from './fleet-chat-evidence-context.util';
import { buildDeterministicFallback } from './fleet-chat-evidence-response.fallback';
import {
  buildEvidenceLlmUserContext,
  buildEvidenceSummaryItems,
  validateLlmVisibleText,
} from './fleet-chat-evidence-llm-input.builder';

function resolveResponseType(input: FleetChatEvidenceComposeInput): FleetChatResponseType {
  if (input.route.clarificationNeeded) {
    return 'AMBIGUITY_QUESTION';
  }
  if (input.route.primaryIntent === 'UNSUPPORTED') {
    return 'TEMPORARY_UNAVAILABLE';
  }
  if (hasPermissionDenied(input.toolRecords)) {
    return 'PERMISSION_RESTRICTED';
  }
  const inconsistency = collectInconsistencyFlags(input.toolRecords);
  if (inconsistency.length > 0) {
    return 'INCONSISTENT_STATE';
  }
  if (input.partial && input.toolRecords.every((record) => record.outcome.data == null)) {
    return 'PARTIAL_DATA';
  }

  switch (input.route.primaryIntent) {
    case 'VEHICLE_LOCATION':
      return 'LOCATION_SUMMARY';
    case 'VEHICLE_HEALTH':
      return 'HEALTH_SUMMARY';
    case 'OVERDUE_RETURN_EXPLANATION':
      return 'OVERDUE_EXPLANATION';
    case 'VEHICLE_BOOKING_CONTEXT':
      return 'BOOKING_SUMMARY';
    case 'COMBINED_VEHICLE_STATUS':
      return 'COMBINED_SUMMARY';
    case 'AMBIGUOUS':
      return 'AMBIGUITY_QUESTION';
    default:
      return 'DIRECT_ANSWER';
  }
}

function buildSources(records: FleetChatEvidenceComposeInput['toolRecords']): FleetChatResponseSourceRef[] {
  const labels: Record<string, string> = {
    get_vehicle_location: 'Vehicle location (domain tool)',
    get_vehicle_health_summary: 'Vehicle health summary (domain tool)',
    explain_overdue_return: 'Overdue return explanation (domain tool)',
    get_vehicle_booking_context: 'Vehicle booking context (domain tool)',
    get_vehicle_telemetry_status: 'Telemetry status (domain tool)',
  };
  return records.map((record) => ({
    tool: record.toolName,
    label: labels[record.toolName] ?? record.toolName,
  }));
}

function buildActions(
  input: FleetChatEvidenceComposeInput,
  responseType: FleetChatResponseType,
): FleetChatResponseAction[] | undefined {
  if (responseType === 'PERMISSION_RESTRICTED') {
    return [
      {
        kind: 'request_access',
        messageDe: 'Berechtigung für das betroffene Modul in SynqDrive anfordern.',
        messageEn: 'Request access for the required module in SynqDrive.',
      },
    ];
  }
  if (responseType === 'AMBIGUITY_QUESTION') {
    return [
      {
        kind: 'clarify_vehicle',
        messageDe: 'Bitte Kennzeichen oder eindeutigen Fahrzeugnamen nennen.',
        messageEn: 'Please specify license plate or unique vehicle name.',
      },
    ];
  }
  if (responseType === 'OVERDUE_EXPLANATION') {
    return [
      {
        kind: 'review_return_process',
        messageDe: 'Rückgabeprozess und offene Handover-Schritte prüfen.',
        messageEn: 'Review return process and open handover steps.',
      },
    ];
  }
  if (responseType === 'HEALTH_SUMMARY') {
    const health = input.toolRecords.find((r) => r.toolName === 'get_vehicle_health_summary');
    const blockers = (health?.outcome.data as { readyToRentBlockers?: string[] } | null)
      ?.readyToRentBlockers;
    if (blockers && blockers.length > 0) {
      return [
        {
          kind: 'review_health_blockers',
          messageDe: 'Mietblocker im Fahrzeug-Health-Modul prüfen.',
          messageEn: 'Review rental blockers in vehicle health.',
        },
      ];
    }
  }
  return undefined;
}

function toEvidenceSummaryItems(
  items: ReturnType<typeof buildEvidenceSummaryItems>,
): FleetChatEvidenceSummaryItem[] {
  return items.map((item) => ({
    source: item.source,
    summary: item.summary,
    freshness: item.freshness,
    availability: item.availability,
  }));
}

export function prepareFleetChatEvidenceResponse(
  input: FleetChatEvidenceComposeInput,
): FleetChatEvidencePrepareResult {
  const responseType = resolveResponseType(input);

  if (responseType === 'AMBIGUITY_QUESTION' && input.route.clarificationNeeded) {
    const clarification = input.route.clarificationNeeded;
    return {
      directResponse:
        input.language === 'de' ? clarification.messageDe : clarification.messageEn,
      llmUserContext: null,
      skipLlm: true,
      responseType,
    };
  }

  if (responseType === 'TEMPORARY_UNAVAILABLE' && input.route.primaryIntent === 'UNSUPPORTED') {
    return {
      directResponse:
        input.language === 'de'
          ? 'Diese Anfrage kann ich im Flotten-Assistenten nicht beantworten.'
          : 'I cannot answer this request in the fleet assistant.',
      llmUserContext: null,
      skipLlm: true,
      responseType,
    };
  }

  if (input.toolRecords.length === 0 && responseType === 'DIRECT_ANSWER') {
    return {
      directResponse:
        input.language === 'de'
          ? 'Ich konnte keine passenden Domain-Daten laden.'
          : 'I could not load matching domain data.',
      llmUserContext: null,
      skipLlm: true,
      responseType: 'PARTIAL_DATA',
    };
  }

  return {
    directResponse: null,
    llmUserContext: buildEvidenceLlmUserContext(input, responseType),
    skipLlm: false,
    responseType,
  };
}

export function finalizeFleetChatEvidenceResponse(
  input: FleetChatEvidenceComposeInput,
  responseType: FleetChatResponseType,
  llmRawText: string | null,
): FleetChatEvidenceApiResponse {
  const fallback = buildDeterministicFallback(input, responseType);
  let usedDeterministicFallback = true;
  let visibleText = fallback;

  if (llmRawText?.trim()) {
    const validation = validateLlmVisibleText(input, llmRawText, responseType);
    if (validation.valid) {
      visibleText = llmRawText.trim();
      usedDeterministicFallback = false;
    }
  }

  const freshness = resolveDataFreshness(input.toolRecords);
  const vehicle = resolveVehicleRef(input.toolRecords);

  return {
    text: visibleText,
    responseType,
    vehicle: {
      displayName: vehicle.displayName ?? input.route.vehicleReferences[0]?.displayName ?? null,
      licensePlate: vehicle.licensePlate ?? input.route.vehicleReferences[0]?.licensePlate ?? null,
    },
    dataFreshness: {
      freshness: freshness.freshness,
      observedAt: freshness.observedAt,
      isLastKnown: freshness.isLastKnown,
      label: freshness.label,
    },
    sources: buildSources(input.toolRecords),
    warnings: collectWarnings(input.toolRecords),
    partial: input.partial || usedDeterministicFallback,
    generatedAt: new Date().toISOString(),
    correlationId: input.correlationId,
    actions: buildActions(input, responseType),
    evidenceSummary: toEvidenceSummaryItems(buildEvidenceSummaryItems(input.toolRecords)),
    usedDeterministicFallback: usedDeterministicFallback,
  };
}

export function composeFleetChatEvidenceResponse(
  input: FleetChatEvidenceComposeInput,
): FleetChatEvidenceApiResponse {
  const responseType = resolveResponseType(input);
  const fallback = buildDeterministicFallback(input, responseType);
  return finalizeFleetChatEvidenceResponse(input, responseType, input.llmRawText ?? fallback);
}
