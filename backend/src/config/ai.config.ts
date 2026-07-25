import { registerAs } from '@nestjs/config';

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function parsePositiveIntEnv(value: string | undefined, defaultValue: number): number {
  if (value == null || value.trim() === '') return defaultValue;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function parseUuidAllowlist(value: string | undefined): string[] {
  if (value == null || value.trim() === '') return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export type AiProviderId = 'mistral';

export default registerAs('ai', () => ({
  /** Active LLM provider (`mistral` is the first supported backend). */
  provider: (process.env.AI_PROVIDER?.trim().toLowerCase() || 'mistral') as AiProviderId,
  mistralApiKey: process.env.MISTRAL_API_KEY ?? '',
  mistralBaseUrl: process.env.MISTRAL_BASE_URL?.trim() || undefined,
  mistralRouterModel: process.env.MISTRAL_ROUTER_MODEL?.trim() || 'mistral-small-latest',
  mistralChatModel: process.env.MISTRAL_CHAT_MODEL?.trim() || 'mistral-large-latest',
  mistralJsonModel: process.env.MISTRAL_JSON_MODEL?.trim() || 'mistral-small-latest',
  mistralReasoningModel: process.env.MISTRAL_REASONING_MODEL?.trim() || 'mistral-large-latest',
  mistralOcrModel: process.env.MISTRAL_OCR_MODEL?.trim() || 'mistral-ocr-latest',
  mistralOcrTimeoutMs: parsePositiveIntEnv(process.env.MISTRAL_OCR_TIMEOUT_MS, 120_000),
  mistralOcrMaxFileBytes: parsePositiveIntEnv(
    process.env.MISTRAL_OCR_MAX_FILE_BYTES,
    10 * 1024 * 1024,
  ),
  streamingEnabled: parseBooleanEnv(process.env.AI_STREAMING_ENABLED, true),
  /** When true, outbound customer communication (WhatsApp/email) must pass approval policy. */
  externalActionsRequireApproval: parseBooleanEnv(process.env.AI_EXTERNAL_ACTIONS_REQUIRE_APPROVAL, true),
  /** Persist revision-grade AI request audit rows (default on). */
  auditLoggingEnabled: parseBooleanEnv(process.env.AI_AUDIT_LOGGING_ENABLED, true),
  /** Store raw userId in audit rows; default false — pseudonym ref only. */
  auditStorePlainUserId: parseBooleanEnv(process.env.AI_AUDIT_STORE_PLAIN_USER_ID, false),
  /** HMAC pepper for pseudonymized user refs — falls back to JWT_SECRET when unset. */
  auditUserRefPepper: process.env.AI_AUDIT_USER_REF_PEPPER?.trim() || '',
  /** Retention window for AI audit rows (days). */
  auditRetentionDays: parsePositiveIntEnv(process.env.AI_AUDIT_RETENTION_DAYS, 730),
  /** When true, emit verbose debug audit lines (never in production by default). */
  auditDebugLogging: parseBooleanEnv(process.env.AI_AUDIT_DEBUG_LOGGING, false),
  /** Master switch for Fleet AI agent limits, cache, and budgets. */
  agentLimitsEnabled: parseBooleanEnv(process.env.AI_AGENT_LIMITS_ENABLED, true),
  agentLimitsFailOpen: parseBooleanEnv(process.env.AI_AGENT_LIMITS_FAIL_OPEN, true),
  agentRateLimitEnabled: parseBooleanEnv(process.env.AI_AGENT_RATE_LIMIT_ENABLED, true),
  agentRateLimitWindowMs: parsePositiveIntEnv(process.env.AI_AGENT_RATE_LIMIT_WINDOW_MS, 60_000),
  agentRateLimitPerUserPerMinute: parsePositiveIntEnv(
    process.env.AI_AGENT_RATE_LIMIT_PER_USER_PER_MINUTE,
    30,
  ),
  agentRateLimitPerOrgPerMinute: parsePositiveIntEnv(
    process.env.AI_AGENT_RATE_LIMIT_PER_ORG_PER_MINUTE,
    120,
  ),
  agentRateLimitPerIpPerMinute: parsePositiveIntEnv(
    process.env.AI_AGENT_RATE_LIMIT_PER_IP_PER_MINUTE,
    60,
  ),
  agentMaxConcurrentPerOrg: parsePositiveIntEnv(process.env.AI_AGENT_MAX_CONCURRENT_PER_ORG, 5),
  agentMaxConcurrentPerUser: parsePositiveIntEnv(process.env.AI_AGENT_MAX_CONCURRENT_PER_USER, 2),
  agentMaxToolInvocationsPerChatRequest: parsePositiveIntEnv(
    process.env.AI_AGENT_MAX_TOOL_INVOCATIONS_PER_CHAT,
    8,
  ),
  agentMaxLlmRetries: parsePositiveIntEnv(process.env.AI_AGENT_MAX_LLM_RETRIES, 1),
  agentMaxTokensPerLlmCall: parsePositiveIntEnv(process.env.AI_AGENT_MAX_TOKENS_PER_LLM_CALL, 768),
  agentTokenBudgetEnabled: parseBooleanEnv(process.env.AI_AGENT_TOKEN_BUDGET_ENABLED, true),
  agentTokenBudgetPerUserPerDay: parsePositiveIntEnv(
    process.env.AI_AGENT_TOKEN_BUDGET_PER_USER_PER_DAY,
    100_000,
  ),
  agentTokenBudgetPerOrgPerDay: parsePositiveIntEnv(
    process.env.AI_AGENT_TOKEN_BUDGET_PER_ORG_PER_DAY,
    500_000,
  ),
  agentMaxConversationHistory: parsePositiveIntEnv(
    process.env.AI_AGENT_MAX_CONVERSATION_HISTORY,
    100,
  ),
  agentRequestTimeoutMs: parsePositiveIntEnv(process.env.AI_AGENT_REQUEST_TIMEOUT_MS, 45_000),
  agentToolCacheEnabled: parseBooleanEnv(process.env.AI_AGENT_TOOL_CACHE_ENABLED, true),
  agentCircuitBreakerFailureThreshold: parsePositiveIntEnv(
    process.env.AI_AGENT_CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    5,
  ),
  agentCircuitBreakerCooldownMs: parsePositiveIntEnv(
    process.env.AI_AGENT_CIRCUIT_BREAKER_COOLDOWN_MS,
    60_000,
  ),
  agentLlmRetryBackoffMs: parsePositiveIntEnv(process.env.AI_AGENT_LLM_RETRY_BACKOFF_MS, 500),
  /**
   * Domain-grounded Fleet Chat orchestrator (tools + evidence composer).
   * Production default OFF until explicitly enabled; non-production defaults ON.
   */
  fleetChatDomainGroundingEnabled: parseBooleanEnv(
    process.env.FLEET_CHAT_DOMAIN_GROUNDING_ENABLED,
    (process.env.NODE_ENV || 'development') !== 'production',
  ),
  /** When non-empty, only listed organization UUIDs receive the orchestrator path. */
  fleetChatOrgAllowlist: parseUuidAllowlist(process.env.FLEET_CHAT_ORG_ALLOWLIST),
}));
