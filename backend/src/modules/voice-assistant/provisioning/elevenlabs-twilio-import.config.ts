export const VOICE_AI_NATIVE_TELEPHONY_FLAG = 'VOICE_AI_NATIVE_TELEPHONY';

export const ELEVENLABS_IMPORT_DEFAULTS = {
  maxRetries: 2,
  retryDelayMs: 300,
} as const;

export function isElevenLabsImportStagingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VOICE_AI_PROVISIONING_STAGING_ENABLED?.trim().toLowerCase() === 'true';
}

export function isNativeTelephonyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.VOICE_NATIVE_TWILIO_INTEGRATION?.trim().toLowerCase() === 'true' ||
    env[VOICE_AI_NATIVE_TELEPHONY_FLAG]?.trim().toLowerCase() === 'true'
  );
}
