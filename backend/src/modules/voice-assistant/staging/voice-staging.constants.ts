/** Canonical internal voice staging organization identifier (no production customer data). */
export const VOICE_STAGING_ORG_ID = 'org-voice-staging-e2e';

export const VOICE_STAGING_SHORT_CODE = 'VOICE-STAGING-E2E';

export const VOICE_STAGING_COMPANY_NAME = 'Voice Staging E2E (Internal)';

/** Stored on VoiceSubscription.planReference — marks tenant rollout as staging-only. */
export const VOICE_STAGING_ROLLOUT_REFERENCE = 'rollout:STAGING';

export const VOICE_STAGING_SYNTHETIC_PREFIX = 'staging-synthetic-';

/** True when org is the canonical internal voice staging tenant. */
export function isVoiceStagingOrganization(
  organizationId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const configured = env.VOICE_E2E_ORG_ID?.trim();
  const canonical = configured || VOICE_STAGING_ORG_ID;
  return organizationId.trim() === canonical;
}
