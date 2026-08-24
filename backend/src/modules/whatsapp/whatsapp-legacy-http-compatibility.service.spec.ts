import { NotFoundException } from '@nestjs/common';
import { CommunicationChannel } from '@prisma/client';
import { WhatsAppLegacyHttpCompatibilityService } from './whatsapp-legacy-http-compatibility.service';

describe('WhatsAppLegacyHttpCompatibilityService', () => {
  const orgId = 'org-1';
  const nativeConversationId = 'wa-native-1';
  const canonicalConversationId = 'cc-1';
  const actor = { userId: 'user-1', displayName: 'Operator' };

  const prisma = {
    communicationConversation: { findFirst: jest.fn() },
  };
  const whatsapp = {
    getConversations: jest.fn(),
    getMessages: jest.fn(),
  };
  const contextService = { getContext: jest.fn() };
  const replyService = { replyConversation: jest.fn() };
  const whatsappOps = { getAiSuggestion: jest.fn() };
  const quickActions = { execute: jest.fn() };

  const service = new WhatsAppLegacyHttpCompatibilityService(
    prisma as any,
    whatsapp as any,
    contextService as any,
    replyService as any,
    whatsappOps as any,
    quickActions as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.communicationConversation.findFirst.mockResolvedValue({
      id: canonicalConversationId,
    });
  });

  it('delegates read list to deprecated compatibility service methods', async () => {
    whatsapp.getConversations.mockResolvedValue([{ id: nativeConversationId }]);
    await expect(service.getConversations(orgId)).resolves.toEqual([{ id: nativeConversationId }]);
    expect(whatsapp.getConversations).toHaveBeenCalledWith(orgId);
  });

  it('rejects cross-org native conversation resolution for writes', async () => {
    prisma.communicationConversation.findFirst.mockResolvedValue(null);
    await expect(
      service.sendMessage(orgId, nativeConversationId, 'Hello', actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(replyService.replyConversation).not.toHaveBeenCalled();
  });

  it('routes legacy send through canonical ReplyCommand with derived idempotency key', async () => {
    replyService.replyConversation.mockResolvedValue({
      commandId: 'cmd-1',
      sendState: 'ACCEPTED',
      conversation: { id: canonicalConversationId },
      event: {
        id: 'evt-1',
        occurredAt: '2026-08-24T12:00:00.000Z',
        metadata: { providerMessageId: 'pm-1' },
      },
    });

    const result = await service.sendMessage(orgId, nativeConversationId, 'Hello', actor, 'Op');

    expect(prisma.communicationConversation.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: orgId,
        nativeConversationId,
        channel: CommunicationChannel.WHATSAPP,
      },
      select: { id: true },
    });
    expect(replyService.replyConversation).toHaveBeenCalledWith(
      orgId,
      canonicalConversationId,
      actor,
      expect.objectContaining({
        text: 'Hello',
        idempotencyKey: expect.stringMatching(/^legacy-wa-http:/),
      }),
    );
    expect(result).toMatchObject({
      direction: 'outgoing',
      content: 'Hello',
      senderName: 'Op',
      providerMessageId: 'pm-1',
    });
  });

  it('routes legacy AI suggestion through canonical WhatsApp ops service', async () => {
    whatsappOps.getAiSuggestion.mockResolvedValue({ suggestedReply: 'Hi', intent: 'GENERAL' });
    await expect(
      service.getAiSuggestion(orgId, nativeConversationId, actor),
    ).resolves.toEqual({ suggestedReply: 'Hi', intent: 'GENERAL' });
    expect(whatsappOps.getAiSuggestion).toHaveBeenCalledWith(
      orgId,
      canonicalConversationId,
      actor,
    );
  });

  it('routes legacy human review through canonical quick-action executor', async () => {
    quickActions.execute.mockResolvedValue({
      conversation: { status: 'PENDING_HUMAN' },
    });
    await expect(
      service.requestHumanReview(orgId, nativeConversationId, actor, 'Needs eyes'),
    ).resolves.toEqual({
      ok: true,
      conversationId: nativeConversationId,
      status: 'PENDING_HUMAN',
    });
    expect(quickActions.execute).toHaveBeenCalledWith(
      orgId,
      canonicalConversationId,
      nativeConversationId,
      'human_review',
      actor,
      { reason: 'Needs eyes' },
    );
  });

  it('routes legacy quick actions through canonical quick-action executor', async () => {
    quickActions.execute.mockResolvedValue({ ok: true });
    await service.executeQuickAction(orgId, nativeConversationId, 'close_conversation', actor, {});
    expect(quickActions.execute).toHaveBeenCalledWith(
      orgId,
      canonicalConversationId,
      nativeConversationId,
      'close_conversation',
      actor,
      {},
    );
  });
});
