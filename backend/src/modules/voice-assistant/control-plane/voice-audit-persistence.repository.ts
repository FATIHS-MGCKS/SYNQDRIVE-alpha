import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VoiceWebhookErrorClass } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type {
  CompleteVoiceToolExecutionInput,
  CreateVoiceApprovalRequestInput,
  CreateVoiceBillingPeriodInput,
  CreateVoiceProviderWebhookEventInput,
  CreateVoiceTestRunInput,
  UpdateVoiceTestRunInput,
  CreateVoiceToolExecutionInput,
  CreateVoiceUsageEventInput,
  DecideVoiceApprovalRequestInput,
  UpsertVoiceBudgetPolicyInput,
  VoiceWebhookCorrelationInput,
} from './voice-audit-persistence.types';

@Injectable()
export class VoiceProviderWebhookEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByProviderEventId(provider: CreateVoiceProviderWebhookEventInput['provider'], externalEventId: string) {
    return this.prisma.voiceProviderWebhookEvent.findUnique({
      where: {
        provider_externalEventId: {
          provider,
          externalEventId,
        },
      },
    });
  }

  listByOrganization(organizationId: string) {
    return this.prisma.voiceProviderWebhookEvent.findMany({
      where: { organizationId },
      orderBy: { receivedAt: 'desc' },
    });
  }

  async persistOrGet(input: CreateVoiceProviderWebhookEventInput) {
    const existing = await this.findByProviderEventId(input.provider, input.externalEventId);
    if (existing) {
      return { event: existing, created: false };
    }

    const correlation = input.correlation ?? {};

    try {
      const event = await this.prisma.voiceProviderWebhookEvent.create({
        data: {
          organizationId: input.organizationId ?? null,
          provider: input.provider,
          externalEventId: input.externalEventId,
          eventType: input.eventType ?? null,
          payloadHash: input.payloadHash,
          redactedPayload: input.redactedPayload,
          voiceConversationId: correlation.voiceConversationId ?? null,
          twilioCallSid: correlation.twilioCallSid ?? null,
          elevenLabsConversationId: correlation.elevenLabsConversationId ?? null,
          agentDeploymentId: correlation.agentDeploymentId ?? null,
          phoneNumberId: correlation.phoneNumberId ?? null,
          customerId: correlation.customerId ?? null,
          bookingId: correlation.bookingId ?? null,
        },
      });

      return { event, created: true };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const raced = await this.findByProviderEventId(input.provider, input.externalEventId);
        if (raced) {
          return { event: raced, created: false };
        }
      }
      throw err;
    }
  }

  findById(id: string) {
    return this.prisma.voiceProviderWebhookEvent.findUnique({ where: { id } });
  }

  findByIdForOrganization(organizationId: string, id: string) {
    return this.prisma.voiceProviderWebhookEvent.findFirst({
      where: { id, organizationId },
    });
  }

  markQueued(id: string) {
    return this.prisma.voiceProviderWebhookEvent.update({
      where: { id },
      data: { status: 'QUEUED' },
    });
  }

  markProcessed(id: string) {
    return this.prisma.voiceProviderWebhookEvent.update({
      where: { id },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        errorClass: null,
        errorCode: null,
        errorMessage: null,
      },
    });
  }

  markFailed(
    id: string,
    params: {
      errorClass?: VoiceWebhookErrorClass | null;
      errorCode?: string | null;
      errorMessage?: string | null;
      incrementRetry?: boolean;
    },
  ) {
    return this.prisma.voiceProviderWebhookEvent.update({
      where: { id },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        errorClass: params.errorClass ?? 'UNKNOWN',
        errorCode: params.errorCode ?? null,
        errorMessage: params.errorMessage ?? null,
        retryCount: params.incrementRetry ? { increment: 1 } : undefined,
      },
    });
  }

  markDeadLetter(
    id: string,
    params: {
      errorClass?: VoiceWebhookErrorClass | null;
      errorCode?: string | null;
      errorMessage?: string | null;
    },
  ) {
    return this.prisma.voiceProviderWebhookEvent.update({
      where: { id },
      data: {
        status: 'DEAD_LETTER',
        failedAt: new Date(),
        errorClass: params.errorClass ?? 'POISON',
        errorCode: params.errorCode ?? null,
        errorMessage: params.errorMessage ?? null,
      },
    });
  }

  updateCorrelation(id: string, correlation: VoiceWebhookCorrelationInput) {
    return this.prisma.voiceProviderWebhookEvent.update({
      where: { id },
      data: {
        voiceConversationId: correlation.voiceConversationId ?? null,
        twilioCallSid: correlation.twilioCallSid ?? null,
        elevenLabsConversationId: correlation.elevenLabsConversationId ?? null,
        agentDeploymentId: correlation.agentDeploymentId ?? null,
        phoneNumberId: correlation.phoneNumberId ?? null,
        customerId: correlation.customerId ?? null,
        bookingId: correlation.bookingId ?? null,
      },
    });
  }
}

