import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  VoiceAgentDeploymentStatus,
  VoiceControlPlaneProvider,
  VoiceElevenLabsImportStatus,
  VoicePhoneRegulatoryStatus,
  VoiceProviderAccountStatus,
  VoiceProviderAccountType,
  VoiceProvisioningJobStatus,
  VoiceProvisioningJobType,
} from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { TwilioTenantClientFactory } from '@modules/twilio/twilio-tenant-client.factory';
import { TWILIO_DEFAULT_EDGE, TWILIO_DEFAULT_REGION } from '@config/index';
import { ElevenLabsProviderAdapter } from '../elevenlabs-provider/elevenlabs-provider.adapter';
import { ElevenLabsProviderTenantResolver } from '../elevenlabs-provider/elevenlabs-provider.tenant-resolver';
import {
  ElevenLabsInvalidConfigurationError,
  ElevenLabsRegionMismatchError,
  ElevenLabsTenantIsolationViolationError,
} from '../elevenlabs-provider/elevenlabs-provider.errors';
import {
  VoiceAgentDeploymentRepository,
  VoicePhoneNumberRepository,
  VoiceProvisioningJobRepository,
} from '../control-plane/voice-control-plane.repository';
import { ElevenLabsTwilioImportCredentialsResolver } from './elevenlabs-twilio-import-credentials.resolver';
import { ElevenLabsTwilioImportProvisioningService } from './elevenlabs-twilio-import-provisioning.service';

const ORG_ID = 'org-el-1';
const PHONE_ID = 'phone-el-1';
const DEPLOYMENT_ID = 'dep-el-1';

function makePrisma() {
  return {
    voiceProviderAccount: { findFirst: jest.fn() },
    voicePhoneNumber: { findFirst: jest.fn() },
    voiceAgentDeployment: { findFirst: jest.fn() },
  } as any;
}

