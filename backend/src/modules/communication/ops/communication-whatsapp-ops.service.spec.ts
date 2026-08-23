import { Test } from '@nestjs/testing';
import { CommunicationChannel } from '@prisma/client';
import { CommunicationWhatsAppOpsService } from './communication-whatsapp-ops.service';
import { PrismaService } from '@shared/database/prisma.service';
import { WhatsAppService } from '@modules/whatsapp/whatsapp.service';
import { WhatsAppMessagePolicyService } from '@modules/whatsapp/whatsapp-message-policy.service';
import { CommunicationWriteScopeService } from '../write/communication-write-scope.service';
import { CommunicationReadRepository } from '../read/communication-read.repository';
import { CommunicationQuickActionExecutorService } from './communication-quick-action.executor';
import { CommunicationQuickActionResolverService } from './communication-quick-action.resolver';

describe('CommunicationWhatsAppOpsService (C9.1)', () => {
  let service: CommunicationWhatsAppOpsService;
  let whatsapp: { getAiSuggestion: jest.Mock };
  let policy: { canSendFreeText: jest.Mock };
  let scope: { assertConversationMutable: jest.Mock };
  let readRepository: { findConversationById: jest.Mock };
  let executor: { execute: jest.Mock };
  let resolver: { listAvailableActions: jest.Mock };
  let prisma: {
    communicationConversation: { findFirst: jest.Mock };
    orgWhatsAppConfig: { findUnique: jest.Mock };
    whatsAppConversation: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    whatsapp = { getAiSuggestion: jest.fn() };
    policy = { canSendFreeText: jest.fn() };
    scope = { assertConversationMutable: jest.fn().mockResolvedValue(undefined) };
    readRepository = {
      findConversationById: jest.fn().mockResolvedValue({
        id: 'conv-1',
        channel: CommunicationChannel.WHATSAPP,
        organizationId: 'org-1',
      }),
    };
    executor = { execute: jest.fn() };
    resolver = { listAvailableActions: jest.fn().mockResolvedValue([]) };
    prisma = {
      communicationConversation: {
        findFirst: jest.fn().mockResolvedValue({ nativeConversationId: 'wa-1' }),
      },
      orgWhatsAppConfig: {
        findUnique: jest.fn().mockResolvedValue({ isActive: true }),
      },
      whatsAppConversation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'wa-1',
          organizationId: 'org-1',
          lastCustomerMessageAt: new Date(),
        }),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CommunicationWhatsAppOpsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CommunicationReadRepository, useValue: readRepository },
        { provide: CommunicationWriteScopeService, useValue: scope },
        { provide: WhatsAppService, useValue: whatsapp },
        { provide: WhatsAppMessagePolicyService, useValue: policy },
        { provide: CommunicationQuickActionExecutorService, useValue: executor },
        { provide: CommunicationQuickActionResolverService, useValue: resolver },
      ],
    }).compile();

    service = moduleRef.get(CommunicationWhatsAppOpsService);
  });

  it('returns FREEFORM_TEXT_ALLOWED when policy allows free text', async () => {
    policy.canSendFreeText.mockReturnValue({ allowed: true });
    const result = await service.getComposerCapability('org-1', 'conv-1', { userId: 'user-1' });
    expect(result.replyMode).toBe('FREEFORM_TEXT_ALLOWED');
    expect(scope.assertConversationMutable).toHaveBeenCalled();
  });

  it('returns TEMPLATE_REQUIRED outside messaging window', async () => {
    policy.canSendFreeText.mockReturnValue({
      allowed: false,
      reason: 'Use an approved template instead.',
    });
    const result = await service.getComposerCapability('org-1', 'conv-1', { userId: 'user-1' });
    expect(result.replyMode).toBe('TEMPLATE_REQUIRED');
  });

  it('generates AI suggestion without sending provider message', async () => {
    whatsapp.getAiSuggestion.mockResolvedValue({
      suggestedReply: 'Draft reply',
      intent: 'GENERAL',
      confidence: 0.9,
      canSendAutomatically: false,
    });

    const result = await service.getAiSuggestion('org-1', 'conv-1', { userId: 'user-1' });

    expect(result.suggestedReply).toBe('Draft reply');
    expect(result.canSendAutomatically).toBe(false);
    expect(whatsapp.getAiSuggestion).toHaveBeenCalledWith('org-1', 'wa-1');
    expect(whatsapp.getAiSuggestion).toHaveBeenCalledTimes(1);
  });

  it('delegates quick action execution to canonical executor', async () => {
    executor.execute.mockResolvedValue({
      actionType: 'COMPOSER_PREFILL',
      actionId: 'send_pickup_instructions',
      text: 'Pickup text',
    });

    const result = await service.executeQuickAction(
      'org-1',
      'conv-1',
      'send_pickup_instructions',
      { userId: 'user-1' },
    );

    expect(executor.execute).toHaveBeenCalledWith(
      'org-1',
      'conv-1',
      'wa-1',
      'send_pickup_instructions',
      { userId: 'user-1' },
      {},
    );
    expect(result.actionType).toBe('COMPOSER_PREFILL');
  });
});
