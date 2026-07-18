import {
  isIe1SubaccountApiBlockedError,
  resolveVoiceStagingTwilioImportCredentials,
} from './voice-staging-twilio-import.util';

describe('voice-staging-twilio-import.util', () => {
  it('detects IE1 realm API block message', () => {
    expect(isIe1SubaccountApiBlockedError("Endpoint is not supported in realm 'ie1'")).toBe(true);
    expect(isIe1SubaccountApiBlockedError('ok')).toBe(false);
  });

  it('resolves manual subaccount env pair', () => {
    const creds = resolveVoiceStagingTwilioImportCredentials({
      VOICE_STAGING_TWILIO_SUBACCOUNT_SID: 'AC1234567890abcdef1234567890abcd',
      VOICE_STAGING_TWILIO_AUTH_TOKEN: 'secret-token',
    });
    expect(creds?.source).toBe('manual');
    expect(creds?.accountSid).toMatch(/^AC/);
  });

  it('resolves parent fallback when explicitly enabled', () => {
    const creds = resolveVoiceStagingTwilioImportCredentials({
      VOICE_STAGING_TWILIO_USE_PARENT_ACCOUNT: 'true',
      TWILIO_ACCOUNT_SID: 'ACparent1234567890abcdef1234567890',
      TWILIO_AUTH_TOKEN: 'parent-token',
    });
    expect(creds?.source).toBe('parent_staging_fallback');
  });
});