describe('ElevenLabsTwilioImportProvisioningService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ElevenLabsTwilioImportProvisioningService;
  let elevenLabs: jest.Mocked<ElevenLabsProviderAdapter>;
  let credentialsResolver: jest.Mocked<ElevenLabsTwilioImportCredentialsResolver>;
  let phoneNumberRepository: jest.Mocked<VoicePhoneNumberRepository>;
  let deploymentRepository: jest.Mocked<VoiceAgentDeploymentRepository>;
  let provisioningJobRepository: jest.Mocked<VoiceProvisioningJobRepository>;
  let tenantResolver: jest.Mocked<ElevenLabsProviderTenantResolver>;
  let twilioTenantFactory: { getClientForOrganization: jest.Mock };

  const basePhone = {
    id: PHONE_ID,
    organizationId: ORG_ID,
    providerAccountId: 'acct-1',
    protectedExternalRef: 'PNtwilio123',
    protectedElevenLabsRef: null,
    maskedPhoneNumber: '+49***67',
    regulatoryStatus: VoicePhoneRegulatoryStatus.APPROVED,
    elevenLabsImportStatus: VoiceElevenLabsImportStatus.NOT_IMPORTED,
    capabilities: { voice: true },
    voiceAssistantId: null,
  };

  beforeEach(() => {
    process.env.VOICE_AI_SUBACCOUNTS = 'true';
    process.env.VOICE_AI_NATIVE_TELEPHONY = 'true';
    process.env.VOICE_AI_PROVISIONING_STAGING_ENABLED = 'true';

    prisma = makePrisma();
    elevenLabs = {
      importTwilioPhoneNumber: jest.fn(),
      assignPhoneNumberToAgent: jest.fn(),
      unassignPhoneNumberFromAgent: jest.fn(),
    } as unknown as jest.Mocked<ElevenLabsProviderAdapter>;
    credentialsResolver = {
      resolveSubaccountImportCredentials: jest.fn().mockResolvedValue({
        accountSid: 'ACsub123',
        authToken: 'sub-auth-token',
      }),
    } as unknown as jest.Mocked<ElevenLabsTwilioImportCredentialsResolver>;
    phoneNumberRepository = {
      findById: jest.fn(),
      updateImportState: jest.fn(async (_org, _id, data) => ({ ...basePhone, ...data })),
    } as unknown as jest.Mocked<VoicePhoneNumberRepository>;
    deploymentRepository = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<VoiceAgentDeploymentRepository>;
    provisioningJobRepository = {
      persistOrGet: jest.fn(),
      updateProgress: jest.fn(),
    } as unknown as jest.Mocked<VoiceProvisioningJobRepository>;
    tenantResolver = {
      resolveActiveDeployment: jest.fn(),
      resolveAgentRef: jest.fn(),
    } as unknown as jest.Mocked<ElevenLabsProviderTenantResolver>;
    twilioTenantFactory = {
      getClientForOrganization: jest.fn().mockResolvedValue({
        incomingPhoneNumbers: jest.fn(() => ({
          fetch: jest.fn().mockResolvedValue({ phoneNumber: '+491701234567' }),
        })),
      }),
    };

    service = new ElevenLabsTwilioImportProvisioningService(
      prisma,
      elevenLabs,
      tenantResolver as unknown as ElevenLabsProviderTenantResolver,
      credentialsResolver,
      twilioTenantFactory as unknown as TwilioTenantClientFactory,
      phoneNumberRepository,
      deploymentRepository,
      provisioningJobRepository,
      { record: jest.fn() } as unknown as AuditService,
      {
        assertSurfaceAllowed: jest.fn().mockResolvedValue({ status: 'CANARY' }),
      } as unknown as import('@modules/voice-rollout/voice-rollout.service').VoiceRolloutService,
    );
  });

  afterEach(() => {
    delete process.env.VOICE_AI_SUBACCOUNTS;
    delete process.env.VOICE_AI_NATIVE_TELEPHONY;
    delete process.env.VOICE_AI_PROVISIONING_STAGING_ENABLED;
  });

  function mockReadyContext() {
    phoneNumberRepository.findById.mockResolvedValue(basePhone as any);
    prisma.voiceProviderAccount.findFirst.mockResolvedValue({
      id: 'acct-1',
      status: VoiceProviderAccountStatus.ACTIVE,
      region: TWILIO_DEFAULT_REGION,
      edge: TWILIO_DEFAULT_EDGE,
    });
    prisma.voiceAgentDeployment.findFirst.mockResolvedValue({
      id: DEPLOYMENT_ID,
      organizationId: ORG_ID,
      status: VoiceAgentDeploymentStatus.ACTIVE,
      voiceAssistantId: 'assistant-1',
      provider: VoiceControlPlaneProvider.ELEVENLABS,
    });
    deploymentRepository.findById.mockResolvedValue({
      id: DEPLOYMENT_ID,
      organizationId: ORG_ID,
      status: VoiceAgentDeploymentStatus.ACTIVE,
      voiceAssistantId: 'assistant-1',
      provider: VoiceControlPlaneProvider.ELEVENLABS,
    } as any);
    prisma.voicePhoneNumber.findFirst.mockResolvedValue(null);
    tenantResolver.resolveActiveDeployment.mockResolvedValue({
      id: DEPLOYMENT_ID,
      voiceAssistantId: 'assistant-1',
    } as any);
    tenantResolver.resolveAgentRef.mockResolvedValue({
      deploymentId: DEPLOYMENT_ID,
      maskedExternalRef: 'agen***1234',
      externalAgentId: 'agent_123',
      organizationId: ORG_ID,
    });
  }

  it('imports and assigns with mocked provider on success', async () => {
    mockReadyContext();
    provisioningJobRepository.persistOrGet.mockResolvedValue({
      job: {
        id: 'job-1',
        status: VoiceProvisioningJobStatus.PENDING,
        currentStep: 'readiness',
        progressPct: 5,
        idempotencyKey: 'idem-1',
        errorClass: null,
        errorMessage: null,
        retryCount: 0,
      },
      created: true,
    } as any);
    (provisioningJobRepository.updateProgress as jest.Mock)
      .mockResolvedValueOnce({
        id: 'job-1',
        status: VoiceProvisioningJobStatus.IN_PROGRESS,
        currentStep: 'import_number',
        progressPct: 20,
        idempotencyKey: 'idem-1',
        errorClass: null,
        errorMessage: null,
        retryCount: 0,
      })
      .mockResolvedValueOnce({
        id: 'job-1',
        status: VoiceProvisioningJobStatus.IN_PROGRESS,
        currentStep: 'assign_agent',
        progressPct: 70,
        idempotencyKey: 'idem-1',
        errorClass: null,
        errorMessage: null,
        retryCount: 0,
      })
      .mockResolvedValueOnce({
        id: 'job-1',
        status: VoiceProvisioningJobStatus.COMPLETED,
        currentStep: 'completed',
        progressPct: 100,
        idempotencyKey: 'idem-1',
        errorClass: null,
        errorMessage: null,
        retryCount: 0,
      });
    elevenLabs.importTwilioPhoneNumber.mockResolvedValue({
      controlPlanePhoneNumberId: PHONE_ID,
      elevenLabsPhoneId: 'phnum_el_123456',
      maskedPhoneRef: 'phnu***3456',
    });

    const result = await service.importAndAssign({
      organizationId: ORG_ID,
      phoneNumberId: PHONE_ID,
      actor: { idempotencyKey: 'idem-1', confirm: true },
    });

    expect(result.importStatus).toBe(VoiceElevenLabsImportStatus.ASSIGNED);
    expect(elevenLabs.importTwilioPhoneNumber).toHaveBeenCalled();
    expect(elevenLabs.assignPhoneNumberToAgent).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      phoneNumberId: PHONE_ID,
      deploymentId: DEPLOYMENT_ID,
    });
  });

  it('skips import when number is already imported', async () => {
    mockReadyContext();
    phoneNumberRepository.findById.mockResolvedValue({
      ...basePhone,
      protectedElevenLabsRef: 'phnum_existing',
      elevenLabsImportStatus: VoiceElevenLabsImportStatus.IMPORTED,
    } as any);
    provisioningJobRepository.persistOrGet.mockResolvedValue({
      job: {
        id: 'job-2',
        status: VoiceProvisioningJobStatus.PENDING,
        currentStep: 'readiness',
        progressPct: 5,
        idempotencyKey: 'idem-2',
        errorClass: null,
        errorMessage: null,
        retryCount: 0,
      },
      created: true,
    } as any);
    (provisioningJobRepository.updateProgress as jest.Mock)
      .mockResolvedValueOnce({
        id: 'job-2',
        status: VoiceProvisioningJobStatus.IN_PROGRESS,
        currentStep: 'import_number',
        progressPct: 20,
        idempotencyKey: 'idem-2',
        errorClass: null,
        errorMessage: null,
        retryCount: 0,
      })
      .mockResolvedValueOnce({
        id: 'job-2',
        status: VoiceProvisioningJobStatus.IN_PROGRESS,
        currentStep: 'assign_agent',
        progressPct: 70,
        idempotencyKey: 'idem-2',
        errorClass: null,
        errorMessage: null,
        retryCount: 0,
      })
      .mockResolvedValueOnce({
        id: 'job-2',
        status: VoiceProvisioningJobStatus.COMPLETED,
        currentStep: 'completed',
        progressPct: 100,
        idempotencyKey: 'idem-2',
        errorClass: null,
        errorMessage: null,
        retryCount: 0,
      });

    await service.importAndAssign({
      organizationId: ORG_ID,
      phoneNumberId: PHONE_ID,
      actor: { idempotencyKey: 'idem-2', confirm: true },
    });

    expect(elevenLabs.importTwilioPhoneNumber).not.toHaveBeenCalled();
    expect(elevenLabs.assignPhoneNumberToAgent).toHaveBeenCalled();
  });

  it('dry-run does not call provider APIs', async () => {
    mockReadyContext();
    provisioningJobRepository.persistOrGet.mockResolvedValue({
      job: {
        id: 'job-3',
        status: VoiceProvisioningJobStatus.PENDING,
        currentStep: 'readiness',
        progressPct: 5,
        idempotencyKey: 'idem-3',
        errorClass: null,
        errorMessage: null,
        retryCount: 0,
      },
      created: true,
    } as any);

    const result = await service.importAndAssign({
      organizationId: ORG_ID,
      phoneNumberId: PHONE_ID,
      actor: { idempotencyKey: 'idem-3', confirm: true, dryRun: true },
    });

    expect(result.dryRun).toBe(true);
    expect(elevenLabs.importTwilioPhoneNumber).not.toHaveBeenCalled();
    expect(elevenLabs.assignPhoneNumberToAgent).not.toHaveBeenCalled();
  });

  it('rejects region mismatch during readiness', async () => {
    phoneNumberRepository.findById.mockResolvedValue(basePhone as any);
    prisma.voiceProviderAccount.findFirst.mockResolvedValue({
      id: 'acct-1',
      status: VoiceProviderAccountStatus.ACTIVE,
      region: 'us1',
      edge: TWILIO_DEFAULT_EDGE,
    });
    prisma.voiceAgentDeployment.findFirst.mockResolvedValue({
      id: DEPLOYMENT_ID,
      organizationId: ORG_ID,
      status: VoiceAgentDeploymentStatus.ACTIVE,
    });
    prisma.voicePhoneNumber.findFirst.mockResolvedValue(null);

    const readiness = await service.evaluateReadiness(ORG_ID, PHONE_ID);
    expect(readiness.ready).toBe(false);
    expect(readiness.regionOk).toBe(false);
  });

  it('rejects wrong organization phone access', async () => {
    phoneNumberRepository.findById.mockResolvedValue(null);
    await expect(service.evaluateReadiness(ORG_ID, 'foreign-phone')).rejects.toBeInstanceOf(
      ElevenLabsTenantIsolationViolationError,
    );
  });

  it('rejects unsupported credentials', async () => {
    mockReadyContext();
    credentialsResolver.resolveSubaccountImportCredentials.mockRejectedValue(
      new ElevenLabsInvalidConfigurationError('Auth Token required'),
    );

    const readiness = await service.evaluateReadiness(ORG_ID, PHONE_ID);
    expect(readiness.credentialMode).toBe('unsupported');
    expect(readiness.ready).toBe(false);
  });

  it('blocks purchase when regulatory approval is missing', async () => {
    mockReadyContext();
    phoneNumberRepository.findById.mockResolvedValue({
      ...basePhone,
      regulatoryStatus: VoicePhoneRegulatoryStatus.PENDING,
    } as any);
    provisioningJobRepository.persistOrGet.mockResolvedValue({
      job: {
        id: 'job-4',
        status: VoiceProvisioningJobStatus.PENDING,
        currentStep: 'readiness',
        progressPct: 5,
        idempotencyKey: 'idem-4',
        errorClass: null,
        errorMessage: null,
        retryCount: 0,
      },
      created: true,
    } as any);

    await expect(
      service.importAndAssign({
        organizationId: ORG_ID,
        phoneNumberId: PHONE_ID,
        actor: { idempotencyKey: 'idem-4', confirm: true },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('detects assignment conflict', async () => {
    mockReadyContext();
    prisma.voicePhoneNumber.findFirst.mockResolvedValue({ id: 'other-phone' });

    const readiness = await service.evaluateReadiness(ORG_ID, PHONE_ID, DEPLOYMENT_ID);
    expect(readiness.assignmentConflict).toBe(true);
    expect(readiness.ready).toBe(false);
  });

  it('rolls back failed assignment without releasing Twilio number', async () => {
    mockReadyContext();
    provisioningJobRepository.persistOrGet.mockResolvedValue({
      job: {
        id: 'job-5',
        status: VoiceProvisioningJobStatus.PENDING,
        currentStep: 'readiness',
        progressPct: 5,
        idempotencyKey: 'idem-5',
        errorClass: null,
        errorMessage: null,
        retryCount: 0,
      },
      created: true,
    } as any);
    (provisioningJobRepository.updateProgress as jest.Mock)
      .mockResolvedValueOnce({
        id: 'job-5',
        status: VoiceProvisioningJobStatus.IN_PROGRESS,
        currentStep: 'import_number',
        progressPct: 20,
        idempotencyKey: 'idem-5',
        errorClass: null,
        errorMessage: null,
        retryCount: 0,
      })
      .mockResolvedValueOnce({
        id: 'job-5',
        status: VoiceProvisioningJobStatus.IN_PROGRESS,
        currentStep: 'assign_agent',
        progressPct: 70,
        idempotencyKey: 'idem-5',
        errorClass: null,
        errorMessage: null,
        retryCount: 0,
      })
      .mockResolvedValueOnce({
        id: 'job-5',
        status: VoiceProvisioningJobStatus.FAILED,
        currentStep: 'failed',
        progressPct: 0,
        idempotencyKey: 'idem-5',
        errorClass: 'CONFIGURATION',
        errorMessage: 'assignment failed',
        retryCount: 1,
      });
    elevenLabs.importTwilioPhoneNumber.mockResolvedValue({
      controlPlanePhoneNumberId: PHONE_ID,
      elevenLabsPhoneId: 'phnum_el_999',
      maskedPhoneRef: 'phnu***0999',
    });
    elevenLabs.assignPhoneNumberToAgent.mockRejectedValue(
      new ElevenLabsRegionMismatchError('assignment failed'),
    );

    await expect(
      service.importAndAssign({
        organizationId: ORG_ID,
        phoneNumberId: PHONE_ID,
        actor: { idempotencyKey: 'idem-5', confirm: true },
      }),
    ).rejects.toBeInstanceOf(ElevenLabsRegionMismatchError);

    expect(elevenLabs.unassignPhoneNumberFromAgent).toHaveBeenCalled();
    expect(phoneNumberRepository.updateImportState).toHaveBeenCalledWith(
      ORG_ID,
      PHONE_ID,
      expect.objectContaining({ elevenLabsImportStatus: VoiceElevenLabsImportStatus.IMPORTED }),
    );
  });

  it('is idempotent for completed jobs', async () => {
    mockReadyContext();
    phoneNumberRepository.findById.mockResolvedValue({
      ...basePhone,
      protectedElevenLabsRef: 'phnum_done',
      elevenLabsImportStatus: VoiceElevenLabsImportStatus.ASSIGNED,
    } as any);
    provisioningJobRepository.persistOrGet.mockResolvedValue({
      job: {
        id: 'job-6',
        status: VoiceProvisioningJobStatus.COMPLETED,
        currentStep: 'completed',
        progressPct: 100,
        idempotencyKey: 'idem-6',
        errorClass: null,
        errorMessage: null,
        retryCount: 0,
      },
      created: false,
    } as any);

    const result = await service.importAndAssign({
      organizationId: ORG_ID,
      phoneNumberId: PHONE_ID,
      actor: { idempotencyKey: 'idem-6', confirm: true },
    });

    expect(result.importStatus).toBe(VoiceElevenLabsImportStatus.ASSIGNED);
    expect(elevenLabs.importTwilioPhoneNumber).not.toHaveBeenCalled();
  });

  it('requires native telephony feature flag', async () => {
    delete process.env.VOICE_AI_NATIVE_TELEPHONY;
    mockReadyContext();
    provisioningJobRepository.persistOrGet.mockResolvedValue({
      job: {
        id: 'job-7',
        status: VoiceProvisioningJobStatus.PENDING,
        currentStep: 'readiness',
        progressPct: 5,
        idempotencyKey: 'idem-7',
        errorClass: null,
        errorMessage: null,
        retryCount: 0,
      },
      created: true,
    } as any);

    await expect(
      service.importAndAssign({
        organizationId: ORG_ID,
        phoneNumberId: PHONE_ID,
        actor: { idempotencyKey: 'idem-7', confirm: true },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
