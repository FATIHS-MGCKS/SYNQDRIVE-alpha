/**
 * Resolve Twilio credentials for IE1 staging import (Console subaccount or parent fallback).
 */
export type VoiceStagingTwilioImportCredentials = {
  accountSid: string;
  authToken: string;
  source: 'manual' | 'parent_staging_fallback';
};

export function isIe1SubaccountApiBlockedError(message: string): boolean {
  return /realm\s*['"]ie1['"]/i.test(message) || /not supported in realm/i.test(message);
}

export function resolveVoiceStagingTwilioImportCredentials(
  env: NodeJS.ProcessEnv = process.env,
): VoiceStagingTwilioImportCredentials | null {
  const manualSid = env.VOICE_STAGING_TWILIO_SUBACCOUNT_SID?.trim();
  const manualToken = env.VOICE_STAGING_TWILIO_AUTH_TOKEN?.trim();
  if (manualSid && manualToken) {
    return {
      accountSid: manualSid,
      authToken: manualToken,
      source: 'manual',
    };
  }

  const useParent = env.VOICE_STAGING_TWILIO_USE_PARENT_ACCOUNT?.trim().toLowerCase() === 'true';
  if (useParent) {
    const parentSid = env.TWILIO_ACCOUNT_SID?.trim();
    const parentToken = env.TWILIO_AUTH_TOKEN?.trim();
    if (parentSid && parentToken) {
      return {
        accountSid: parentSid,
        authToken: parentToken,
        source: 'parent_staging_fallback',
      };
    }
  }

  return null;
}
