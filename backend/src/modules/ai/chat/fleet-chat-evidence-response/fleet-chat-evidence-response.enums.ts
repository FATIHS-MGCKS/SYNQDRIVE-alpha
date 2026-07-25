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

export const FLEET_CHAT_RESPONSE_ACTION_KINDS = [
  'clarify_vehicle',
  'clarify_booking',
  'review_return_process',
  'review_health_blockers',
  'request_access',
] as const;

export type FleetChatResponseActionKind = (typeof FLEET_CHAT_RESPONSE_ACTION_KINDS)[number];
