import { BadRequestException } from '@nestjs/common';
import {
  VoiceAgentDeploymentStatus,
  VoiceAssistantStatus,
  VoiceControlPlaneProvider,
  VoiceElevenLabsImportStatus,
  VoicePhoneNumberLifecycle,
  VoiceRolloutStatus,
} from '@prisma/client';
import { VoiceEntitlementDeniedError } from '@modules/voice-entitlement/voice-entitlement-reason-codes';
import { VoiceRolloutService } from './voice-rollout.service';
import { VoiceRolloutDeniedError } from './voice-rollout-reason-codes';

const ORG = 'org-rollout-1';

describe('VoiceRolloutService', () => {
  const prisma = {
    voiceAssistant: { findUnique: jest.fn() },
    voiceAgentDeployment: { findFirst: jest.fn() },
    voicePhoneNumber: { findFirst: jest.fn() },
  };
  const repository = {
    findByOrganization: jest.fn(),
    upsertStatus: jest.fn(),
    findAuditByIdempotencyKey: jest.fn(),
    recordAudit: jest.fn(),
    listAuditByOrganization: jest.fn(),
  };
  const entitlements = {
    assertCapability: jest.fn().mockResolvedValue({ organizationId: ORG, status: 'ACTIVE' }),
  };
  const budget = {
    evaluateInboundDegradation: jest.fn().mockResolvedValue({ degraded: false }),
  };

  let service: VoiceRolloutService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.VOICE_NATIVE_TWILIO_INTEGRATION = 'true';
    process.env.VOICE_MCP_GATEWAY = 'true';
    process.env.VOICE_WEBHOOK_INGESTION_ENABLED = 'true';
    process.env.VOICE_OUTBOUND_AUTOMATIONS = 'true';
    process.env.VOICE_LEGACY_DIAGNOSTIC_CALLS = 'true';
    process.env.NODE_ENV = 'test';

    service = new VoiceRolloutService(
      prisma as never,
      repository as never,
      entitlements as never,
      budget as never,
    );
  });

  function mockOperationalTenant(status: VoiceRolloutStatus = 'CANARY') {
    repository.findByOrganization.mockResolvedValue({
      organizationId: ORG,
      status,
      lastReason: 'test',
      updatedAt: new Date(),
      updatedByUserId: 'admin-1',
    });
    prisma.voiceAssistant.findUnique.mockResolvedValue({
      id: 'asst-1',
      status: VoiceAssistantStatus.ACTIVE,
      connectionStatus: 'CONNECTED',
    });
    prisma.voiceAgentDeployment.findFirst.mockResolvedValue({
      id: 'dep-1',
      status: VoiceAgentDeploymentStatus.ACTIVE,
      provider: VoiceControlPlaneProvider.ELEVENLABS,
    });
    prisma.voicePhoneNumber.findFirst.mockResolvedValue({
      id: 'phone-1',
      lifecycle: VoicePhoneNumberLifecycle.ACTIVE,
      elevenLabsImportStatus: VoiceElevenLabsImportStatus.ASSIGNED,
    });
  }

  it('resolves missing rollout row as DISABLED', async () => {
    repository.findByOrganization.mockResolvedValue(null);
    const context = await service.resolveContext(ORG);
    expect(context.status).toBe('DISABLED');
  });

  it('blocks inbound when global native integration kill-switch is off', async () => {
    process.env.VOICE_NATIVE_TWILIO_INTEGRATION = 'false';
    mockOperationalTenant('PRODUCTION');

    const evaluation = await service.evaluateSurface(ORG, 'inbound');
    expect(evaluation.allowed).toBe(false);
    expect(evaluation.blockers[0]?.code).toBe('global_kill_switch_native');
  });

  it('blocks outbound when tenant rollout is DISABLED even if global flag is on', async () => {
    mockOperationalTenant('DISABLED');

    const evaluation = await service.evaluateSurface(ORG, 'outbound');
    expect(evaluation.allowed).toBe(false);
    expect(evaluation.blockers[0]?.code).toBe('tenant_rollout_disabled');
  });

  it('blocks suspended tenant rollout', async () => {
    mockOperationalTenant('SUSPENDED');
    const evaluation = await service.evaluateSurface(ORG, 'inbound', { skipRuntimePrerequisites: true });
    expect(evaluation.blockers[0]?.code).toBe('tenant_rollout_suspended');
  });

  it('uses the same native kill-switch for inbound and outbound', async () => {
    process.env.VOICE_NATIVE_TWILIO_INTEGRATION = 'false';
    mockOperationalTenant('PRODUCTION');

    const inbound = await service.evaluateSurface(ORG, 'inbound', { skipRuntimePrerequisites: true });
    const outbound = await service.evaluateSurface(ORG, 'outbound', { skipRuntimePrerequisites: true });

    expect(inbound.blockers[0]?.code).toBe('global_kill_switch_native');
    expect(outbound.blockers[0]?.code).toBe('global_kill_switch_native');
  });

  it('blocks automation below CANARY tier', async () => {
    mockOperationalTenant('STAGING');
    const evaluation = await service.evaluateSurface(ORG, 'automation', { skipRuntimePrerequisites: true });
    expect(evaluation.blockers[0]?.code).toBe('tenant_rollout_tier_insufficient');
  });

  it('blocks legacy diagnostic on PRODUCTION rollout tier', async () => {
    mockOperationalTenant('PRODUCTION');
    const evaluation = await service.evaluateSurface(ORG, 'legacy_diagnostic', {
      skipRuntimePrerequisites: true,
    });
    expect(evaluation.blockers[0]?.code).toBe('legacy_not_in_production');
  });

  it('maps entitlement denials into rollout blockers', async () => {
    mockOperationalTenant('PRODUCTION');
    entitlements.assertCapability.mockRejectedValue(
      new VoiceEntitlementDeniedError({
        reasonCode: 'voice_entitlement_subscription_suspended',
        message: 'suspended',
        entitlementStatus: 'SUSPENDED',
        capability: 'calls.inbound',
      }),
    );

    const evaluation = await service.evaluateSurface(ORG, 'inbound', { skipRuntimePrerequisites: true });
    expect(evaluation.blockers[0]?.code).toBe('entitlement_denied');
  });

  it('requires reason and confirmation for PRODUCTION changes', async () => {
    repository.findByOrganization.mockResolvedValue({
      organizationId: ORG,
      status: 'CANARY',
      lastReason: null,
      updatedAt: new Date(),
      updatedByUserId: null,
    });

    await expect(
      service.changeRolloutStatus({
        organizationId: ORG,
        status: 'PRODUCTION',
        reason: 'go live',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.changeRolloutStatus({
        organizationId: ORG,
        status: 'PRODUCTION',
        reason: '',
        confirm: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('audits and supports idempotent rollout status changes', async () => {
    repository.findByOrganization.mockResolvedValue({
      organizationId: ORG,
      status: 'CANARY',
      lastReason: 'canary',
      updatedAt: new Date(),
      updatedByUserId: 'admin-1',
    });
    repository.findAuditByIdempotencyKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'audit-1', newStatus: 'PRODUCTION' });
    repository.upsertStatus.mockResolvedValue({
      organizationId: ORG,
      status: 'PRODUCTION',
      lastReason: 'promote',
      updatedAt: new Date(),
      updatedByUserId: 'admin-1',
    });
    repository.recordAudit.mockResolvedValue({ id: 'audit-1' });

    const first = await service.changeRolloutStatus({
      organizationId: ORG,
      status: 'PRODUCTION',
      reason: 'promote',
      confirm: true,
      actorUserId: 'admin-1',
      idempotencyKey: 'idem-1',
    });
    expect(first.idempotentReplay).toBe(false);
    expect(repository.recordAudit).toHaveBeenCalled();

    const second = await service.changeRolloutStatus({
      organizationId: ORG,
      status: 'PRODUCTION',
      reason: 'promote',
      confirm: true,
      actorUserId: 'admin-1',
      idempotencyKey: 'idem-1',
    });
    expect(second.idempotentReplay).toBe(true);
    expect(repository.upsertStatus).toHaveBeenCalledTimes(1);
  });

  it('assertSurfaceAllowed throws VoiceRolloutDeniedError when blocked', async () => {
    mockOperationalTenant('DISABLED');
    await expect(service.assertSurfaceAllowed(ORG, 'outbound')).rejects.toBeInstanceOf(
      VoiceRolloutDeniedError,
    );
  });

  it('global deactivation overrides tenant PRODUCTION', async () => {
    process.env.VOICE_NATIVE_TWILIO_INTEGRATION = 'false';
    mockOperationalTenant('PRODUCTION');

    await expect(service.assertSurfaceAllowed(ORG, 'outbound', { skipRuntimePrerequisites: true }))
      .rejects.toMatchObject({
        reasonCode: 'voice_rollout_global_kill_switch',
      });
  });
});
