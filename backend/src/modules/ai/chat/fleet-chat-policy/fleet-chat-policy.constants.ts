/** Semantic version for Fleet Chat system prompt and answer rules. */
export const FLEET_CHAT_POLICY_VERSION = '1.0.0' as const;

export const FLEET_CHAT_ANSWER_SECTIONS = [
  'direct_answer',
  'reason',
  'data_timestamp',
  'freshness',
  'source',
  'limitations',
  'next_step',
] as const;

export type FleetChatAnswerSection = (typeof FLEET_CHAT_ANSWER_SECTIONS)[number];

export const FLEET_CHAT_ANSWER_SCENARIOS = [
  'live_position',
  'last_known_position',
  'stale_position',
  'health_full',
  'health_limited',
  'overdue_return',
  'status_inconsistent',
  'permission_denied',
  'vehicle_ambiguous',
  'partial_tool_results',
  'no_data_not_ok',
] as const;

export type FleetChatAnswerScenario = (typeof FLEET_CHAT_ANSWER_SCENARIOS)[number];

/** Max chars for the static system prompt block (compact). */
export const FLEET_CHAT_SYSTEM_PROMPT_MAX_CHARS = 2_400;