@Injectable()
export class VoiceUsageEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(organizationId: string, id: string) {
    return this.prisma.voiceUsageEvent.findFirst({
      where: { id, organizationId },
    });
  }

  findByIdempotencyKey(organizationId: string, idempotencyKey: string) {
    return this.prisma.voiceUsageEvent.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId,
          idempotencyKey,
        },
      },
    });
  }

  async persistOrGet(input: CreateVoiceUsageEventInput) {
    const existing = await this.findByIdempotencyKey(input.organizationId, input.idempotencyKey);
    if (existing) {
      return { event: existing, created: false };
    }

    try {
      const event = await this.prisma.voiceUsageEvent.create({
        data: {
          organizationId: input.organizationId,
          voiceConversationId: input.voiceConversationId ?? null,
          provider: input.provider,
          eventType: input.eventType,
          billableSeconds: input.billableSeconds ?? null,
          billableMinutes: input.billableMinutes ?? null,
          providerCostCents: input.providerCostCents ?? null,
          internalCostCents: input.internalCostCents ?? null,
          twilioCostCents: input.twilioCostCents ?? null,
          elevenLabsCostCents: input.elevenLabsCostCents ?? null,
          llmCostCents: input.llmCostCents ?? null,
          customerPriceCents: input.customerPriceCents ?? null,
          currency: input.currency ?? 'EUR',
          externalUsageRef: input.externalUsageRef ?? null,
          idempotencyKey: input.idempotencyKey,
          costStatus: input.costStatus ?? 'ESTIMATED',
        },
      });

      return { event, created: true };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const raced = await this.findByIdempotencyKey(input.organizationId, input.idempotencyKey);
        if (raced) {
          return { event: raced, created: false };
        }
      }
      throw err;
    }
  }

  sumBillableMinutesInPeriod(organizationId: string, periodStart: Date, periodEnd: Date) {
    return this.prisma.voiceUsageEvent.aggregate({
      where: {
        organizationId,
        occurredAt: { gte: periodStart, lt: periodEnd },
        eventType: { in: ['INBOUND_CALL', 'OUTBOUND_CALL', 'CONVERSATION_MINUTE'] },
      },
      _sum: { billableMinutes: true },
    });
  }

  sumCustomerPriceInPeriod(organizationId: string, periodStart: Date, periodEnd: Date) {
    return this.prisma.voiceUsageEvent.aggregate({
      where: {
        organizationId,
        occurredAt: { gte: periodStart, lt: periodEnd },
      },
      _sum: { customerPriceCents: true, internalCostCents: true, providerCostCents: true },
    });
  }

  sumDirectionalMinutesInPeriod(
    organizationId: string,
    periodStart: Date,
    periodEnd: Date,
  ) {
    return this.prisma.voiceUsageEvent.groupBy({
      by: ['eventType'],
      where: {
        organizationId,
        occurredAt: { gte: periodStart, lt: periodEnd },
        eventType: { in: ['INBOUND_CALL', 'OUTBOUND_CALL'] },
      },
      _sum: { billableMinutes: true },
    });
  }

  async updateCostsIfNotFinal(
    organizationId: string,
    id: string,
    data: {
      providerCostCents: number;
      internalCostCents: number;
      twilioCostCents: number;
      elevenLabsCostCents: number;
      llmCostCents: number;
      costStatus: 'ESTIMATED' | 'FINAL';
    },
  ) {
    const row = await this.findById(organizationId, id);
    if (!row || row.costStatus === 'FINAL') {
      return null;
    }
    return this.prisma.voiceUsageEvent.update({
      where: { id },
      data,
    });
  }
}

