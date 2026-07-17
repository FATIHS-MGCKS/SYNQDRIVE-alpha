import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { VoiceProviderWebhookProcessingStatus } from '@prisma/client';
import { VoiceControlPlaneAdminService } from './voice-control-plane-admin.service';
import { PrismaService } from '@shared/database/prisma.service';
import { VoiceAssistantService } from '../voice-assistant.service';
import { ElevenLabsService } from '../elevenlabs.service';
import { TwilioControlPlaneTelephonyService } from '@modules/twilio/twilio-control-plane.telephony.service';
import { VoiceBillingService } from '@modules/voice-billing/voice-billing.service';
import { VoiceSubscriptionService } from '@modules/voice-billing/voice-subscription.service';
import { VoiceProtectionAuditService } from '@modules/voice-protection/voice-protection-audit.service';
import { VoiceProviderWebhookEventRepository } from '../control-plane/voice-audit-persistence.repository';
import { VoiceWebhookReplayService } from '@modules/voice-webhook-ingestion/voice-webhook-processing.service';
import {
  VoiceAgentDeploymentRepository,
  VoicePhoneNumberRepository,
  VoiceProvisioningJobRepository,
  VoiceProviderAccountRepository,
  VoiceSubscriptionRepository,
} from '../control-plane/voice-control-plane.repository';
import { AgentDeploymentService } from '../agent-deployment/agent-deployment.service';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { getQueueToken } from '@nestjs/bullmq';

describe('VoiceControlPlaneAdminService', () => {
  let service: VoiceControlPlaneAdminService;
  let prisma: {
    voicePhoneNumber: { findMany: jest.Mock };
    voiceProviderWebhookEvent: {
      groupBy: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let subscriptionRepo: { findActiveByOrganization: jest.Mock };
  let subscriptions: { suspendSubscription: jest.Mock };
  let protectionAudit: { record: jest.Mock };
  let webhookEvents: { findById: jest.Mock };
  let webhookReplay: { replayForOrganization: jest.Mock };

  beforeEach(async () => {
    prisma = {
      voicePhoneNumber: { findMany: jest.fn() },
      voiceProviderWebhookEvent: {
        groupBy: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    subscriptionRepo = { findActiveByOrganization: jest.fn() };
    subscriptions = { suspendSubscription: jest.fn() };
    protectionAudit = { record: jest.fn() };
    webhookEvents = { findById: jest.fn() };
    webhookReplay = { replayForOrganization: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        VoiceControlPlaneAdminService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: VoiceAssistantService,
          useValue: {
            getAdminOverview: jest.fn(),
            getAdminOrgDetail: jest.fn(),
          },
        },
        { provide: ElevenLabsService, useValue: { isConfigured: () => true } },
        {
          provide: TwilioControlPlaneTelephonyService,
          useValue: { isConfigured: () => true },
        },
        {
          provide: VoiceBillingService,
          useValue: {
            getOrganizationUsage: jest.fn(),
            getMasterAdminOrgBilling: jest.fn(),
          },
        },
        { provide: VoiceSubscriptionService, useValue: subscriptions },
        { provide: VoiceSubscriptionRepository, useValue: subscriptionRepo },
        { provide: VoiceProtectionAuditService, useValue: protectionAudit },
        { provide: VoiceProviderWebhookEventRepository, useValue: webhookEvents },
        { provide: VoiceWebhookReplayService, useValue: webhookReplay },
        {
          provide: VoicePhoneNumberRepository,
          useValue: { listByOrganization: jest.fn() },
        },
        {
          provide: VoiceProviderAccountRepository,
          useValue: { listByOrganization: jest.fn() },
        },
        {
          provide: VoiceProvisioningJobRepository,
          useValue: { listByOrganization: jest.fn() },
        },
        {
          provide: VoiceAgentDeploymentRepository,
          useValue: {},
        },
        {
          provide: AgentDeploymentService,
          useValue: {
            deploy: jest.fn(),
            rollback: jest.fn(),
            getDraft: jest.fn(),
            getDiff: jest.fn(),
          },
        },
        {
          provide: getQueueToken(QUEUE_NAMES.VOICE_WEBHOOK_PROCESS),
          useValue: { getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, failed: 0 }) },
        },
      ],
    }).compile();

    service = moduleRef.get(VoiceControlPlaneAdminService);
  });

  it('masks phone numbers and omits provider secrets', async () => {
    prisma.voicePhoneNumber.findMany.mockResolvedValue([
      {
        id: 'pn-1',
        organizationId: 'org-1',
        maskedPhoneNumber: '+49 *** **42',
        lifecycle: 'ACTIVE',
        region: 'IE1',
        regulatoryStatus: 'APPROVED',
        elevenLabsImportStatus: 'IMPORTED',
        updatedAt: new Date('2026-07-17T10:00:00.000Z'),
        organization: { id: 'org-1', companyName: 'Acme GmbH' },
      },
    ]);

    const rows = await service.listPhoneNumbers();

    expect(rows).toEqual([
      expect.objectContaining({
        maskedPhoneNumber: '+49 *** **42',
        organizationName: 'Acme GmbH',
        elevenLabsAssigned: true,
      }),
    ]);
    expect(JSON.stringify(rows)).not.toContain('accountSid');
    expect(JSON.stringify(rows)).not.toContain('+4917');
  });

  it('requires confirm and reason to suspend organization', async () => {
    await expect(
      service.suspendOrganization({ orgId: 'org-1', reason: 'abuse', confirm: false }),
    ).rejects.toBeInstanceOf(BadRequestException);

    subscriptionRepo.findActiveByOrganization.mockResolvedValue({ id: 'sub-1' });
    subscriptions.suspendSubscription.mockResolvedValue(undefined);
    protectionAudit.record.mockResolvedValue(undefined);

    const result = await service.suspendOrganization({
      orgId: 'org-1',
      reason: 'abuse pattern',
      confirm: true,
      actorUserId: 'admin-1',
    });

    expect(result).toEqual({ suspended: true, subscriptionId: 'sub-1' });
    expect(protectionAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        reasonCode: 'master_admin_suspend',
      }),
    );
  });

  it('requires confirm and reason to replay webhook events', async () => {
    await expect(
      service.replayWebhookEvent({ eventId: 'evt-1', reason: 'retry', confirm: false }),
    ).rejects.toBeInstanceOf(BadRequestException);

    webhookEvents.findById.mockResolvedValue({
      id: 'evt-1',
      organizationId: 'org-1',
      status: VoiceProviderWebhookProcessingStatus.FAILED,
    });
    webhookReplay.replayForOrganization.mockResolvedValue({ replayed: true });
    protectionAudit.record.mockResolvedValue(undefined);

    const result = await service.replayWebhookEvent({
      eventId: 'evt-1',
      reason: 'provider outage',
      confirm: true,
      actorUserId: 'admin-1',
    });

    expect(result).toEqual({ replayed: true });
    expect(webhookReplay.replayForOrganization).toHaveBeenCalledWith('org-1', 'evt-1');
  });
});
