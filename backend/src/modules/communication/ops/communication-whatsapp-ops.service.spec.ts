import { Test } from '@nestjs/testing';
import { CommunicationChannel } from '@prisma/client';
import { CommunicationWhatsAppOpsService } from './communication-whatsapp-ops.service';
import { PrismaService } from '@shared/database/prisma.service';
import { WhatsAppService } from '@modules/whatsapp/whatsapp.service';
import { WhatsAppConversationContextService } from '@modules/whatsapp/whatsapp-conversation-context.service';
import { WhatsAppQuickActionsService } from '@modules/whatsapp/whatsapp-quick-actions.service';
import { WhatsAppMessagePolicyService } from '@modules/whatsapp/whatsapp-message-policy.service';
import { CommunicationWriteScopeService } from '../write/communication-write-scope.service';
import { CommunicationReadRepository } from '../read/communication-read.repository';

describe('CommunicationWhatsAppOpsService (C9.1)', () => {
  let service: CommunicationWhatsAppOpsService;
  let whatsapp: { getAiSuggestion: jest.Mock };
  let policy: { canSendFreeText: jest.Mock };
  let scope: { assertConversationMutable: jest.Mock };
  let readRepository: { findConversationById: jest.Mock };
  let prisma: {
    communicationConversation: { findFirst: jest.Mock };
    orgWhatsAppConfig: { findUnique: jest.Mock };
    whatsAppConversation: { findFirst: jest.Mock };
    whatsAppTemplate: { findMany: jest.Mock };
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
      whatsAppTemplate: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CommunicationWhatsAppOpsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CommunicationReadRepository, useValue: readRepository },
        { provide: CommunicationWriteScopeService, useValue: scope },
        { provide: WhatsAppService, useValue: whatsapp },
        { provide: WhatsAppMessagePolicyService, useValue: policy },
        { provide: WhatsAppConversationContextService, useValue: { getContext: jest.fn() } },
        { provide: WhatsAppQuickActionsService, useValue: { execute: jest.fn() } },
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
});