@Injectable()
export class VoiceBillingPeriodRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(organizationId: string, id: string) {
    return this.prisma.voiceBillingPeriod.findFirst({
      where: { id, organizationId },
    });
  }

  findOpenForOrganization(organizationId: string, periodStart: Date, periodEnd: Date) {
    return this.prisma.voiceBillingPeriod.findFirst({
      where: {
        organizationId,
        periodStart,
        periodEnd,
        status: 'OPEN',
      },
    });
  }

  async upsertOpenPeriod(input: CreateVoiceBillingPeriodInput) {
    return this.prisma.voiceBillingPeriod.upsert({
      where: {
        organizationId_periodStart_periodEnd: {
          organizationId: input.organizationId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
        },
      },
      create: {
        organizationId: input.organizationId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        planCode: input.planCode ?? null,
        planCatalogVersion: input.planCatalogVersion ?? null,
        monthlyBaseFeeCents: input.monthlyBaseFeeCents ?? 0,
        setupFeeCents: input.setupFeeCents ?? 0,
        includedMinutes: input.includedMinutes ?? 0,
      },
      update: {
        planCode: input.planCode ?? undefined,
        planCatalogVersion: input.planCatalogVersion ?? undefined,
        monthlyBaseFeeCents: input.monthlyBaseFeeCents ?? undefined,
        setupFeeCents: input.setupFeeCents ?? undefined,
        includedMinutes: input.includedMinutes ?? undefined,
      },
    });
  }

  async refreshAggregates(
    organizationId: string,
    id: string,
    aggregates: {
      consumedMinutes: number;
      inboundMinutes: number;
      outboundMinutes: number;
      overageMinutes: number;
      providerCostCents: number;
      revenueCents: number;
      marginCents: number;
    },
  ) {
    const row = await this.findById(organizationId, id);
    if (!row) {
      throw new NotFoundException('Voice billing period not found for organization');
    }
    return this.prisma.voiceBillingPeriod.update({
      where: { id },
      data: aggregates,
    });
  }

  create(input: CreateVoiceBillingPeriodInput) {
    return this.prisma.voiceBillingPeriod.create({
      data: {
        organizationId: input.organizationId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        planCode: input.planCode ?? null,
        planCatalogVersion: input.planCatalogVersion ?? null,
        monthlyBaseFeeCents: input.monthlyBaseFeeCents ?? 0,
        setupFeeCents: input.setupFeeCents ?? 0,
        includedMinutes: input.includedMinutes ?? 0,
      },
    });
  }
}

@Injectable()
export class VoiceBudgetPolicyRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByOrganization(organizationId: string) {
    return this.prisma.voiceBudgetPolicy.findUnique({
      where: { organizationId },
    });
  }

  upsert(input: UpsertVoiceBudgetPolicyInput) {
    const data = {
      monthlyBudgetCents: input.monthlyBudgetCents ?? null,
      dailyLimitCents: input.dailyLimitCents ?? null,
      dailyOutboundMinutesLimit: input.dailyOutboundMinutesLimit ?? null,
      maxConversationDurationSeconds: input.maxConversationDurationSeconds ?? null,
      maxConcurrentCalls: input.maxConcurrentCalls ?? null,
      maxRepeatsPerDestination: input.maxRepeatsPerDestination ?? null,
      destinationCooldownSeconds: input.destinationCooldownSeconds ?? null,
      destinationRegionPolicy: input.destinationRegionPolicy ?? undefined,
      allowedCountries: input.allowedCountries ?? [],
      warnThresholdPct: input.warnThresholdPct ?? null,
      hardLimitThresholdPct: input.hardLimitThresholdPct ?? null,
      hardLimitGraceMinutes: input.hardLimitGraceMinutes ?? undefined,
      overflowBehavior: input.overflowBehavior ?? undefined,
    };

    return this.prisma.voiceBudgetPolicy.upsert({
      where: { organizationId: input.organizationId },
      create: {
        organizationId: input.organizationId,
        ...data,
        destinationRegionPolicy: input.destinationRegionPolicy ?? 'DE_EEA',
        hardLimitGraceMinutes: input.hardLimitGraceMinutes ?? 0,
      },
      update: data,
    });
  }
}

