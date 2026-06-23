import { NotFoundException } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppConversationContextService } from './whatsapp-conversation-context.service';
import { WhatsAppQuickActionsService } from './whatsapp-quick-actions.service';
import { WhatsAppTemplateService } from './whatsapp-template.service';

describe('WhatsApp org scoping', () => {
  const orgA = 'org-a';
  const orgB = 'org-b';
  const convoId = 'convo-1';

  describe('WhatsAppService', () => {
    const prisma = {
      orgWhatsAppConfig: { findUnique: jest.fn() },
      whatsAppConversation: { findFirst: jest.fn() },
      whatsAppMessage: { findMany: jest.fn() },
    };

    it('getMessages rejects conversation from another org', async () => {
      prisma.whatsAppConversation.findFirst.mockResolvedValue(null);
      const service = new WhatsAppService(
        prisma as any,
        { route: jest.fn() } as any,
        { get: jest.fn() } as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await expect(service.getMessages(orgB, convoId)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.whatsAppConversation.findFirst).toHaveBeenCalledWith({
        where: { id: convoId, organizationId: orgB },
      });
    });
  });

  describe('WhatsAppConversationContextService', () => {
    it('getContext rejects cross-org conversation', async () => {
      const prisma = {
        whatsAppConversation: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      const service = new WhatsAppConversationContextService(
        prisma as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await expect(service.getContext(orgA, convoId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('WhatsAppQuickActionsService', () => {
    it('execute rejects cross-org conversation', async () => {
      const prisma = {
        whatsAppConversation: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      const service = new WhatsAppQuickActionsService(
        prisma as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await expect(
        service.execute(orgA, convoId, 'close_conversation', {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('WhatsAppTemplateService', () => {
    it('update rejects template from another org', async () => {
      const prisma = {
        whatsAppTemplate: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      const service = new WhatsAppTemplateService(prisma as any, {} as any, {} as any, {} as any);

      await expect(
        service.updateDraft(orgB, 'tpl-1', { name: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
