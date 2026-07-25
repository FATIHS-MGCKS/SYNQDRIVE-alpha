import type { FleetChatEvidenceApiResponse } from './fleet-chat-evidence-response/fleet-chat-evidence-response.types';
import type { FleetChatResponseType } from './fleet-chat-evidence-response/fleet-chat-evidence-response.enums';

/** Persisted + API payload for assistant messages (no internal tool ids in client view). */
export interface ChatFleetStructuredPayload {
  readonly responseType: FleetChatResponseType;
  readonly vehicle: FleetChatEvidenceApiResponse['vehicle'];
  readonly dataFreshness: FleetChatEvidenceApiResponse['dataFreshness'];
  readonly sources: readonly { readonly label: string }[];
  readonly warnings: readonly string[];
  readonly partial: boolean;
  readonly generatedAt: string;
  readonly actions?: FleetChatEvidenceApiResponse['actions'];
  readonly usedDeterministicFallback: boolean;
}

export interface ChatMessageResultDto {
  readonly id?: string;
  readonly role: string;
  readonly content: string;
  readonly createdAt: string;
  readonly structured?: ChatFleetStructuredPayload;
}

export interface ChatStreamErrorDto {
  readonly message: string;
  readonly technicalDetails?: {
    readonly correlationId?: string;
    readonly code?: string;
  };
}

const USER_FRIENDLY_SOURCE_LABELS: Record<string, string> = {
  get_vehicle_location: 'Fahrzeugposition',
  get_vehicle_health_summary: 'Fahrzeug-Gesundheit',
  explain_overdue_return: 'Überfällige Rückgabe',
  get_vehicle_booking_context: 'Buchungskontext',
  get_vehicle_telemetry_status: 'Telemetrie-Status',
};

export function toClientStructuredPayload(
  structured: FleetChatEvidenceApiResponse,
): ChatFleetStructuredPayload {
  return {
    responseType: structured.responseType,
    vehicle: structured.vehicle,
    dataFreshness: structured.dataFreshness,
    sources: structured.sources.map((source) => ({
      label: source.label?.trim()
        ? source.label
        : (USER_FRIENDLY_SOURCE_LABELS[source.tool] ?? 'Flottendaten'),
    })),
    warnings: structured.warnings,
    partial: structured.partial,
    generatedAt: structured.generatedAt,
    actions: structured.actions,
    usedDeterministicFallback: structured.usedDeterministicFallback,
  };
}

export function parseStoredStructuredPayload(
  value: unknown,
): ChatFleetStructuredPayload | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.responseType !== 'string') return undefined;
  return raw as unknown as ChatFleetStructuredPayload;
}
