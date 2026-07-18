import { describe, expect, it } from '@jest/globals';
import {
  deriveProvisioningGoNoGo,
  evaluateVoiceSecretReferences,
  evaluateVoiceStagingPolicies,
  maskStagingOrgId,
} from './voice-staging-preflight.util';

describe('voice-staging-preflight.util', () => {
  it('masks org ids for reports', () => {
    expect(maskStagingOrgId('org-voice-staging-e2e')).toContain('…');
  });

  it('flags absent required secrets', () => {
    const secrets = evaluateVoiceSecretReferences({});
    const el = secrets.find(s => s.key === 'ELEVENLABS_API_KEY');
    expect(el?.presence).toBe('absent');
  });

  it('reads staging policy snapshot', () => {
    const policies = evaluateVoiceStagingPolicies({
      VOICE_AI_PROVISIONING_STAGING_ENABLED: 'true',
      VOICE_E2E_ALLOW_LIVE_CALLS: 'false',
      TWILIO_REGION: 'ie1',
      TWILIO_EDGE: 'dublin',
    });
    expect(policies.provisioningStagingEnabled).toBe(true);
    expect(policies.liveCallsEnabled).toBe(false);
    expect(policies.twilioRegion).toBe('ie1');
  });

  it('returns NO-GO when blockers present', () => {
    const result = deriveProvisioningGoNoGo({
      secrets: evaluateVoiceSecretReferences({}),
      policies: evaluateVoiceStagingPolicies({}),
      probes: [{ id: 'db', label: 'DB', status: 'pass', detail: 'ok' }],
      stagingOrgExists: false,
    });
    expect(result.decision).toBe('NO-GO');
    expect(result.blockers.length).toBeGreaterThan(0);
  });
});
