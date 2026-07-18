import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  VoiceAgentDeploymentStatus,
  VoiceControlPlaneProvider,
  VoiceProvisioningJobStatus,
  VoiceProvisioningJobType,
} from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { ElevenLabsProviderAdapter } from '../elevenlabs-provider/elevenlabs-provider.adapter';
import { ElevenLabsProviderError, ElevenLabsProviderErrorCode } from '../elevenlabs-provider/elevenlabs-provider.errors';
import {
  VoiceAgentDeploymentRepository,
  VoiceProvisioningJobRepository,
} from '../control-plane/voice-control-plane.repository';
import { buildCanonicalAgentConfigFromAssistant } from './agent-config.builder';
import { hashCanonicalAgentConfig } from './agent-config.hash';
import { AgentDeploymentDiffService } from './agent-deployment-diff.service';
import { AgentDeploymentReadinessService } from './agent-deployment-readiness.service';
import { AgentDeploymentService } from './agent-deployment.service';

const ORG_ID = 'org-deploy-1';
const OTHER_ORG_ID = 'org-deploy-2';
const ASSISTANT_ID = 'assistant-1';

function makeAssistant(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSISTANT_ID,
    organizationId: ORG_ID,
    name: 'Fleet Assistant',
    systemPrompt: 'You are helpful.',
    companyContext: 'SynqDrive rental fleet.',
    businessRules: null,
    forbiddenActions: null,
    knowledgeSnippets: 'Hours: 9-18',
    language: 'de',
    voiceId: 'voice-abc123456789',
    voiceName: 'Rachel',
    greetingMessage: 'Hello from SynqDrive.',
    businessHours: null,
    businessHoursStart: '09:00',
    businessHoursEnd: '18:00',
    businessHoursTimezone: 'Europe/Berlin',
    afterHoursMessage: null,
    fallbackMessage: 'Please call back later.',
    escalateOnRequest: true,
    escalateOnLowConf: true,
    escalateOnSensitive: false,
    escalationDepartment: 'Operations',
    escalationPhone: '+491234567890',
    elevenLabsAgentId: null,
    toolPermissions: null,
    permAnswerQuestions: true,
    permManageBookings: false,
    permCreateBookingDrafts: false,
    permCancelBookings: false,
    permCreateTasks: false,
    permWorkshopHandling: false,
    permBreakdownSupport: false,
    permContactCustomers: false,
    permContactVendors: false,
    permModifyRecords: false,
    permCreateActions: false,
    permEmergencyHandling: false,
    outboundEnabled: false,
    ...overrides,
  } as any;
}

