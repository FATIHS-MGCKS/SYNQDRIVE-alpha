import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type {
  CreateVoiceAgentDeploymentInput,
  CreateVoicePhoneNumberInput,
  CreateVoiceProviderAccountInput,
  CreateVoiceProvisioningJobInput,
  CreateVoiceSubscriptionInput,
  UpdateVoiceProvisioningJobProgressInput,
} from './voice-control-plane.types';

const ACTIVE_LIFECYCLE_FILTER = { archivedAt: null } as const;

@Injectable()
export class VoiceSubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(organizationId: string, id: string) {
    return this.prisma.voiceSubscription.findFirst({
      where: { id, organizationId, ...ACTIVE_LIFECYCLE_FILTER },
    });
  }

  listByOrganization(organizationId: string) {
    return this.prisma.voiceSubscription.findMany({
      where: { organizationId, ...ACTIVE_LIFECYCLE_FILTER },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(input: CreateVoiceSubscriptionInput) {
    return this.prisma.voiceSubscription.create({
      data: {
        organizationId: input.organizationId,
        planCode: input.planCode,
        planReference: input.planReference ?? null,
        status: input.status ?? 'PENDING',
        currentPeriodStart: input.currentPeriodStart ?? null,
        currentPeriodEnd: input.currentPeriodEnd ?? null,
      },
    });
  }

  async archive(organizationId: string, id: string) {
    const row = await this.findById(organizationId, id);
    if (!row) {
      throw new NotFoundException('Voice subscription not found for organization');
    }
    return this.prisma.voiceSubscription.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }
}

@Injectable()
export class VoiceProviderAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(organizationId: string, id: string) {
    return this.prisma.voiceProviderAccount.findFirst({
      where: { id, organizationId, ...ACTIVE_LIFECYCLE_FILTER },
    });
  }

  findByOrgProviderType(
    organizationId: string,
    provider: CreateVoiceProviderAccountInput['provider'],
    accountType: CreateVoiceProviderAccountInput['accountType'],
  ) {
    return this.prisma.voiceProviderAccount.findUnique({
      where: {
        organizationId_provider_accountType: {
          organizationId,
          provider,
          accountType,
        },
      },
    });
  }

  listByOrganization(organizationId: string) {
    return this.prisma.voiceProviderAccount.findMany({
      where: { organizationId, ...ACTIVE_LIFECYCLE_FILTER },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(input: CreateVoiceProviderAccountInput) {
    return this.prisma.voiceProviderAccount.create({
      data: {
        organizationId: input.organizationId,
        provider: input.provider,
        accountType: input.accountType,
        maskedExternalRef: input.maskedExternalRef,
        secretRef: input.secretRef ?? null,
        region: input.region ?? null,
        edge: input.edge ?? null,
        status: input.status ?? 'PENDING',
      },
    });
  }

  async archive(organizationId: string, id: string) {
    const row = await this.findById(organizationId, id);
    if (!row) {
      throw new NotFoundException('Voice provider account not found for organization');
    }
    return this.prisma.voiceProviderAccount.update({
      where: { id },
      data: { archivedAt: new Date(), status: 'ARCHIVED' },
    });
  }
}

@Injectable()
export class VoicePhoneNumberRepository {
  constructor(private readonly prisma: PrismaService) {}

  async assertProviderAccountInOrg(organizationId: string, providerAccountId: string): Promise<void> {
    const account = await this.prisma.voiceProviderAccount.findFirst({
      where: { id: providerAccountId, organizationId },
      select: { id: true },
    });
    if (!account) {
      throw new NotFoundException('Voice provider account not found for organization');
    }
  }

  findById(organizationId: string, id: string) {
    return this.prisma.voicePhoneNumber.findFirst({
      where: { id, organizationId, ...ACTIVE_LIFECYCLE_FILTER },
    });
  }

  listByOrganization(organizationId: string) {
    return this.prisma.voicePhoneNumber.findMany({
      where: { organizationId, ...ACTIVE_LIFECYCLE_FILTER },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(input: CreateVoicePhoneNumberInput) {
    await this.assertProviderAccountInOrg(input.organizationId, input.providerAccountId);
    return this.prisma.voicePhoneNumber.create({
      data: {
        organizationId: input.organizationId,
        providerAccountId: input.providerAccountId,
        maskedPhoneNumber: input.maskedPhoneNumber,
        protectedE164: input.protectedE164 ?? null,
        protectedExternalRef: input.protectedExternalRef ?? null,
        e164Digest: input.e164Digest ?? null,
        externalRefDigest: input.externalRefDigest ?? null,
        region: input.region ?? null,
        capabilities: input.capabilities ?? Prisma.JsonNull,
        lifecycle: input.lifecycle ?? 'DRAFT',
        regulatoryStatus: input.regulatoryStatus ?? 'UNKNOWN',
        regulatoryDetails: input.regulatoryDetails ?? Prisma.JsonNull,
        elevenLabsImportStatus: input.elevenLabsImportStatus ?? 'NOT_IMPORTED',
        voiceAssistantId: input.voiceAssistantId ?? null,
      },
    });
  }

  async archive(organizationId: string, id: string) {
    const row = await this.findById(organizationId, id);
    if (!row) {
      throw new NotFoundException('Voice phone number not found for organization');
    }
    return this.prisma.voicePhoneNumber.update({
      where: { id },
      data: { archivedAt: new Date(), lifecycle: 'ARCHIVED' },
    });
  }
}

@Injectable()
export class VoiceAgentDeploymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async assertAssistantInOrg(organizationId: string, voiceAssistantId: string): Promise<void> {
    const assistant = await this.prisma.voiceAssistant.findFirst({
      where: { id: voiceAssistantId, organizationId },
      select: { id: true },
    });
    if (!assistant) {
      throw new NotFoundException('Voice assistant not found for organization');
    }
  }

  findById(organizationId: string, id: string) {
    return this.prisma.voiceAgentDeployment.findFirst({
      where: { id, organizationId, ...ACTIVE_LIFECYCLE_FILTER },
    });
  }

  listByAssistant(organizationId: string, voiceAssistantId: string) {
    return this.prisma.voiceAgentDeployment.findMany({
      where: { organizationId, voiceAssistantId, ...ACTIVE_LIFECYCLE_FILTER },
      orderBy: { version: 'desc' },
    });
  }

  async create(input: CreateVoiceAgentDeploymentInput) {
    await this.assertAssistantInOrg(input.organizationId, input.voiceAssistantId);
    return this.prisma.voiceAgentDeployment.create({
      data: {
        organizationId: input.organizationId,
        voiceAssistantId: input.voiceAssistantId,
        provider: input.provider,
        maskedExternalRef: input.maskedExternalRef ?? null,
        protectedExternalRef: input.protectedExternalRef ?? null,
        version: input.version ?? 1,
        status: input.status ?? 'DRAFT',
        configHash: input.configHash ?? null,
        activatedVersion: input.activatedVersion ?? null,
        previousVersion: input.previousVersion ?? null,
        createdByUserId: input.createdByUserId ?? null,
      },
    });
  }

  async archive(organizationId: string, id: string) {
    const row = await this.findById(organizationId, id);
    if (!row) {
      throw new NotFoundException('Voice agent deployment not found for organization');
    }
    return this.prisma.voiceAgentDeployment.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }
}

@Injectable()
export class VoiceProvisioningJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(organizationId: string, id: string) {
    return this.prisma.voiceProvisioningJob.findFirst({
      where: { id, organizationId, ...ACTIVE_LIFECYCLE_FILTER },
    });
  }

  findByIdempotencyKey(organizationId: string, idempotencyKey: string) {
    return this.prisma.voiceProvisioningJob.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId,
          idempotencyKey,
        },
      },
    });
  }

  listByOrganization(organizationId: string) {
    return this.prisma.voiceProvisioningJob.findMany({
      where: { organizationId, ...ACTIVE_LIFECYCLE_FILTER },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Idempotent create — returns existing row when idempotency key already exists.
   */
  async persistOrGet(input: CreateVoiceProvisioningJobInput) {
    const existing = await this.findByIdempotencyKey(input.organizationId, input.idempotencyKey);
    if (existing) {
      return { job: existing, created: false };
    }

    const job = await this.prisma.voiceProvisioningJob.create({
      data: {
        organizationId: input.organizationId,
        jobType: input.jobType,
        idempotencyKey: input.idempotencyKey,
        status: input.status ?? 'PENDING',
        currentStep: input.currentStep ?? null,
        progressPct: input.progressPct ?? null,
        payload: input.payload ?? Prisma.JsonNull,
        voiceAssistantId: input.voiceAssistantId ?? null,
        providerAccountId: input.providerAccountId ?? null,
        phoneNumberId: input.phoneNumberId ?? null,
        deploymentId: input.deploymentId ?? null,
        createdByUserId: input.createdByUserId ?? null,
      },
    });

    return { job, created: true };
  }

  async updateProgress(
    organizationId: string,
    id: string,
    input: UpdateVoiceProvisioningJobProgressInput,
  ) {
    const row = await this.findById(organizationId, id);
    if (!row) {
      throw new NotFoundException('Voice provisioning job not found for organization');
    }
    return this.prisma.voiceProvisioningJob.update({
      where: { id },
      data: input,
    });
  }

  async archive(organizationId: string, id: string) {
    const row = await this.findById(organizationId, id);
    if (!row) {
      throw new NotFoundException('Voice provisioning job not found for organization');
    }
    return this.prisma.voiceProvisioningJob.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }
}
