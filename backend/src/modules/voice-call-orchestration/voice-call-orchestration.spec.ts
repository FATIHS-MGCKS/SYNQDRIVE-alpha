import { ForbiddenException } from '@nestjs/common';
import {
  VoiceAgentDeploymentStatus,
  VoiceAssistantStatus,
  VoiceControlPlaneProvider,
  VoiceElevenLabsImportStatus,
  VoicePhoneNumberLifecycle,
  VoiceSubscriptionStatus,
} from '@prisma/client';
import { VoiceCallOrchestrationService } from './voice-call-orchestration.service';
import { VoiceCallPolicyService } from './voice-call-policy.service';

describe('VoiceCallOrchestrationService', () => {
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
    evaluateCallPrerequisites: jest.fn().mockResolvedValue({
      organizationId: ORG,
      surface: 'inbound',
      rolloutStatus: 'CANARY',
      allowed: true,
      blockers: [],
    }),
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

  it('reports inbound readiness blockers from rollout prerequisites', async () => {
    prisma.voiceAssistant.findUnique.mockResolvedValue({
      id: ASSISTANT_ID,
      organizationId: ORG,
      status: VoiceAssistantStatus.ACTIVE,
      phoneNumberId: PHONE_ID,
    });
    rollout.evaluateCallPrerequisites.mockResolvedValue({
      organizationId: ORG,
      surface: 'inbound',
      rolloutStatus: 'CANARY',
      allowed: false,
      blockers: [{ code: 'phone_not_imported', message: 'not imported' }],
    });

    const readiness = await service.evaluateInboundReadiness(ORG);

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.some((b) => b.code === 'phone_not_imported')).toBe(true);
  });

  it('orchestrates outbound as dry-run without provider call when staging is off', async () => {
    prisma.voiceAssistant.findUnique.mockResolvedValue({
      id: ASSISTANT_ID,
      organizationId: ORG,
      status: VoiceAssistantStatus.ACTIVE,
      outboundEnabled: true,
      phoneNumberId: PHONE_ID,
    });
    prisma.voiceConversation.findFirst.mockResolvedValue(null);
    phoneNumbers.findById.mockResolvedValue({
      id: PHONE_ID,
      lifecycle: VoicePhoneNumberLifecycle.ACTIVE,
      elevenLabsImportStatus: VoiceElevenLabsImportStatus.ASSIGNED,
    });
    prisma.voiceAgentDeployment.findFirst.mockResolvedValue({ id: DEPLOY_ID });
    elevenLabs.prepareOutboundCall.mockResolvedValue({ ready: true, blockers: [] });
    prisma.voiceConversation.create.mockResolvedValue({ id: 'conv-1' });

    const result = await service.orchestrateOutboundCall({
      organizationId: ORG,
      toE164: '+491701234567',
      idempotencyKey: 'idem-1',
    });

    expect(result.dryRun).toBe(true);
    expect(elevenLabs.startOutboundCall).not.toHaveBeenCalled();
    expect(prisma.voiceConversation.create).toHaveBeenCalled();
  });

  it('returns idempotent replay for duplicate outbound idempotency key', async () => {
    prisma.voiceAssistant.findUnique.mockResolvedValue({ id: ASSISTANT_ID });
    policy.assertOutboundCallAllowed.mockResolvedValue(undefined);
    prisma.voiceConversation.findFirst.mockResolvedValue({
      id: 'conv-existing',
      elevenLabsConvId: 'el-1',
      twilioCallSid: 'CA1',
    });

    const result = await service.orchestrateOutboundCall({
      organizationId: ORG,
      toE164: '+491701234567',
      idempotencyKey: 'idem-dup',
    });

    expect(result.idempotentReplay).toBe(true);
    expect(elevenLabs.prepareOutboundCall).not.toHaveBeenCalled();
  });
});

describe('VoiceCallPolicyService', () => {
  const ORG = 'org-policy-1';
  const prisma = {
    voiceAssistant: { findFirst: jest.fn() },
    organizationMembership: { findFirst: jest.fn() },
  };
  const enforcement = {
    assertOutboundAllowed: jest.fn(),
  };

  let policy: VoiceCallPolicyService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.VOICE_NATIVE_TWILIO_INTEGRATION = 'true';
    policy = new VoiceCallPolicyService(prisma as never, enforcement as never, {
      assertSurfaceAllowed: jest.fn().mockResolvedValue({ organizationId: ORG, status: 'CANARY' }),
    } as never);
  });

  it('rejects outbound when subscription is suspended', async () => {
    prisma.voiceAssistant.findFirst.mockResolvedValue({
      id: 'asst-1',
      status: VoiceAssistantStatus.ACTIVE,
      outboundEnabled: true,
    });
    const { VoiceProtectionDeniedError } = require('@modules/voice-protection/voice-protection-reason-codes');
    enforcement.assertOutboundAllowed.mockRejectedValue(
      new VoiceProtectionDeniedError({
        reasonCode: 'subscription_suspended',
        message: 'Voice AI subscription is suspended.',
      }),
    );

    await expect(
      policy.assertOutboundCallAllowed({
        organizationId: ORG,
        toE164: '+491701234567',
        voiceAssistantId: 'asst-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks emergency destination numbers', async () => {
    prisma.voiceAssistant.findFirst.mockResolvedValue({
      id: 'asst-1',
      status: VoiceAssistantStatus.ACTIVE,
      outboundEnabled: true,
    });
    const { VoiceProtectionDeniedError } = require('@modules/voice-protection/voice-protection-reason-codes');
    enforcement.assertOutboundAllowed.mockRejectedValue(
      new VoiceProtectionDeniedError({
        reasonCode: 'destination_blocked_special',
        message: 'Destination number is blocked.',
        httpStatus: 400,
      }),
    );

    await expect(
      policy.assertOutboundCallAllowed({
        organizationId: ORG,
        toE164: '+491121234567',
        voiceAssistantId: 'asst-1',
      }),
    ).rejects.toThrow('blocked');
  });
});
