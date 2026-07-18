function isProductionEnv(env: NodeJS.ProcessEnv): boolean {
  return (env.NODE_ENV ?? '').toLowerCase() === 'production';
}

/** Webhook ingestion is opt-in in production (requires secrets + explicit flag). */
export function isVoiceWebhookIngestionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.VOICE_WEBHOOK_INGESTION_ENABLED?.trim().toLowerCase();
  if (flag === 'false') return false;
  if (flag === 'true') return true;
  return !isProductionEnv(env);
}

export function resolveElevenLabsWebhookSecret(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.ELEVENLABS_WEBHOOK_SECRET?.trim() ||
    env.ELEVENLABS_CONVAI_WEBHOOK_SECRET?.trim() ||
    ''
  );
}
