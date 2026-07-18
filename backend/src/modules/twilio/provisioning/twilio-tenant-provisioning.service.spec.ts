import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  VoiceControlPlaneProvider,
  VoicePhoneRegulatoryStatus,
  VoiceProviderAccountType,
  VoiceProvisioningJobStatus,
  VoiceProvisioningJobType,
  VoiceSubscriptionStatus,
} from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import {
  VoicePhoneNumberRepository,
  VoiceProvisioningJobRepository,
  VoiceSubscriptionRepository,
} from '@modules/voice-assistant/control-plane/voice-control-plane.repository';
import { resetSecretMemoryStoreForTests } from '../secrets/secret-ref.resolver';
import {
  VOICE_AI_PROVISIONING_STAGING_FLAG,
  VOICE_AI_SUBACCOUNTS_FLAG,
} from './twilio-provisioning.config';
import { TwilioProvisioningProviderClient } from './twilio-provisioning-provider.client';
import { TwilioSecretStoreService } from './twilio-secret-store.service';
import { TwilioTenantProvisioningService } from './twilio-tenant-provisioning.service';
import { TwilioControlPlaneClient } from '../twilio-control-plane.client';
import { TwilioTenantClientFactory } from '../twilio-tenant-client.factory';
import { TwilioTenantIsolationViolationError } from '../errors/twilio-provider.errors';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

function makePrisma() {
  return {
    organization: {
      findUnique: jest.fn(),
    },
    voiceProviderAccount: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    voicePhoneNumber: {
      findFirst: jest.fn(),
    },
  } as any;
}

function enableProvisioningFlags() {
  process.env[VOICE_AI_SUBACCOUNTS_FLAG] = 'true';
  process.env[VOICE_AI_PROVISIONING_STAGING_FLAG] = 'true';
}

function disableProvisioningFlags() {
  delete process.env[VOICE_AI_SUBACCOUNTS_FLAG];
  delete process.env[VOICE_AI_PROVISIONING_STAGING_FLAG];
}

