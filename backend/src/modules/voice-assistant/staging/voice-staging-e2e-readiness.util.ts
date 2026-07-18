/**
 * Voice staging real E2E acceptance readiness (Prompt 10A).
 * Pure helpers — no live PSTN side effects.
 */
import {
  isVoiceE2eLiveCallsEnabled,
  parseVoiceE2eAllowlistE164,
  voiceE2ePreflightSummary,
} from '../e2e/voice-e2e.config';

export type VoiceStagingE2eDecision = 'E2E_GO' | 'E2E_CONDITIONAL_GO' | 'E2E_NO_GO';

export interface VoiceStagingProvisioningSnapshot {
  subscriptionStatus: string | null;
  rolloutReference: string | null;
  providerAccountStatus: string | null;
  phoneLifecycle: string | null;
  elevenLabsImportStatus: string | null;
  deploymentStatus: string | null;
  deploymentVersion: number | null;
  assistantTelephonyEnabled: boolean;
  conversationCount: number;
  usageEventCount: number;
  toolExecutionCount: number;
}

export interface VoiceStagingE2eAcceptanceSnapshot {
  organizationIdMasked: string;
  provisioning: VoiceStagingProvisioningSnapshot;
  safety: ReturnType<typeof voiceE2ePreflightSummary> & {
    allowlistConfigured: boolean;
    rollbackSafe: boolean;
  };
  liveCallBudget: {
    maxInbound: number;
    maxOutbound: number;
    inboundExecuted: number;
    outboundExecuted: number;
  };
  automatedTests: {
    stagingMatrixPassed: boolean | null;
    securityBundlePassed: boolean | null;
  };
}

export function deriveVoiceStagingE2eDecision(
  snapshot: VoiceStagingE2eAcceptanceSnapshot,
): { decision: VoiceStagingE2eDecision; blockers: string[]; notes: string[] } {
  const blockers: string[] = [];
  const notes: string[] = [];

  const prov = snapshot.provisioning;
  const infraReady =
    prov.providerAccountStatus === 'ACTIVE' &&
    prov.phoneLifecycle === 'ACTIVE' &&
    prov.deploymentStatus === 'ACTIVE' &&
    prov.elevenLabsImportStatus === 'IMPORTED';

  if (!infraReady) {
    if (!prov.providerAccountStatus || prov.providerAccountStatus !== 'ACTIVE') {
      blockers.push('Twilio subaccount not ACTIVE — live PSTN chain cannot start');
    }
    if (!prov.phoneLifecycle || prov.phoneLifecycle !== 'ACTIVE') {
      blockers.push('Staging phone number not ACTIVE');
    }
    if (!prov.deploymentStatus || prov.deploymentStatus !== 'ACTIVE') {
      blockers.push('Agent deployment not ACTIVE');
    }
    if (!prov.elevenLabsImportStatus || prov.elevenLabsImportStatus !== 'IMPORTED') {
      blockers.push('ElevenLabs phone import not complete');
    }
  }

  if (snapshot.safety.liveCallsEnabled) {
    blockers.push('VOICE_E2E_ALLOW_LIVE_CALLS must be false after acceptance rollback');
  }
  if (snapshot.safety.allowlistConfigured) {
    blockers.push('VOICE_E2E_ALLOWLIST_E164 must be cleared after acceptance');
  }

  const liveExecuted =
    snapshot.liveCallBudget.inboundExecuted + snapshot.liveCallBudget.outboundExecuted;
  const chainProven =
    liveExecuted > 0 &&
    prov.conversationCount >= liveExecuted &&
    infraReady &&
    snapshot.automatedTests.stagingMatrixPassed !== false &&
    snapshot.automatedTests.securityBundlePassed !== false;

  if (chainProven && snapshot.safety.rollbackSafe) {
    return { decision: 'E2E_GO', blockers: [], notes: ['Full live chain evidenced with safe rollback.'] };
  }

  const automatedOk =
    snapshot.automatedTests.stagingMatrixPassed === true &&
    snapshot.automatedTests.securityBundlePassed === true;

  if (automatedOk && snapshot.safety.rollbackSafe && infraReady && liveExecuted === 0) {
    notes.push(
      'Automated negative/policy suites pass and infra appears ready, but no controlled live calls were executed.',
    );
    return {
      decision: 'E2E_CONDITIONAL_GO',
      blockers: ['Live PSTN chain not evidenced — run inbound/outbound canary with allowlist'],
      notes,
    };
  }

  if (automatedOk && snapshot.safety.rollbackSafe && !infraReady) {
    notes.push('Automated negative suites pass; provisioning incomplete blocks live chain.');
    return {
      decision: 'E2E_NO_GO',
      blockers,
      notes,
    };
  }

  if (snapshot.automatedTests.stagingMatrixPassed === false) {
    blockers.push('Voice staging E2E matrix tests failed');
  }
  if (snapshot.automatedTests.securityBundlePassed === false) {
    blockers.push('Voice security bundle tests failed');
  }

  return { decision: 'E2E_NO_GO', blockers, notes };
}

export function buildVoiceStagingSafetySnapshot(env: NodeJS.ProcessEnv = process.env): VoiceStagingE2eAcceptanceSnapshot['safety'] {
  const allowlist = parseVoiceE2eAllowlistE164(env);
  const liveEnabled = isVoiceE2eLiveCallsEnabled(env);
  return {
    ...voiceE2ePreflightSummary(env),
    allowlistConfigured: allowlist.length > 0,
    rollbackSafe: !liveEnabled && allowlist.length === 0,
  };
}
