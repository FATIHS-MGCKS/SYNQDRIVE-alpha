import { registerAs } from '@nestjs/config';

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
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
  streamingEnabled: parseBooleanEnv(process.env.AI_STREAMING_ENABLED, true),
  /** When true, outbound customer communication (WhatsApp/email) must pass approval policy. */
  externalActionsRequireApproval: parseBooleanEnv(process.env.AI_EXTERNAL_ACTIONS_REQUIRE_APPROVAL, true),
}));
