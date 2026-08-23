import { Test } from '@nestjs/testing';
import {
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationReplySendState,
} from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationReadRepository } from '../read/communication-read.repository';
import { CommunicationHumanTakeoverService } from '../write/communication-human-takeover.service';
import { CommunicationWriteScopeService } from '../write/communication-write-scope.service';
import { CommunicationReplyChannelCapabilityService } from './communication-reply-channel-capability.service';
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
      updateMany: jest.Mock;
    };
    communicationConversation: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
    communicationEvent: { findFirst: jest.Mock };
    whatsAppMessage: { findFirst: jest.Mock };
  };
  let readRepository: { findConversationById: jest.Mock };
  let scope: { assertConversationMutable: jest.Mock };
  let channelCapability: { assertChannelCanReply: jest.Mock };
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
          processingLeaseExpiresAt: null,
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      communicationConversation: {
        findFirst: jest.fn().mockResolvedValue({ nativeConversationId: 'wa-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      communicationEvent: { findFirst: jest.fn().mockResolvedValue(null) },
      whatsAppMessage: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    readRepository = {
      findConversationById: jest.fn().mockResolvedValue(row),
    };

    scope = {
      assertConversationMutable: jest.fn().mockResolvedValue(undefined),
    };

    channelCapability = {
      assertChannelCanReply: jest.fn().mockResolvedValue(undefined),
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
        { provide: CommunicationReplyChannelCapabilityService, useValue: channelCapability },
        {
          provide: CommunicationHumanTakeoverService,
          useValue: { performHumanTakeover: jest.fn().mockResolvedValue({ changed: true }) },
        },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: WhatsAppCommunicationOutboundAdapter, useValue: whatsappAdapter },
        { provide: SmsCommunicationOutboundAdapter, useValue: { sendTextReply: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(CommunicationReplyService);
  });

  it('returns idempotent replay without second provider call', async () => {
    prisma.communicationReplyCommand.findUnique.mockResolvedValue({
      id: 'cmd-existing',
      text: 'Hello',
      sendState: CommunicationReplySendState.ACCEPTED,
      processingLeaseExpiresAt: null,
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

  it('rejects resolved conversations before channel capability', async () => {
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

    expect(channelCapability.assertChannelCanReply).not.toHaveBeenCalled();
    expect(whatsappAdapter.sendTextReply).not.toHaveBeenCalled();
  });

  it('FAILED replay throws SEND_FAILED', async () => {
    prisma.communicationReplyCommand.findUnique.mockResolvedValue({
      id: 'cmd-failed',
      text: 'Hello',
      sendState: CommunicationReplySendState.FAILED,
      failureCode: 'SEND_FAILED',
      processingLeaseExpiresAt: null,
    });
    prisma.communicationReplyCommand.findFirst.mockResolvedValue({
      id: 'cmd-failed',
      text: 'Hello',
      sendState: CommunicationReplySendState.FAILED,
      failureCode: 'SEND_FAILED',
      processingLeaseExpiresAt: null,
      canonicalEventId: null,
      nativeMessageId: null,
    });

    await expect(
      service.replyConversation('org-1', 'conv-1', { userId: 'user-a' }, {
        text: 'Hello',
        idempotencyKey: 'key-failed',
      }),
    ).rejects.toMatchObject({ response: { code: 'SEND_FAILED' } });
  });
});
