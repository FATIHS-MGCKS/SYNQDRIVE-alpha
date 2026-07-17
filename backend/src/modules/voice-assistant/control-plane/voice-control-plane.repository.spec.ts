import { NotFoundException } from '@nestjs/common';
import {
  VoiceAgentDeploymentRepository,
  VoicePhoneNumberRepository,
  VoiceProviderAccountRepository,
  VoiceProvisioningJobRepository,
  VoiceSubscriptionRepository,
} from './voice-control-plane.repository';

function makePrisma() {
  return {
    voiceSubscription: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    voiceProviderAccount: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    voicePhoneNumber: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    voiceAgentDeployment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    voiceProvisioningJob: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    voiceAssistant: {
      findFirst: jest.fn(),
    },
  } as any;
}

const ORG_ID = 'org-voice-1';

describe('Voice control plane repositories', () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
  });

  describe('VoiceSubscriptionRepository', () => {
    it('creates a subscription with tenant-scoped data', async () => {
      const repository = new VoiceSubscriptionRepository(prisma);
      prisma.voiceSubscription.create.mockResolvedValue({ id: 'sub-1', planCode: 'voice_agent' });

      const row = await repository.create({
        organizationId: ORG_ID,
        planCode: 'voice_agent',
        planReference: 'catalog:voice_agent:monthly',
      });

      expect(row.id).toBe('sub-1');
      expect(prisma.voiceSubscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: ORG_ID,
          planCode: 'voice_agent',
          planReference: 'catalog:voice_agent:monthly',
          status: 'PENDING',
        }),
      });
    });
  });

  describe('VoiceProviderAccountRepository', () => {
    it('creates provider account without plaintext secret fields', async () => {
      const repository = new VoiceProviderAccountRepository(prisma);
      prisma.voiceProviderAccount.create.mockResolvedValue({ id: 'acct-1' });

      await repository.create({
        organizationId: ORG_ID,
        provider: 'TWILIO',
        accountType: 'SUBACCOUNT',
        maskedExternalRef: 'AC***9f2a',
        secretRef: 'vault://voice/org-voice-1/twilio/subaccount',
      });

      expect(prisma.voiceProviderAccount.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          maskedExternalRef: 'AC***9f2a',
          secretRef: 'vault://voice/org-voice-1/twilio/subaccount',
        }),
      });
      const payload = prisma.voiceProviderAccount.create.mock.calls[0][0].data;
      expect(payload).not.toHaveProperty('authToken');
      expect(payload).not.toHaveProperty('secret');
    });
  });

  describe('VoicePhoneNumberRepository', () => {
    it('requires provider account in org before create', async () => {
      const repository = new VoicePhoneNumberRepository(prisma);
      prisma.voiceProviderAccount.findFirst.mockResolvedValue(null);

      await expect(
        repository.create({
          organizationId: ORG_ID,
          providerAccountId: 'missing',
          maskedPhoneNumber: '+49 *** 1234',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates phone number with protected references only', async () => {
      const repository = new VoicePhoneNumberRepository(prisma);
      prisma.voiceProviderAccount.findFirst.mockResolvedValue({ id: 'acct-1' });
      prisma.voicePhoneNumber.create.mockResolvedValue({ id: 'pn-1' });

      await repository.create({
        organizationId: ORG_ID,
        providerAccountId: 'acct-1',
        maskedPhoneNumber: '+49 *** 1234',
        protectedE164: 'vault://voice/org-voice-1/phone/e164',
        protectedExternalRef: 'vault://voice/org-voice-1/phone/sid',
        externalRefDigest: 'digest-sid',
      });

      expect(prisma.voicePhoneNumber.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          maskedPhoneNumber: '+49 *** 1234',
          protectedE164: 'vault://voice/org-voice-1/phone/e164',
          protectedExternalRef: 'vault://voice/org-voice-1/phone/sid',
        }),
      });
    });
  });

  describe('VoiceAgentDeploymentRepository', () => {
    it('requires voice assistant in org before create', async () => {
      const repository = new VoiceAgentDeploymentRepository(prisma);
      prisma.voiceAssistant.findFirst.mockResolvedValue(null);

      await expect(
        repository.create({
          organizationId: ORG_ID,
          voiceAssistantId: 'asst-missing',
          provider: 'ELEVENLABS',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('VoiceProvisioningJobRepository', () => {
    it('returns existing row for duplicate idempotency key', async () => {
      const repository = new VoiceProvisioningJobRepository(prisma);
      prisma.voiceProvisioningJob.findUnique.mockResolvedValue({
        id: 'job-existing',
        idempotencyKey: 'idem-1',
      });

      const result = await repository.persistOrGet({
        organizationId: ORG_ID,
        jobType: 'TWILIO_SUBACCOUNT_CREATE',
        idempotencyKey: 'idem-1',
      });

      expect(result.created).toBe(false);
      expect(result.job.id).toBe('job-existing');
      expect(prisma.voiceProvisioningJob.create).not.toHaveBeenCalled();
    });

    it('creates job when idempotency key is new', async () => {
      const repository = new VoiceProvisioningJobRepository(prisma);
      prisma.voiceProvisioningJob.findUnique.mockResolvedValue(null);
      prisma.voiceProvisioningJob.create.mockResolvedValue({
        id: 'job-new',
        status: 'PENDING',
      });

      const result = await repository.persistOrGet({
        organizationId: ORG_ID,
        jobType: 'ELEVENLABS_NUMBER_IMPORT',
        idempotencyKey: 'idem-2',
        payload: { step: 'validate_subaccount' },
      });

      expect(result.created).toBe(true);
      expect(result.job.id).toBe('job-new');
      const payload = prisma.voiceProvisioningJob.create.mock.calls[0][0].data.payload;
      expect(payload).toEqual({ step: 'validate_subaccount' });
      expect(prisma.voiceProvisioningJob.create.mock.calls[0][0].data).not.toHaveProperty('secretRef');
    });
  });
});