describe('TwilioTenantProvisioningService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: TwilioTenantProvisioningService;
  let subscriptionRepository: jest.Mocked<VoiceSubscriptionRepository>;
  let phoneNumberRepository: jest.Mocked<VoicePhoneNumberRepository>;
  let provisioningJobRepository: jest.Mocked<VoiceProvisioningJobRepository>;
  let providerClient: jest.Mocked<TwilioProvisioningProviderClient>;
  let controlPlane: { isConfigured: jest.Mock };
  let tenantClientFactory: { getClientForOrganization: jest.Mock; invalidateOrganization: jest.Mock };
  let audit: { record: jest.Mock };

  beforeEach(() => {
    resetSecretMemoryStoreForTests();
    disableProvisioningFlags();
    prisma = makePrisma();
    subscriptionRepository = {
      listByOrganization: jest.fn(),
    } as unknown as jest.Mocked<VoiceSubscriptionRepository>;
    phoneNumberRepository = {
      create: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<VoicePhoneNumberRepository>;
    provisioningJobRepository = {
      persistOrGet: jest.fn(),
      updateProgress: jest.fn(),
    } as unknown as jest.Mocked<VoiceProvisioningJobRepository>;
    providerClient = {
      createSubaccount: jest.fn(),
      createRestrictedSubaccountApiKey: jest.fn(),
      searchAvailablePhoneNumbers: jest.fn(),
      purchasePhoneNumber: jest.fn(),
      getRegulatoryStatus: jest.fn(),
    } as unknown as jest.Mocked<TwilioProvisioningProviderClient>;
    controlPlane = { isConfigured: jest.fn().mockReturnValue(true) };
    tenantClientFactory = {
      getClientForOrganization: jest.fn().mockResolvedValue({ incomingPhoneNumbers: { create: jest.fn() } }),
      invalidateOrganization: jest.fn(),
    };
    audit = { record: jest.fn().mockResolvedValue('audit-1') };

    service = new TwilioTenantProvisioningService(
      prisma,
      { get: jest.fn() } as unknown as ConfigService,
      controlPlane as unknown as TwilioControlPlaneClient,
      tenantClientFactory as unknown as TwilioTenantClientFactory,
      providerClient,
      new TwilioSecretStoreService({ registerMemoryJson: jest.fn((key, value) => `env-json://${key}`) } as any),
      subscriptionRepository,
      phoneNumberRepository,
      provisioningJobRepository,
      audit as unknown as AuditService,
      {
        assertSurfaceAllowed: jest.fn().mockResolvedValue({ status: 'CANARY' }),
      } as unknown as import('@modules/voice-rollout/voice-rollout.service').VoiceRolloutService,
    );
  });

  afterEach(() => {
    disableProvisioningFlags();
    service.resetCachesForTests();
  });

  function mockActiveSubscription(orgId = ORG_A) {
    prisma.organization.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === orgId ? { id: orgId } : null,
    );
    subscriptionRepository.listByOrganization.mockImplementation(
      ((organizationId: string) =>
        Promise.resolve(
          organizationId === orgId
            ? [{ id: 'sub-1', status: VoiceSubscriptionStatus.ACTIVE }]
            : [],
        )) as any,
    );
  }

  it('preview is non-mutating and reports blockers', async () => {
    prisma.organization.findUnique.mockResolvedValue({ id: ORG_A });
    subscriptionRepository.listByOrganization.mockResolvedValue([]);
    prisma.voiceProviderAccount.findFirst.mockResolvedValue(null);
    controlPlane.isConfigured.mockReturnValue(false);

    const preview = await service.previewProvisioning(ORG_A);

    expect(preview.mutating).toBe(false);
    expect(preview.ready).toBe(false);
    expect(preview.blockers.length).toBeGreaterThan(0);
    expect(providerClient.createSubaccount).not.toHaveBeenCalled();
  });

  it('dry-run subaccount provisioning does not call Twilio provider APIs', async () => {
    enableProvisioningFlags();
    mockActiveSubscription();
    prisma.voiceProviderAccount.findFirst.mockResolvedValue(null);
    provisioningJobRepository.persistOrGet.mockResolvedValue({
      job: {
        id: 'job-1',
        jobType: VoiceProvisioningJobType.TWILIO_SUBACCOUNT_CREATE,
        status: VoiceProvisioningJobStatus.PENDING,
        currentStep: 'validate_prerequisites',
        progressPct: 5,
        idempotencyKey: 'idem-1',
        providerAccountId: null,
        phoneNumberId: null,
        errorClass: null,
        errorMessage: null,
        retryCount: 0,
      },
      created: true,
    } as any);

    const result = await service.provisionSubaccount({
      organizationId: ORG_A,
      actor: { idempotencyKey: 'idem-1', confirm: true, dryRun: true },
    });

    expect(result.dryRun).toBe(true);
    expect(result.mutating).toBe(false);
    expect(providerClient.createSubaccount).not.toHaveBeenCalled();
  });

  it('creates subaccount idempotently when provider account already exists', async () => {
    enableProvisioningFlags();
    mockActiveSubscription();
    prisma.voiceProviderAccount.findFirst.mockResolvedValue({
      id: 'acct-1',
      maskedExternalRef: 'AC***1234',
      secretRef: 'env-json://VOICE_TWILIO_SUB_ORG_A',
    });
    provisioningJobRepository.persistOrGet.mockResolvedValue({
      job: {
        id: 'job-1',
        jobType: VoiceProvisioningJobType.TWILIO_SUBACCOUNT_CREATE,
        status: VoiceProvisioningJobStatus.COMPLETED,
        currentStep: 'completed',
        progressPct: 100,
        idempotencyKey: 'idem-1',
        providerAccountId: 'acct-1',
        phoneNumberId: null,
        errorClass: null,
        errorMessage: null,
        retryCount: 0,
      },
      created: false,
    } as any);

    const result = await service.provisionSubaccount({
      organizationId: ORG_A,
      actor: { idempotencyKey: 'idem-1', confirm: true },
    });

    expect(result.providerAccountId).toBe('acct-1');
    expect(providerClient.createSubaccount).not.toHaveBeenCalled();
  });

  it('blocks duplicate phone purchase via idempotency and digest lookup', async () => {
    enableProvisioningFlags();
    mockActiveSubscription();
    prisma.voiceProviderAccount.findFirst.mockResolvedValue({
      id: 'acct-1',
      maskedExternalRef: 'AC***1234',
      secretRef: 'env-json://test',
    });
    prisma.voicePhoneNumber.findFirst.mockResolvedValue({
      id: 'phone-1',
      maskedPhoneNumber: '+49***67',
      lifecycle: 'ACTIVE',
      regulatoryStatus: VoicePhoneRegulatoryStatus.APPROVED,
    });
    provisioningJobRepository.persistOrGet.mockResolvedValue({
      job: {
        id: 'job-2',
        jobType: VoiceProvisioningJobType.TWILIO_NUMBER_PURCHASE,
        status: VoiceProvisioningJobStatus.COMPLETED,
        currentStep: 'completed',
        progressPct: 100,
        idempotencyKey: 'purchase-1',
        providerAccountId: 'acct-1',
        phoneNumberId: 'phone-1',
        errorClass: null,
        errorMessage: null,
        retryCount: 0,
      },
      created: false,
    } as any);

    const result = await service.purchasePhoneNumber({
      organizationId: ORG_A,
      phoneNumber: '+491701234567',
      actor: { idempotencyKey: 'purchase-1', confirm: true },
    });

    expect(result.phoneNumberId).toBe('phone-1');
    expect(providerClient.purchasePhoneNumber).not.toHaveBeenCalled();
  });

  it('rejects purchase when regulatory approval is missing', async () => {
    enableProvisioningFlags();
    mockActiveSubscription();
    prisma.voiceProviderAccount.findFirst.mockResolvedValue({
      id: 'acct-1',
      maskedExternalRef: 'AC***1234',
      secretRef: 'env-json://test',
    });
    prisma.voicePhoneNumber.findFirst.mockResolvedValue({
      regulatoryStatus: VoicePhoneRegulatoryStatus.PENDING,
      regulatoryDetails: {
        bundle: 'pending',
        address: 'pending',
        endUser: 'pending',
        overall: VoicePhoneRegulatoryStatus.PENDING,
      },
    });
    provisioningJobRepository.persistOrGet.mockResolvedValue({
      job: {
        id: 'job-3',
        jobType: VoiceProvisioningJobType.TWILIO_NUMBER_PURCHASE,
        status: VoiceProvisioningJobStatus.PENDING,
        currentStep: 'validate_regulatory',
        progressPct: 10,
        idempotencyKey: 'purchase-2',
        providerAccountId: 'acct-1',
        phoneNumberId: null,
        errorClass: null,
        errorMessage: null,
        retryCount: 0,
      },
      created: true,
    } as any);

    await expect(
      service.purchasePhoneNumber({
        organizationId: ORG_A,
        phoneNumber: '+491701234567',
        actor: { idempotencyKey: 'purchase-2', confirm: true },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects foreign organization access', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);

    await expect(service.previewProvisioning(ORG_B)).rejects.toBeInstanceOf(
      TwilioTenantIsolationViolationError,
    );
  });

  it('requires feature flag for mutating provisioning', async () => {
    mockActiveSubscription();
    prisma.voiceProviderAccount.findFirst.mockResolvedValue(null);
    provisioningJobRepository.persistOrGet.mockResolvedValue({
      job: {
        id: 'job-4',
        jobType: VoiceProvisioningJobType.TWILIO_SUBACCOUNT_CREATE,
        status: VoiceProvisioningJobStatus.PENDING,
        currentStep: 'validate_prerequisites',
        progressPct: 5,
        idempotencyKey: 'idem-2',
        providerAccountId: null,
        phoneNumberId: null,
        errorClass: null,
        errorMessage: null,
        retryCount: 0,
      },
      created: true,
    } as any);

    await expect(
      service.provisionSubaccount({
        organizationId: ORG_A,
        actor: { idempotencyKey: 'idem-2', confirm: true },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
