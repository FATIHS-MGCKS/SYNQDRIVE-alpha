export const VOICE_POST_CALL_CONFIG_VERSION = 1;

export const VOICE_ELEVENLABS_POST_CALL_WEBHOOK_PATH = '/api/v1/webhooks/elevenlabs/post-call';

export function resolveVoicePublicBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const base =
    env.TWILIO_VOICE_WEBHOOK_BASE_URL?.trim() ||
    env.APP_URL?.trim() ||
    env.PUBLIC_APP_URL?.trim() ||
    null;
  return base ? base.replace(/\/$/, '') : null;
}

export function buildCanonicalElevenLabsPostCallWebhookPath(organizationId: string): string {
  return `${VOICE_ELEVENLABS_POST_CALL_WEBHOOK_PATH}/${organizationId}`;
}

export function buildCanonicalElevenLabsPostCallWebhookUrl(organizationId: string): string | null {
  const base = resolveVoicePublicBaseUrl();
  if (!base) {
    return null;
  }
  return `${base}${buildCanonicalElevenLabsPostCallWebhookPath(organizationId)}`;
}

export function isElevenLabsWebhookSecretConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.ELEVENLABS_WEBHOOK_SECRET?.trim() || env.ELEVENLABS_CONVAI_WEBHOOK_SECRET?.trim(),
  );
}

export function buildDefaultPostCallConfig(organizationId: string): import('./agent-config.types').AgentPostCallConfig {
  return {
    version: VOICE_POST_CALL_CONFIG_VERSION,
    webhookPath: buildCanonicalElevenLabsPostCallWebhookPath(organizationId),
    signatureRequired: true,
    webhookSecretConfigured: isElevenLabsWebhookSecretConfigured(),
    enableTranscript: true,
    enableSummary: true,
    enableOutcome: true,
    enableAnalysis: true,
    sendAudio: false,
  };
}
