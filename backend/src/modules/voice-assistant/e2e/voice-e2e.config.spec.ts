import {
  assertVoiceE2eLiveCallAllowed,
  assertVoiceE2eStagingOrg,
  isVoiceE2eLiveCallsEnabled,
  maskE164,
  normalizeE164,
  parseVoiceE2eAllowlistE164,
  voiceE2ePreflightSummary,
} from './voice-e2e.config';

describe('voice-e2e.config', () => {
  const baseEnv: NodeJS.ProcessEnv = {
    VOICE_E2E_ALLOW_LIVE_CALLS: 'true',
    VOICE_AI_PROVISIONING_STAGING_ENABLED: 'true',
    VOICE_E2E_ORG_ID: 'org-voice-staging-e2e',
    VOICE_E2E_ALLOWLIST_E164: '+491701234567,+49800900100',
    VOICE_E2E_FORBIDDEN_ORG_IDS: 'org-prod-main',
  };

  it('parses allowlist numbers', () => {
    expect(parseVoiceE2eAllowlistE164(baseEnv)).toEqual(['+491701234567', '+49800900100']);
    expect(normalizeE164('+49 170 1234567')).toBe('+491701234567');
  });

  it('masks E.164 for logs', () => {
    expect(maskE164('+491701234567')).toBe('+491***67');
  });

  it('blocks live calls without safety flag', () => {
    expect(isVoiceE2eLiveCallsEnabled({})).toBe(false);
    expect(() =>
      assertVoiceE2eLiveCallAllowed('+491701234567', {
        ...baseEnv,
        VOICE_E2E_ALLOW_LIVE_CALLS: 'false',
      }),
    ).toThrow(/VOICE_E2E_ALLOW_LIVE_CALLS/);
  });

  it('blocks targets outside allowlist', () => {
    expect(() =>
      assertVoiceE2eLiveCallAllowed('+491799999999', baseEnv),
    ).toThrow(/not on VOICE_E2E_ALLOWLIST_E164/);
  });

  it('allows allowlisted targets when fully configured', () => {
    expect(() => assertVoiceE2eLiveCallAllowed('+491701234567', baseEnv)).not.toThrow();
  });

  it('rejects forbidden and production-like org ids', () => {
    expect(() => assertVoiceE2eStagingOrg('org-prod-main', baseEnv)).toThrow(/forbidden/i);
    expect(() => assertVoiceE2eStagingOrg('org-production-fleet', baseEnv)).toThrow(/production guard/i);
    expect(() => assertVoiceE2eStagingOrg('org-voice-staging-e2e', baseEnv)).not.toThrow();
  });

  it('summarizes preflight without leaking numbers', () => {
    const summary = voiceE2ePreflightSummary(baseEnv);
    expect(summary).toEqual(
      expect.objectContaining({
        liveCallsEnabled: true,
        stagingProvisioning: true,
        allowlistCount: 2,
        stagingOrgConfigured: true,
      }),
    );
    expect(JSON.stringify(summary)).not.toContain('+4917');
  });
});
