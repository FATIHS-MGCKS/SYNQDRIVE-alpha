import { Test } from '@nestjs/testing';
import {
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationReplySendState,
} from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationReadRepository } from '../read/communication-read.repository';
import { CommunicationWriteScopeService } from '../write/communication-write-scope.service';
import { SmsCommunicationOutboundAdapter } from './adapters/sms-communication-outbound.adapter';
import { WhatsAppCommunicationOutboundAdapter } from './adapters/whatsapp-communication-outbound.adapter';
import { CommunicationReplyService } from './communication-reply.service';

describe('CommunicationReplyService', () => {
  let service: CommunicationReplyService;
  let prisma: {
    $transaction: jest.Mock;
      communicationReplyCommand: {
        findUnique: jest.Mock;
        findFirst: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
      };
    communicationConversation: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
    communicationEvent: { findFirst: jest.Mock };
  };
  let readRepository: { findConversationById: jest.Mock };
  let scope: { assertConversationMutable: jest.Mock };
  let whatsappAdapter: { sendTextReply: jest.Mock };

  const row = {
    id: 'conv-1',
    channel: CommunicationChannel.WHATSAPP,
    status: CommunicationConversationStatus.HUMAN_ACTIVE,
    assignedUserId: 'user-a',
    updatedAt: new Date('2026-08-22T12:00:00.000Z'),
    lastActivityAt: new Date('2026-08-22T12:00:00.000Z'),
    unreadCount: 0,
    lastContentAt: null,
    lastMessagePreview: null,
    createdAt: new Date(),
    metadata: {},
    customerId: null,
    bookingId: null,
    vehicleId: null,
    stationId: null,
    assignedAgentRef: null,
    assignedAgentType: null,
    customer: null,
    booking: null,
    vehicle: null,
    station: null,
    assignedUser: null,
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(async (fn) => fn(prisma)),
      communicationReplyCommand: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue({
          id: 'cmd-existing',
          organizationId: 'org-1',
          conversationId: 'conv-1',
          clientIdempotencyKey: 'key-1',
          text: 'Hello',
          channel: CommunicationChannel.WHATSAPP,
          sendState: CommunicationReplySendState.ACCEPTED,
          canonicalEventId: null,
          actorUserId: 'user-a',
        }),
        create: jest.fn().mockResolvedValue({
          id: 'cmd-1',
          organizationId: 'org-1',
          conversationId: 'conv-1',
          clientIdempotencyKey: 'key-1',
          text: 'Hello',
          channel: CommunicationChannel.WHATSAPP,
          sendState: CommunicationReplySendState.PENDING,
          actorUserId: 'user-a',
        }),
        update: jest.fn(),
      },
      communicationConversation: {
        findFirst: jest.fn().mockResolvedValue({ nativeConversationId: 'wa-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      communicationEvent: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    readRepository = {
      findConversationById: jest.fn().mockResolvedValue(row),
    };

    scope = {
      assertConversationMutable: jest.fn().mockResolvedValue(undefined),
    };

    whatsappAdapter = {
      sendTextReply: jest.fn().mockResolvedValue({
        sendState: CommunicationReplySendState.ACCEPTED,
        nativeMessageId: 'wa-msg-1',
        canonicalEventId: null,
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CommunicationReplyService,
        { provide: PrismaService, useValue: prisma },
        { provide: CommunicationReadRepository, useValue: readRepository },
        { provide: CommunicationWriteScopeService, useValue: scope },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: WhatsAppCommunicationOutboundAdapter, useValue: whatsappAdapter },
        { provide: SmsCommunicationOutboundAdapter, useValue: { sendTextReply: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(CommunicationReplyService);
  });

  it('rejects voice text replies', async () => {
    readRepository.findConversationById.mockResolvedValue({
      ...row,
      channel: CommunicationChannel.VOICE,
    });

    await expect(
      service.replyConversation('org-1', 'conv-1', { userId: 'user-a' }, {
        text: 'Hello',
        idempotencyKey: 'key-voice',
      }),
    ).rejects.toMatchObject({ response: { code: 'CHANNEL_NOT_REPLYABLE' } });
  });

  it('returns idempotent replay without second provider call', async () => {
    prisma.communicationReplyCommand.findUnique.mockResolvedValue({
      id: 'cmd-existing',
      organizationId: 'org-1',
      conversationId: 'conv-1',
      clientIdempotencyKey: 'key-1',
      text: 'Hello',
      channel: CommunicationChannel.WHATSAPP,
      sendState: CommunicationReplySendState.ACCEPTED,
      canonicalEventId: null,
      actorUserId: 'user-a',
    });

    await service.replyConversation('org-1', 'conv-1', { userId: 'user-a' }, {
      text: 'Hello',
      idempotencyKey: 'key-1',
    });

    expect(whatsappAdapter.sendTextReply).not.toHaveBeenCalled();
  });

  it('rejects idempotency key reuse with different text', async () => {
    prisma.communicationReplyCommand.findUnique.mockResolvedValue({
      id: 'cmd-existing',
      text: 'Original',
      sendState: CommunicationReplySendState.ACCEPTED,
    });

    await expect(
      service.replyConversation('org-1', 'conv-1', { userId: 'user-a' }, {
        text: 'Different',
        idempotencyKey: 'key-1',
      }),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });
  });

  it('rejects resolved conversations', async () => {
    readRepository.findConversationById.mockResolvedValue({
      ...row,
      status: CommunicationConversationStatus.RESOLVED,
    });

    await expect(
      service.replyConversation('org-1', 'conv-1', { userId: 'user-a' }, {
        text: 'Hello',
        idempotencyKey: 'key-resolved',
      }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_TRANSITION' } });

    expect(whatsappAdapter.sendTextReply).not.toHaveBeenCalled();
  });

  it('rejects reply when assigned to another operator', async () => {
    readRepository.findConversationById.mockResolvedValue({
      ...row,
      assignedUserId: 'user-b',
    });

    await expect(
      service.replyConversation('org-1', 'conv-1', { userId: 'user-a' }, {
        text: 'Hello',
        idempotencyKey: 'key-claimed',
      }),
    ).rejects.toMatchObject({ response: { code: 'ALREADY_CLAIMED' } });

    expect(whatsappAdapter.sendTextReply).not.toHaveBeenCalled();
  });

  it('transitions HUMAN_ACTIVE to WAITING_CUSTOMER after accepted send', async () => {
    await service.replyConversation('org-1', 'conv-1', { userId: 'user-a' }, {
      text: 'Hello',
      idempotencyKey: 'key-send',
    });

    expect(whatsappAdapter.sendTextReply).toHaveBeenCalledTimes(1);
    expect(prisma.communicationConversation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: CommunicationConversationStatus.WAITING_CUSTOMER },
      }),
    );
  });

  it('returns SEND_UNKNOWN for in-flight idempotent replay', async () => {
    prisma.communicationReplyCommand.findUnique.mockResolvedValue({
      id: 'cmd-pending',
      text: 'Hello',
      sendState: CommunicationReplySendState.PENDING,
    });

    await expect(
      service.replyConversation('org-1', 'conv-1', { userId: 'user-a' }, {
        text: 'Hello',
        idempotencyKey: 'key-pending',
      }),
    ).rejects.toMatchObject({ response: { code: 'SEND_UNKNOWN' } });
  });
});
