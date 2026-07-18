import {
  buildVoiceStagingSafetySnapshot,
  deriveVoiceStagingE2eDecision,
  type VoiceStagingE2eAcceptanceSnapshot,
} from './voice-staging-e2e-readiness.util';

function baseSnapshot(
  overrides: Partial<VoiceStagingE2eAcceptanceSnapshot> = {},
): VoiceStagingE2eAcceptanceSnapshot {
  return {
    organizationIdMasked: 'org-vo…-e2e',
    provisioning: {
      subscriptionStatus: 'TRIAL',
      rolloutReference: 'rollout:STAGING',
      providerAccountStatus: null,
      phoneLifecycle: null,
      elevenLabsImportStatus: null,
      deploymentStatus: 'FAILED',
      deploymentVersion: 1,
      assistantTelephonyEnabled: false,
      conversationCount: 0,
      usageEventCount: 0,
      toolExecutionCount: 0,
    },
    safety: buildVoiceStagingSafetySnapshot({
      VOICE_E2E_ALLOW_LIVE_CALLS: 'false',
      VOICE_E2E_ALLOWLIST_E164: '',
      VOICE_E2E_ORG_ID: 'org-voice-staging-e2e',
      VOICE_AI_PROVISIONING_STAGING_ENABLED: 'true',
    }),
    liveCallBudget: {
      maxInbound: 2,
      maxOutbound: 2,
      inboundExecuted: 0,
      outboundExecuted: 0,
    },
    automatedTests: {
      stagingMatrixPassed: true,
      securityBundlePassed: true,
    },
    ...overrides,
  };
}

describe('voice-staging-e2e-readiness.util', () => {
  it('returns E2E_NO_GO when provisioning incomplete despite passing automated tests', () => {
    const result = deriveVoiceStagingE2eDecision(baseSnapshot());
    expect(result.decision).toBe('E2E_NO_GO');
    expect(result.blockers.some((b) => /subaccount/i.test(b))).toBe(true);
  });

  it('returns E2E_CONDITIONAL_GO when infra ready but no live calls executed', () => {
    const result = deriveVoiceStagingE2eDecision(
      baseSnapshot({
        provisioning: {
          ...baseSnapshot().provisioning,
          providerAccountStatus: 'ACTIVE',
          phoneLifecycle: 'ACTIVE',
          elevenLabsImportStatus: 'IMPORTED',
          deploymentStatus: 'ACTIVE',
        },
      }),
    );
    expect(result.decision).toBe('E2E_CONDITIONAL_GO');
  });

  it('flags unsafe rollback when live flag or allowlist remain set', () => {
    const safety = buildVoiceStagingSafetySnapshot({
      VOICE_E2E_ALLOW_LIVE_CALLS: 'true',
      VOICE_E2E_ALLOWLIST_E164: '+491701234567',
      VOICE_E2E_ORG_ID: 'org-voice-staging-e2e',
    });
    expect(safety.rollbackSafe).toBe(false);
    expect(safety.allowlistConfigured).toBe(true);
  });
});
