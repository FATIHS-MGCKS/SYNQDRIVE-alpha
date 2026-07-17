export function isVoiceWebhookIngestionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VOICE_WEBHOOK_INGESTION_ENABLED !== 'false';
}

export function resolveElevenLabsWebhookSecret(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.ELEVENLABS_WEBHOOK_SECRET?.trim() ||
    env.ELEVENLABS_CONVAI_WEBHOOK_SECRET?.trim() ||
    ''
  );
}