@Injectable()
export class VoiceToolExecutionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(organizationId: string, id: string) {
    return this.prisma.voiceToolExecution.findFirst({
      where: { id, organizationId },
    });
  }

  findByIdempotencyKey(organizationId: string, idempotencyKey: string) {
    return this.prisma.voiceToolExecution.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId,
          idempotencyKey,
        },
      },
    });
  }

  async persistOrGet(input: CreateVoiceToolExecutionInput) {
    const existing = await this.findByIdempotencyKey(input.organizationId, input.idempotencyKey);
    if (existing) {
      return { execution: existing, created: false };
    }

    const execution = await this.prisma.voiceToolExecution.create({
      data: {
        organizationId: input.organizationId,
        voiceConversationId: input.voiceConversationId,
        toolName: input.toolName,
        riskClass: input.riskClass,
        requestHash: input.requestHash,
        idempotencyKey: input.idempotencyKey,
        redactedInput: input.redactedInput ?? Prisma.JsonNull,
      },
    });

    return { execution, created: true };
  }

  async assertInOrg(organizationId: string, id: string) {
    const row = await this.findById(organizationId, id);
    if (!row) {
      throw new NotFoundException('Voice tool execution not found for organization');
    }
    return row;
  }

  async markRunning(organizationId: string, id: string) {
    await this.assertInOrg(organizationId, id);
    return this.prisma.voiceToolExecution.update({
      where: { id },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
  }

  async complete(input: CompleteVoiceToolExecutionInput) {
    await this.assertInOrg(input.organizationId, input.id);
    return this.prisma.voiceToolExecution.update({
      where: { id: input.id },
      data: {
        status: input.status,
        redactedOutput: input.redactedOutput ?? Prisma.JsonNull,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        durationMs: input.durationMs ?? null,
        completedAt: new Date(),
      },
    });
  }
}

@Injectable()
export class VoiceApprovalRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(organizationId: string, id: string) {
    return this.prisma.voiceApprovalRequest.findFirst({
      where: { id, organizationId },
    });
  }

  async create(input: CreateVoiceApprovalRequestInput) {
    return this.prisma.voiceApprovalRequest.create({
      data: {
        organizationId: input.organizationId,
        toolExecutionId: input.toolExecutionId,
        confirmationType: input.confirmationType,
        expiresAt: input.expiresAt ?? null,
        protectedDecisionTokenRef: input.protectedDecisionTokenRef ?? null,
      },
    });
  }

  findPendingById(organizationId: string, id: string) {
    return this.prisma.voiceApprovalRequest.findFirst({
      where: { id, organizationId, status: 'PENDING' },
      include: { toolExecution: true },
    });
  }

  async decide(input: DecideVoiceApprovalRequestInput) {
    const row = await this.findPendingById(input.organizationId, input.id);
    if (!row) {
      throw new NotFoundException('Pending voice approval request not found for organization');
    }
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      await this.prisma.voiceApprovalRequest.update({
        where: { id: input.id },
        data: { status: 'EXPIRED' },
      });
      throw new NotFoundException('Voice approval request has expired');
    }

    return this.prisma.voiceApprovalRequest.update({
      where: { id: input.id },
      data: {
        status: input.status,
        decidedByUserId: input.decidedByUserId,
        decisionReason: input.decisionReason ?? null,
        decidedAt: new Date(),
      },
      include: { toolExecution: true },
    });
  }

  async expireStale(organizationId: string, now = new Date()) {
    const expired = await this.prisma.voiceApprovalRequest.findMany({
      where: {
        organizationId,
        status: 'PENDING',
        expiresAt: { lt: now },
      },
      select: { id: true, toolExecutionId: true },
    });

    if (!expired.length) {
      return 0;
    }

    await this.prisma.$transaction([
      this.prisma.voiceApprovalRequest.updateMany({
        where: { id: { in: expired.map((row) => row.id) } },
        data: { status: 'EXPIRED' },
      }),
      this.prisma.voiceToolExecution.updateMany({
        where: { id: { in: expired.map((row) => row.toolExecutionId) } },
        data: { status: 'CANCELLED', completedAt: now },
      }),
    ]);

    return expired.length;
  }
}

@Injectable()
export class VoiceTestRunRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(organizationId: string, id: string) {
    return this.prisma.voiceTestRun.findFirst({
      where: { id, organizationId },
    });
  }

  listByOrganization(organizationId: string, limit = 50) {
    return this.prisma.voiceTestRun.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  findLatestByScenario(organizationId: string, scenario: string) {
    return this.prisma.voiceTestRun.findFirst({
      where: { organizationId, scenario },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(input: CreateVoiceTestRunInput) {
    return this.prisma.voiceTestRun.create({
      data: {
        organizationId: input.organizationId,
        agentDeploymentId: input.agentDeploymentId,
        scenario: input.scenario,
        assertions: input.assertions ?? [],
      },
    });
  }

  update(organizationId: string, id: string, input: UpdateVoiceTestRunInput) {
    return this.prisma.voiceTestRun.updateMany({
      where: { id, organizationId },
      data: input,
    });
  }
}
