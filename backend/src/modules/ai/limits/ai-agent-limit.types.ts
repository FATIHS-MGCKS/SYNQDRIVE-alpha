export const AI_AGENT_LIMIT_KINDS = [
  'rate_limit',
  'budget_exceeded',
  'provider_overloaded',
  'circuit_breaker_open',
  'tool_timeout',
  'request_timeout',
  'concurrency_limit',
] as const;

export type AiAgentLimitKind = (typeof AI_AGENT_LIMIT_KINDS)[number];

export interface AiAgentLimitUserMessage {
  readonly de: string;
  readonly en: string;
}

export interface AiAgentLimitDecision {
  readonly allowed: false;
  readonly kind: AiAgentLimitKind;
  readonly retryAfterSeconds: number;
  readonly scope?: 'organization' | 'user' | 'ip' | 'global';
  readonly message: AiAgentLimitUserMessage;
}

export interface AssertAiChatLimitsInput {
  readonly organizationId: string;
  readonly userId: string;
  readonly clientIp?: string | null;
  readonly correlationId: string;
  readonly locale?: 'de' | 'en' | 'unknown';
}

export interface AiChatRequestSlot {
  readonly organizationId: string;
  readonly userId: string;
  readonly slotKey: string;
}
