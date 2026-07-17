/**
 * Voice telephony feature flags (Prompt 7B).
 * New canonical names alias existing env keys for backward compatibility.
 */
export function isVoiceNativeTwilioIntegrationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const canonical = env.VOICE_NATIVE_TWILIO_INTEGRATION?.trim().toLowerCase();
  const legacy = env.VOICE_AI_NATIVE_TELEPHONY?.trim().toLowerCase();
  return canonical === 'true' || legacy === 'true';
}

export function isVoiceMcpGatewayFeatureEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const canonical = env.VOICE_MCP_GATEWAY?.trim().toLowerCase();
  const legacy = env.VOICE_AI_MCP_GATEWAY_ENABLED?.trim().toLowerCase();
  return canonical === 'true' || legacy === 'true';
}

export function isLegacyDiagnosticCallsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VOICE_LEGACY_DIAGNOSTIC_CALLS?.trim().toLowerCase() === 'true';
}

export function isVoiceCallProviderStagingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VOICE_AI_PROVISIONING_STAGING_ENABLED?.trim().toLowerCase() === 'true';
}

export function assertLiveProviderCallsAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (!isVoiceCallProviderStagingEnabled(env)) {
    throw new Error(
      'Live provider calls require VOICE_AI_PROVISIONING_STAGING_ENABLED=true (staging/canary only).',
    );
  }
}
