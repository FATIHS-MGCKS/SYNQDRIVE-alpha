import { BadRequestException } from '@nestjs/common';
import {
  CommunicationChannel,
  CommunicationConversationStatus,
} from '@prisma/client';
import { CommunicationConversationRepository } from './communication-conversation.repository';
import { CommunicationTenantContextValidation } from './communication-tenant-context.validation';

function makePrisma() {
  return {
    communicationConversation: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  } as any;
}

describe('CommunicationConversationRepository', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let tenantContext: CommunicationTenantContextValidation;
  let repository: CommunicationConversationRepository;

  beforeEach(() => {
    prisma = makePrisma();
    tenantContext = {
      assertConversationContextBelongsToOrg: jest.fn().mockResolvedValue(undefined),
    } as unknown as CommunicationTenantContextValidation;
    repository = new CommunicationConversationRepository(prisma, tenantContext);
  });

  it('creates canonical conversation with unreadCount default path', async () => {
    prisma.communicationConversation.create.mockResolvedValue({
      id: 'cc-1',
      unreadCount: 0,
    });

    await repository.createConversation({
      organizationId: 'org-1',
      channel: CommunicationChannel.WHATSAPP,
      nativeConversationId: 'wa-native-1',
    });

    expect(tenantContext.assertConversationContextBelongsToOrg).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ nativeConversationId: 'wa-native-1' }),
      undefined,
    );
    expect(prisma.communicationConversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          unreadCount: 0,
        }),
      }),
    );
  });

  it('persists conversation status', async () => {
    prisma.communicationConversation.create.mockResolvedValue({ id: 'cc-2' });
    await repository.createConversation({
      organizationId: 'org-1',
      channel: CommunicationChannel.VOICE,
      nativeConversationId: 'voice-native-1',
      status: CommunicationConversationStatus.HUMAN_REQUIRED,
    });
    expect(prisma.communicationConversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: CommunicationConversationStatus.HUMAN_REQUIRED,
        }),
      }),
    );
  });

  it('findByNativeReference scopes organizationId', async () => {
    prisma.communicationConversation.findUnique.mockResolvedValue(null);
    await repository.findByNativeReference(
      'org-1',
      CommunicationChannel.WHATSAPP,
      'wa-1',
    );
    expect(prisma.communicationConversation.findUnique).toHaveBeenCalledWith({
      where: {
        communication_conversations_org_channel_native: {
          organizationId: 'org-1',
          channel: CommunicationChannel.WHATSAPP,
          nativeConversationId: 'wa-1',
        },
      },
    });
  });

  it('ensureConversationEnvelope returns existing row without create', async () => {
    prisma.communicationConversation.findUnique.mockResolvedValue({ id: 'existing' });
    const result = await repository.ensureConversationEnvelope({
      organizationId: 'org-1',
      channel: CommunicationChannel.WHATSAPP,
      nativeConversationId: 'wa-dup',
    });
    expect(result.created).toBe(false);
    expect(result.conversation).toEqual({ id: 'existing' });
    expect(prisma.communicationConversation.create).not.toHaveBeenCalled();
  });

  it('rejects negative unreadCount', async () => {
    await expect(
      repository.createConversation({
        organizationId: 'org-1',
        channel: CommunicationChannel.EMAIL,
        nativeConversationId: 'email-1',
        unreadCount: -1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates tenant context on projection update', async () => {
    prisma.communicationConversation.findFirst.mockResolvedValue({ id: 'cc-5' });
    prisma.communicationConversation.update.mockResolvedValue({ id: 'cc-5' });
    await repository.updateConversationProjection('org-1', 'cc-5', {
      assignedUserId: 'user-1',
      customerId: 'cust-1',
    });
    expect(tenantContext.assertConversationContextBelongsToOrg).toHaveBeenCalledWith(
      'org-1',
      { assignedUserId: 'user-1', customerId: 'cust-1' },
      undefined,
    );
  });

  it('incrementUnreadCount rejects non-positive delta', async () => {
    prisma.communicationConversation.findFirst.mockResolvedValue({ id: 'cc-1' });
    await expect(repository.incrementUnreadCount('org-1', 'cc-1', 0)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.communicationConversation.update).not.toHaveBeenCalled();
  });

  it('incrementUnreadCount uses prisma atomic increment', async () => {
    prisma.communicationConversation.findFirst.mockResolvedValue({ id: 'cc-1' });
    prisma.communicationConversation.update.mockResolvedValue({ id: 'cc-1', unreadCount: 2 });
    await repository.incrementUnreadCount('org-1', 'cc-1', 2);
    expect(prisma.communicationConversation.update).toHaveBeenCalledWith({
      where: { id: 'cc-1' },
      data: { unreadCount: { increment: 2 } },
    });
  });
});
