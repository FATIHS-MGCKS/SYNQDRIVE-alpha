export const TWILIO_PROVISIONING_DEFAULTS = {
  phoneSearchCacheTtlMs: 5 * 60_000,
  defaultCountry: 'DE',
  defaultNumberType: 'local' as const,
} as const;

export const VOICE_AI_SUBACCOUNTS_FLAG = 'VOICE_AI_SUBACCOUNTS';
export const VOICE_AI_PROVISIONING_STAGING_FLAG = 'VOICE_AI_PROVISIONING_STAGING_ENABLED';

export type TwilioProvisioningFeatureFlags = {
  subaccountsEnabled: boolean;
  stagingProviderActionsEnabled: boolean;
};

export function readTwilioProvisioningFlags(env: NodeJS.ProcessEnv = process.env): TwilioProvisioningFeatureFlags {
  return {
    subaccountsEnabled: env[VOICE_AI_SUBACCOUNTS_FLAG]?.trim().toLowerCase() === 'true',
    stagingProviderActionsEnabled:
      env[VOICE_AI_PROVISIONING_STAGING_FLAG]?.trim().toLowerCase() === 'true',
  };
}
