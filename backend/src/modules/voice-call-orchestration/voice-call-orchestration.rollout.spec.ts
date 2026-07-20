import { ForbiddenException } from '@nestjs/common';
import {
  VoiceAgentDeploymentStatus,
  VoiceAssistantStatus,
  VoiceControlPlaneProvider,
  VoiceElevenLabsImportStatus,
  VoicePhoneNumberLifecycle,
} from '@prisma/client';
import { VoiceCallOrchestrationService } from './voice-call-orchestration.service';
import { VoiceCallPolicyService } from './voice-call-policy.service';

describe('VoiceCallOrchestrationService rollout integration', () => {
  const ORG = 'org-1';
  const ASSISTANT_ID = 'asst-1';
  const PHONE_ID = 'phone-1';
  const DEPLOY_ID = 'deploy-1';

  const prisma = {
    voiceAssistant: { findUnique: jest.fn(), findFirst: jest.fn() },
    voicePhoneNumber: { findFirst: jest.fn() },
    voiceAgentDeployment: { findFirst: jest.fn() },
    voiceConversation: { findFirst: jest.fn(), create: jest.fn() },
  };

  const elevenLabs = {
    prepareOutboundCall: jest.fn(),
    startOutboundCall: jest.fn(),
    updateToolsConfiguration: jest.fn(),
  };

  const deployments = { findById: jest.fn() };
  const phoneNumbers = { findById: jest.fn() };
  const policy = {
    assertOutboundCallAllowed: jest.fn().mockResolvedValue({ conversationSlotId: 'slot-1' }),
    assertLegacyDiagnosticAllowed: jest.fn(),
  };
  const protection = {
    evaluateInboundDegradation: jest.fn().mockResolvedValue({ degraded: false }),
  };
  const rollout = {
    evaluateCallPrerequisites: jest.fn(),
    evaluateSurface: jest.fn(),
  };
  const mcpTokens = { issue: jest.fn() };
  const internalEvents = { recordConversationLifecycle: jest.fn() };

  let service: VoiceCallOrchestrationService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.VOICE_NATIVE_TWILIO_INTEGRATION = 'true';
    process.env.VOICE_AI_PROVISIONING_STAGING_ENABLED = 'false';
    process.env.VOICE_LEGACY_DIAGNOSTIC_CALLS = 'false';

    rollout.evaluateCallPrerequisites.mockResolvedValue({
      organizationId: ORG,
      surface: 'inbound',
      rolloutStatus: 'CANARY',
      allowed: true,
      blockers: [],
    });

    service = new VoiceCallOrchestrationService(
      prisma as never,
      elevenLabs as never,
      deployments as never,
      phoneNumbers as never,
      policy as never,
      protection as never,
      rollout as never,
      mcpTokens as never,
      internalEvents as never,
    );
  });

  it('delegates inbound readiness to rollout prerequisites', async () => {
    prisma.voiceAssistant.findUnique.mockResolvedValue({
      id: ASSISTANT_ID,
      organizationId: ORG,
      status: VoiceAssistantStatus.ACTIVE,
      phoneNumberId: PHONE_ID,
    });
    rollout.evaluateCallPrerequisites.mockResolvedValue({
      organizationId: ORG,
      surface: 'inbound',
      rolloutStatus: 'DISABLED',
      allowed: false,
      blockers: [{ code: 'tenant_rollout_disabled', message: 'disabled' }],
    });
    phoneNumbers.findById.mockResolvedValue({
      id: PHONE_ID,
      lifecycle: VoicePhoneNumberLifecycle.ACTIVE,
      elevenLabsImportStatus: VoiceElevenLabsImportStatus.ASSIGNED,
    });
    prisma.voiceAgentDeployment.findFirst.mockResolvedValue({ id: DEPLOY_ID });

    const readiness = await service.evaluateInboundReadiness(ORG);

    expect(rollout.evaluateCallPrerequisites).toHaveBeenCalledWith(ORG, 'inbound');
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers[0]?.code).toBe('tenant_rollout_disabled');
  });
});

describe('VoiceCallPolicyService rollout integration', () => {
  const ORG = 'org-policy-1';
  const prisma = {
    voiceAssistant: { findFirst: jest.fn() },
    organizationMembership: { findFirst: jest.fn() },
  };
  const enforcement = {
    assertOutboundAllowed: jest.fn(),
  };
  const rollout = {
    assertSurfaceAllowed: jest.fn().mockResolvedValue({ organizationId: ORG, status: 'CANARY' }),
  };

  let policy: VoiceCallPolicyService;

  beforeEach(() => {
    jest.clearAllMocks();
    policy = new VoiceCallPolicyService(prisma as never, enforcement as never, rollout as never);
  });

  it('checks rollout before outbound enforcement', async () => {
    const { VoiceRolloutDeniedError } = require('@modules/voice-rollout/voice-rollout-reason-codes');
    rollout.assertSurfaceAllowed.mockRejectedValue(
      new VoiceRolloutDeniedError({
        reasonCode: 'voice_rollout_global_kill_switch',
        message: 'native off',
        rolloutStatus: 'PRODUCTION',
        surface: 'outbound',
      }),
    );

    await expect(
      policy.assertOutboundCallAllowed({
        organizationId: ORG,
        toE164: '+491701234567',
        voiceAssistantId: 'asst-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(enforcement.assertOutboundAllowed).not.toHaveBeenCalled();
  });
});
