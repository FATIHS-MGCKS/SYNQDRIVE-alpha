/** Controlled Fleet Chat intent taxonomy — Prompt 16/32. */
export const FLEET_CHAT_INTENTS = [
  'VEHICLE_LOCATION',
  'VEHICLE_TELEMETRY_STATUS',
  'VEHICLE_HEALTH',
  'OVERDUE_RETURN_EXPLANATION',
  'VEHICLE_BOOKING_CONTEXT',
  'COMBINED_VEHICLE_STATUS',
  'SYNQDRIVE_KNOWLEDGE',
  'GENERAL_FLEET_QUESTION',
  'UNSUPPORTED',
  'AMBIGUOUS',
] as const;

export type FleetChatIntent = (typeof FLEET_CHAT_INTENTS)[number];

export const FLEET_CHAT_SECURITY_FLAGS = [
  'prompt_injection_attempt',
  'tool_name_in_user_text',
  'suspicious_identifier_in_text',
  'vehicle_resolution_ambiguous',
  'vehicle_not_in_tenant',
  'multiple_vehicle_references',
] as const;

export type FleetChatSecurityFlag = (typeof FLEET_CHAT_SECURITY_FLAGS)[number];

export const FLEET_CHAT_CLARIFICATION_KINDS = [
  'vehicle_ambiguous',
  'vehicle_missing',
  'intent_unclear',
  'booking_missing',
] as const;

export type FleetChatClarificationKind =
  (typeof FLEET_CHAT_CLARIFICATION_KINDS)[number];

export const FLEET_CHAT_ROUTE_LANGUAGES = ['de', 'en', 'unknown'] as const;

export type FleetChatRouteLanguage = (typeof FLEET_CHAT_ROUTE_LANGUAGES)[number];

/** Minimum confidence for deterministic intent acceptance without LLM assist. */
export const FLEET_CHAT_INTENT_MIN_CONFIDENCE = 0.45;

/** Below this, optional LLM classification may be invoked (not in ChatService yet). */
export const FLEET_CHAT_INTENT_LLM_FALLBACK_THRESHOLD = 0.35;