describe('AgentDeploymentService', () => {
  let prisma: {
    voiceAssistant: { findFirst: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    voiceAgentDeployment: { findFirst: jest.Mock; updateMany: jest.Mock; update: jest.Mock };
    organizationMembership: { findFirst: jest.Mock };
    organizationRole: { findFirst: jest.Mock };
    station: { findFirst: jest.Mock };
    voicePhoneNumber: { findFirst: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let readinessService: AgentDeploymentReadinessService;
  let deploymentRepository: jest.Mocked<VoiceAgentDeploymentRepository>;
  let provisioningJobRepository: jest.Mocked<VoiceProvisioningJobRepository>;
  let elevenLabs: jest.Mocked<ElevenLabsProviderAdapter>;
  let service: AgentDeploymentService;

  const baseConfig = buildCanonicalAgentConfigFromAssistant(makeAssistant());
  const baseHash = hashCanonicalAgentConfig(baseConfig);

  beforeEach(() => {
    process.env.VOICE_AI_PROVISIONING_STAGING_ENABLED = 'true';
    process.env.TWILIO_VOICE_WEBHOOK_BASE_URL = 'https://app.synqdrive.eu';
    process.env.ELEVENLABS_WEBHOOK_SECRET = 'test-secret';

    prisma = {
      voiceAssistant: {
        findFirst: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          escalationPhone: '+491234567890',
          phoneNumber: null,
        }),
        update: jest.fn(async ({ data }) => ({ id: ASSISTANT_ID, ...data })),
      },
      voiceAgentDeployment: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      organizationMembership: { findFirst: jest.fn().mockResolvedValue(null) },
      organizationRole: { findFirst: jest.fn().mockResolvedValue(null) },
      station: { findFirst: jest.fn().mockResolvedValue(null) },
      voicePhoneNumber: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    readinessService = new AgentDeploymentReadinessService(prisma as any);

    deploymentRepository = {
      findDraftByAssistant: jest.fn(),
      findActiveByAssistant: jest.fn(),
      findProvisioningForOrganization: jest.fn(),
      getNextVersion: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
      supersedeActiveDeployments: jest.fn(),
    } as unknown as jest.Mocked<VoiceAgentDeploymentRepository>;

    provisioningJobRepository = {
      persistOrGet: jest.fn(),
      updateProgress: jest.fn(),
    } as unknown as jest.Mocked<VoiceProvisioningJobRepository>;

    elevenLabs = {
      createAgent: jest.fn(),
      updateAgent: jest.fn(),
      getAgent: jest.fn(),
      updatePostCallConfiguration: jest.fn(),
    } as unknown as jest.Mocked<ElevenLabsProviderAdapter>;

    service = new AgentDeploymentService(
      prisma as any,
      deploymentRepository,
      provisioningJobRepository,
      elevenLabs,
      new AgentDeploymentDiffService(),
      readinessService,
      { record: jest.fn() } as unknown as AuditService,
      {
        assertCapability: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
      } as unknown as import('@modules/voice-entitlement/voice-entitlement.service').VoiceEntitlementService,
      {
        assertSurfaceAllowed: jest.fn().mockResolvedValue({ status: 'CANARY' }),
      } as unknown as import('@modules/voice-rollout/voice-rollout.service').VoiceRolloutService,
    );
  });

  afterEach(() => {
    delete process.env.VOICE_AI_PROVISIONING_STAGING_ENABLED;
    delete process.env.TWILIO_VOICE_WEBHOOK_BASE_URL;
    delete process.env.ELEVENLABS_WEBHOOK_SECRET;
  });

  function mockAssistantFound(assistant = makeAssistant()) {
    prisma.voiceAssistant.findFirst.mockResolvedValue(assistant);
  }

  it('rejects draft save when staging flag is disabled', async () => {
    delete process.env.VOICE_AI_PROVISIONING_STAGING_ENABLED;
    mockAssistantFound();
    await expect(service.saveDraft(ORG_ID, { assistantName: 'X' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('creates and returns a draft from assistant defaults', async () => {
    mockAssistantFound();
    deploymentRepository.findDraftByAssistant.mockResolvedValue(null);
    deploymentRepository.create.mockResolvedValue({
      id: 'draft-1',
      voiceAssistantId: ASSISTANT_ID,
      configHash: baseHash,
      configSnapshot: baseConfig,
      updatedAt: new Date('2026-07-17T12:00:00.000Z'),
    } as any);

    const draft = await service.getDraft(ORG_ID);
    expect(draft.deploymentId).toBe('draft-1');
    expect(draft.config.assistantName).toBe('Fleet Assistant');
    expect(draft.configHash).toBe(baseHash);
    expect(draft.config.mcpToolRefs.length).toBeGreaterThan(0);
  });

  it('validates and saves draft changes with config hash', async () => {
    mockAssistantFound();
    deploymentRepository.findDraftByAssistant.mockResolvedValue({
      id: 'draft-1',
      configSnapshot: baseConfig,
      configHash: baseHash,
      updatedAt: new Date('2026-07-17T12:00:00.000Z'),
    } as any);
    deploymentRepository.update.mockResolvedValue({
      id: 'draft-1',
      voiceAssistantId: ASSISTANT_ID,
      configHash: 'updated-hash',
      configSnapshot: { ...baseConfig, assistantName: 'Updated Assistant', greeting: 'Updated greeting.' },
      updatedAt: new Date('2026-07-17T12:01:00.000Z'),
    } as any);

    const saved = await service.saveDraft(ORG_ID, {
      assistantName: 'Updated Assistant',
      greeting: 'Updated greeting.',
    });

    expect(saved.config.assistantName).toBe('Updated Assistant');
    expect(saved.config.greeting).toBe('Updated greeting.');
    expect(saved.configHash).not.toBe(baseHash);
    expect(deploymentRepository.update).toHaveBeenCalled();
  });

  it('rejects provider payload keys from tenant draft API', async () => {
    mockAssistantFound();
    deploymentRepository.findDraftByAssistant.mockResolvedValue({
      id: 'draft-1',
      configSnapshot: baseConfig,
      updatedAt: new Date(),
    } as any);

    await expect(
      service.saveDraft(ORG_ID, { agent_id: 'secret-agent' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('builds human-readable diff without exposing raw voice ids', async () => {
    mockAssistantFound();
    const changedConfig = {
      ...baseConfig,
      assistantName: 'Changed Name',
      voiceName: 'Changed Voice',
      voiceId: 'voice-secret-abcdefghijklmnop',
    };
    deploymentRepository.findDraftByAssistant.mockResolvedValue({
      id: 'draft-1',
      configSnapshot: changedConfig,
    } as any);
    deploymentRepository.findActiveByAssistant.mockResolvedValue({
      id: 'active-1',
      version: 2,
      configSnapshot: baseConfig,
    } as any);

    const diff = await service.getDiff(ORG_ID);
    expect(diff.hasActiveDeployment).toBe(true);
    expect(diff.activeVersion).toBe(2);
    expect(diff.changes.some((entry) => entry.field === 'assistantName' && entry.changed)).toBe(true);
    const voiceChange = diff.changes.find((entry) => entry.field === 'voiceId');
    expect(voiceChange?.draftValue).toContain('***');
    expect(voiceChange?.draftValue).not.toContain('abcdefghijklmnop');
  });

  it('deploys a new version via ElevenLabs adapter and verifies provider state', async () => {
    mockAssistantFound();
    deploymentRepository.findDraftByAssistant.mockResolvedValue({
      id: 'draft-1',
      configSnapshot: baseConfig,
    } as any);
    provisioningJobRepository.persistOrGet.mockResolvedValue({
      job: {
        id: 'job-1',
        status: VoiceProvisioningJobStatus.PENDING,
        deploymentId: null,
      },
      created: true,
    } as any);
    deploymentRepository.findProvisioningForOrganization.mockResolvedValue(null);
    deploymentRepository.findActiveByAssistant.mockResolvedValue(null);
    deploymentRepository.getNextVersion.mockResolvedValue(1);
    deploymentRepository.create.mockResolvedValue({
      id: 'dep-1',
      version: 1,
      voiceAssistantId: ASSISTANT_ID,
    } as any);
    deploymentRepository.update.mockResolvedValue({} as any);
    elevenLabs.createAgent.mockResolvedValue({
      deploymentId: 'dep-1',
      maskedAgentRef: 'agen***ref1',
      externalAgentId: 'agent_created_123',
    });
    elevenLabs.getAgent.mockResolvedValue({
      deploymentId: 'dep-1',
      maskedAgentRef: 'agen***ref1',
      name: baseConfig.assistantName,
      status: 'active',
    });
    elevenLabs.updatePostCallConfiguration.mockResolvedValue({
      deploymentId: 'dep-1',
      webhookConfigured: true,
    });
    prisma.voiceAgentDeployment.update.mockResolvedValue({
      id: 'dep-1',
      version: 1,
      status: VoiceAgentDeploymentStatus.ACTIVE,
      configHash: baseHash,
      maskedExternalRef: 'agen***ref1',
    });

    const result = await service.deploy(ORG_ID, {
      confirm: true,
      idempotencyKey: 'deploy-1',
      userId: 'user-1',
    });

    expect(result.version).toBe(1);
    expect(result.status).toBe(VoiceAgentDeploymentStatus.ACTIVE);
    expect(result.maskedExternalRef).toBe('agen***ref1');
    expect(elevenLabs.createAgent).toHaveBeenCalled();
    expect(elevenLabs.updatePostCallConfiguration).toHaveBeenCalled();
    expect(provisioningJobRepository.updateProgress).toHaveBeenCalledWith(
      ORG_ID,
      'job-1',
      expect.objectContaining({ status: VoiceProvisioningJobStatus.COMPLETED }),
    );
    expect(prisma.voiceAssistant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ elevenLabsAgentId: 'agent_created_123' }),
      }),
    );
  });

  it('marks deployment failed on provider error without deleting the row', async () => {
    mockAssistantFound(makeAssistant({ elevenLabsAgentId: 'agent_existing_1' }));
    deploymentRepository.findDraftByAssistant.mockResolvedValue({
      id: 'draft-1',
      configSnapshot: baseConfig,
    } as any);
    provisioningJobRepository.persistOrGet.mockResolvedValue({
      job: { id: 'job-2', status: VoiceProvisioningJobStatus.PENDING, deploymentId: null },
      created: true,
    } as any);
    deploymentRepository.findProvisioningForOrganization.mockResolvedValue(null);
    deploymentRepository.findActiveByAssistant.mockResolvedValue({
      id: 'active-1',
      version: 1,
      protectedExternalRef: 'agent_existing_1',
    } as any);
    deploymentRepository.getNextVersion.mockResolvedValue(2);
    deploymentRepository.create.mockResolvedValue({ id: 'dep-fail', version: 2 } as any);
    deploymentRepository.update.mockResolvedValue({} as any);
    elevenLabs.updateAgent.mockRejectedValue(
      new ElevenLabsProviderError(ElevenLabsProviderErrorCode.PROVIDER_UNAVAILABLE, 'Provider down'),
    );

    await expect(
      service.deploy(ORG_ID, { confirm: true, idempotencyKey: 'deploy-fail' }),
    ).rejects.toBeInstanceOf(ElevenLabsProviderError);

    expect(deploymentRepository.update).toHaveBeenCalledWith(
      ORG_ID,
      'dep-fail',
      expect.objectContaining({ status: VoiceAgentDeploymentStatus.FAILED }),
    );
    expect(provisioningJobRepository.updateProgress).toHaveBeenCalledWith(
      ORG_ID,
      'job-2',
      expect.objectContaining({
        status: VoiceProvisioningJobStatus.FAILED,
        errorMessage: expect.not.stringContaining('agent_existing_1'),
      }),
    );
  });

  it('blocks parallel deployments for the same organization', async () => {
    mockAssistantFound();
    deploymentRepository.findDraftByAssistant.mockResolvedValue({
      id: 'draft-1',
      configSnapshot: baseConfig,
    } as any);
    provisioningJobRepository.persistOrGet.mockResolvedValue({
      job: {
        id: 'job-3',
        status: VoiceProvisioningJobStatus.IN_PROGRESS,
        deploymentId: 'dep-inflight',
      },
      created: false,
    } as any);

    await expect(
      service.deploy(ORG_ID, { confirm: true, idempotencyKey: 'parallel-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('replays idempotent deploy requests', async () => {
    mockAssistantFound();
    deploymentRepository.findDraftByAssistant.mockResolvedValue({
      id: 'draft-1',
      configSnapshot: baseConfig,
    } as any);
    provisioningJobRepository.persistOrGet.mockResolvedValue({
      job: {
        id: 'job-4',
        status: VoiceProvisioningJobStatus.COMPLETED,
        deploymentId: 'dep-done',
      },
      created: false,
    } as any);
    deploymentRepository.findById.mockResolvedValue({
      id: 'dep-done',
      version: 3,
      status: VoiceAgentDeploymentStatus.ACTIVE,
      configHash: baseHash,
      maskedExternalRef: 'agen***done',
    } as any);

    const result = await service.deploy(ORG_ID, {
      confirm: true,
      idempotencyKey: 'same-key',
    });

    expect(result.idempotentReplay).toBe(true);
    expect(result.deploymentId).toBe('dep-done');
    expect(elevenLabs.createAgent).not.toHaveBeenCalled();
    expect(elevenLabs.updateAgent).not.toHaveBeenCalled();
  });

  it('rolls back to the previous successful version', async () => {
    mockAssistantFound(makeAssistant({ elevenLabsAgentId: 'agent_active' }));
    deploymentRepository.findActiveByAssistant.mockResolvedValue({
      id: 'active-2',
      version: 2,
      previousVersion: 1,
      protectedExternalRef: 'agent_active',
    } as any);
    deploymentRepository.findProvisioningForOrganization.mockResolvedValue(null);
    deploymentRepository.getNextVersion.mockResolvedValue(3);
    deploymentRepository.create.mockResolvedValue({ id: 'rollback-dep', version: 3 } as any);
    deploymentRepository.update.mockResolvedValue({} as any);
    prisma.voiceAgentDeployment.findFirst.mockResolvedValue({
      id: 'dep-v1',
      version: 1,
      previousVersion: null,
      configSnapshot: {
        ...baseConfig,
        assistantName: 'Rollback Name',
        greeting: 'Rollback greeting.',
      },
    });
    elevenLabs.updateAgent.mockResolvedValue({
      deploymentId: 'rollback-dep',
      maskedAgentRef: 'agen***rollback',
      externalAgentId: 'agent_active',
    });
    elevenLabs.getAgent.mockResolvedValue({
      deploymentId: 'rollback-dep',
      maskedAgentRef: 'agen***rollback',
      name: 'Rollback Name',
    });
    prisma.voiceAgentDeployment.update.mockResolvedValue({
      id: 'rollback-dep',
      version: 3,
      status: VoiceAgentDeploymentStatus.ACTIVE,
      maskedExternalRef: 'agen***rollback',
    });

    const result = await service.rollback(ORG_ID, { confirm: true, userId: 'admin-1' });
    expect(result.restoredFromVersion).toBe(1);
    expect(result.status).toBe(VoiceAgentDeploymentStatus.ACTIVE);
    expect(elevenLabs.updateAgent).toHaveBeenCalled();
  });

  it('returns not found for foreign organization assistant lookup', async () => {
    prisma.voiceAssistant.findFirst.mockResolvedValue(null);
    await expect(service.getDraft(OTHER_ORG_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not persist secret provider auth tokens in deployment snapshots', async () => {
    mockAssistantFound();
    deploymentRepository.findDraftByAssistant.mockResolvedValue(null);
    deploymentRepository.create.mockResolvedValue({
      id: 'draft-safe',
      voiceAssistantId: ASSISTANT_ID,
      configSnapshot: baseConfig,
      configHash: baseHash,
      updatedAt: new Date(),
    } as any);

    const draft = await service.getDraft(ORG_ID);
    const serialized = JSON.stringify(draft.config);
    expect(serialized).not.toMatch(/xi-api-key/i);
    expect(serialized).not.toMatch(/authToken/i);
    expect(serialized).not.toContain('agent_');
  });
});

describe('AgentDeploymentDiffService', () => {
  it('reports no changes when draft matches active hash', () => {
    const config = buildCanonicalAgentConfigFromAssistant(makeAssistant());
    const diff = new AgentDeploymentDiffService().buildDiff({
      draft: config,
      draftDeploymentId: 'draft-1',
      activeConfig: config,
      activeVersion: 1,
    });
    expect(diff.configHashMatchesActive).toBe(true);
    expect(diff.changes.every((entry) => !entry.changed)).toBe(true);
  });
});
