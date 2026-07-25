export const FLEET_CHAT_RESPONSE_TYPES = [
  'DIRECT_ANSWER',
  'LOCATION_SUMMARY',
  'HEALTH_SUMMARY',
  'OVERDUE_EXPLANATION',
  'BOOKING_SUMMARY',
  'COMBINED_SUMMARY',
  'PARTIAL_DATA',
  'INCONSISTENT_STATE',
  'PERMISSION_RESTRICTED',
  'AMBIGUITY_QUESTION',
  'TEMPORARY_UNAVAILABLE',
] as const;

export type FleetChatResponseType = (typeof FLEET_CHAT_RESPONSE_TYPES)[number];

export interface FleetChatDataFreshnessSummary {
  freshness: string;
  observedAt: string | null;
  isLastKnown: boolean;
  label: string | null;
}

export interface FleetChatStructuredPayload {
  responseType: FleetChatResponseType;
  vehicle: { displayName: string | null; licensePlate: string | null } | null;
  dataFreshness: FleetChatDataFreshnessSummary;
  sources: { label: string }[];
  warnings: string[];
  partial: boolean;
  generatedAt: string;
  actions?: {
    kind: string;
    messageDe: string;
    messageEn: string;
  }[];
  usedDeterministicFallback: boolean;
}

export interface ChatStreamTechnicalDetails {
  correlationId?: string;
  code?: string;
}

export interface ChatMessageResponse {
  id?: string;
  role: string;
  content: string;
  createdAt: string;
  structured?: FleetChatStructuredPayload;
}

export interface ChatStreamErrorPayload {
  message: string;
  technicalDetails?: ChatStreamTechnicalDetails;
}
