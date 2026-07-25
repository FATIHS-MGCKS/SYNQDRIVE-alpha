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
}));
