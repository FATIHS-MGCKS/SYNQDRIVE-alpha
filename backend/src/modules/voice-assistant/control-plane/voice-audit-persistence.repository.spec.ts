import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  VoiceApprovalRequestRepository,
  VoiceBillingPeriodRepository,
  VoiceBudgetPolicyRepository,
  VoiceProviderWebhookEventRepository,
  VoiceTestRunRepository,
  VoiceToolExecutionRepository,
  VoiceUsageEventRepository,
} from './voice-audit-persistence.repository';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

function makePrisma() {
  return {
    voiceProviderWebhookEvent: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    voiceUsageEvent: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    voiceBillingPeriod: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    voiceBudgetPolicy: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    voiceToolExecution: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    voiceApprovalRequest: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    voiceTestRun: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  } as any;
}

describe('Voice audit persistence repositories', () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
  });

  describe('tenant scoping', () => {
    it('VoiceUsageEventRepository.findById scopes by organizationId', async () => {
      const repository = new VoiceUsageEventRepository(prisma);
      prisma.voiceUsageEvent.findFirst.mockResolvedValue(null);

      await repository.findById(ORG_A, 'usage-1');

      expect(prisma.voiceUsageEvent.findFirst).toHaveBeenCalledWith({
        where: { id: 'usage-1', organizationId: ORG_A },
      });
    });

    it('VoiceToolExecutionRepository.assertInOrg rejects cross-tenant access', async () => {
      const repository = new VoiceToolExecutionRepository(prisma);
      prisma.voiceToolExecution.findFirst.mockResolvedValue(null);

      await expect(repository.assertInOrg(ORG_B, 'exec-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.voiceToolExecution.findFirst).toHaveBeenCalledWith({
        where: { id: 'exec-1', organizationId: ORG_B },
      });
    });

    it('VoiceBudgetPolicyRepository enforces one policy row per organization', async () => {
      const repository = new VoiceBudgetPolicyRepository(prisma);
      prisma.voiceBudgetPolicy.upsert.mockResolvedValue({ organizationId: ORG_A });

      await repository.upsert({
        organizationId: ORG_A,
        monthlyBudgetCents: 49_00,
        warnThresholdPct: 80,
        hardLimitThresholdPct: 100,
      });

      expect(prisma.voiceBudgetPolicy.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: ORG_A },
        }),
      );
    });
  });

  describe('unique / idempotency constraints', () => {
    it('VoiceProviderWebhookEventRepository deduplicates provider + externalEventId', async () => {
      const repository = new VoiceProviderWebhookEventRepository(prisma);
      prisma.voiceProviderWebhookEvent.findUnique.mockResolvedValue({
        id: 'wh-1',
        provider: 'TWILIO',
        externalEventId: 'evt-1',
      });

      const result = await repository.persistOrGet({
        provider: 'TWILIO',
        externalEventId: 'evt-1',
        payloadHash: 'sha256:abc',
        redactedPayload: { callSid: 'CA***' },
      });

      expect(result.created).toBe(false);
      expect(prisma.voiceProviderWebhookEvent.create).not.toHaveBeenCalled();
      expect(prisma.voiceProviderWebhookEvent.findUnique).toHaveBeenCalledWith({
        where: {
          provider_externalEventId: {
            provider: 'TWILIO',
            externalEventId: 'evt-1',
          },
        },
      });
    });

    it('VoiceUsageEventRepository deduplicates organizationId + idempotencyKey', async () => {
      const repository = new VoiceUsageEventRepository(prisma);
      prisma.voiceUsageEvent.findUnique.mockResolvedValue({
        id: 'usage-existing',
        idempotencyKey: 'idem-usage-1',
      });

      const result = await repository.persistOrGet({
        organizationId: ORG_A,
        provider: 'ELEVENLABS',
        eventType: 'CONVERSATION_MINUTE',
        idempotencyKey: 'idem-usage-1',
        billableMinutes: 3,
        providerCostCents: 36,
        internalCostCents: 36,
        customerPriceCents: 87,
      });

      expect(result.created).toBe(false);
      expect(prisma.voiceUsageEvent.create).not.toHaveBeenCalled();
    });

    it('VoiceToolExecutionRepository deduplicates organizationId + idempotencyKey', async () => {
      const repository = new VoiceToolExecutionRepository(prisma);
      prisma.voiceToolExecution.findUnique.mockResolvedValue({
        id: 'exec-existing',
      });

      const result = await repository.persistOrGet({
        organizationId: ORG_A,
        voiceConversationId: 'conv-1',
        toolName: 'bookingSearch',
        riskClass: 'READ_ONLY',
        requestHash: 'sha256:req',
        idempotencyKey: 'idem-tool-1',
      });

      expect(result.created).toBe(false);
      expect(prisma.voiceToolExecution.create).not.toHaveBeenCalled();
    });

    it('propagates Prisma unique violations for billing period window', async () => {
      const repository = new VoiceBillingPeriodRepository(prisma);
      const uniqueError = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: 'test',
        meta: {
          target: ['voice_billing_periods_organization_id_period_start_period_end_key'],
        },
      });
      prisma.voiceBillingPeriod.create.mockRejectedValue(uniqueError);

      await expect(
        repository.create({
          organizationId: ORG_A,
          periodStart: new Date('2026-07-01T00:00:00.000Z'),
          periodEnd: new Date('2026-07-31T23:59:59.999Z'),
        }),
      ).rejects.toBe(uniqueError);
    });
  });

  describe('money and PII persistence shape', () => {
    it('stores usage monetary fields as integer cents', async () => {
      const repository = new VoiceUsageEventRepository(prisma);
      prisma.voiceUsageEvent.findUnique.mockResolvedValue(null);
      prisma.voiceUsageEvent.create.mockResolvedValue({ id: 'usage-1' });

      await repository.persistOrGet({
        organizationId: ORG_A,
        provider: 'TWILIO',
        eventType: 'INBOUND_CALL',
        idempotencyKey: 'idem-money-1',
        providerCostCents: 12,
        internalCostCents: 12,
        customerPriceCents: 35,
        currency: 'EUR',
      });

      const data = prisma.voiceUsageEvent.create.mock.calls[0][0].data;
      expect(data.providerCostCents).toBe(12);
      expect(data.internalCostCents).toBe(12);
      expect(data.customerPriceCents).toBe(35);
      expect(data).not.toHaveProperty('providerCost');
      expect(data).not.toHaveProperty('customerPrice');
    });

    it('stores approval token as protected reference only', async () => {
      const repository = new VoiceApprovalRequestRepository(prisma);
      prisma.voiceApprovalRequest.create.mockResolvedValue({ id: 'apr-1' });

      await repository.create({
        organizationId: ORG_A,
        toolExecutionId: 'exec-1',
        confirmationType: 'STAFF',
        protectedDecisionTokenRef: 'vault://voice/org-a/approval/token',
      });

      const data = prisma.voiceApprovalRequest.create.mock.calls[0][0].data;
      expect(data.protectedDecisionTokenRef).toBe('vault://voice/org-a/approval/token');
      expect(data).not.toHaveProperty('decisionToken');
      expect(data).not.toHaveProperty('token');
    });

    it('stores test run results redacted without customer fields', async () => {
      const repository = new VoiceTestRunRepository(prisma);
      prisma.voiceTestRun.create.mockResolvedValue({ id: 'test-1' });

      await repository.create({
        organizationId: ORG_A,
        agentDeploymentId: 'deploy-1',
        scenario: 'inbound_greeting_smoke',
        assertions: [{ name: 'greeting_played', passed: true }],
      });

      const data = prisma.voiceTestRun.create.mock.calls[0][0].data;
      expect(data.scenario).toBe('inbound_greeting_smoke');
      expect(data).not.toHaveProperty('customerId');
      expect(data).not.toHaveProperty('callerNumber');
    });
  });
});
