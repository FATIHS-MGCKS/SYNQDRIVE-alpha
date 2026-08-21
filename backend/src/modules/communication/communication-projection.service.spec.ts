import { BadRequestException } from '@nestjs/common';
import {
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationEventType,
  CommunicationProviderIdentity,
} from '@prisma/client';
import { CommunicationProjectionService } from './communication-projection.service';
import { CommunicationConversationRepository } from './communication-conversation.repository';
import { CommunicationEventRepository } from './communication-event.repository';
import { buildCanonicalIdempotencyKey } from './normalization/communication-idempotency';
import { CommunicationNormalizationErrorCode } from './normalization/communication-normalization.errors';
import type { NormalizedCommunicationInput } from './normalization/communication-normalization.types';
import type { UpdateCommunicationConversationProjectionInput } from './communication.types';

function makePrisma() {
  const tx = {};
  return {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
  } as any;
}

function voiceInput(
  provider: CommunicationProviderIdentity,
  eventType: CommunicationEventType,
  providerEventId: string,
  nativeConversationId = 'voice-native-1',
): NormalizedCommunicationInput {
  return {
    envelope: {
      organizationId: 'org-1',
      channel: CommunicationChannel.VOICE,
      nativeConversationId,
    },
    event: {
      eventType,
      occurredAt: new Date('2026-08-21T12:00:00Z'),
      providerIdentity: provider,
      providerEventId,
      idempotencyKey: buildCanonicalIdempotencyKey({
        organizationId: 'org-1',
        channel: CommunicationChannel.VOICE,
        providerIdentity: provider,
        eventType,
        nativeConversationId,
        providerEventId,
      }),
    },
  };
}

describe('CommunicationProjectionService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let conversations: jest.Mocked<CommunicationConversationRepository>;
  let events: jest.Mocked<CommunicationEventRepository>;
  let service: CommunicationProjectionService;

  beforeEach(() => {
    prisma = makePrisma();
    conversations = {
      ensureConversationEnvelope: jest.fn(),
      updateConversationProjection: jest.fn(),
    } as unknown as jest.Mocked<CommunicationConversationRepository>;
    events = {
      appendEventIdempotently: jest.fn(),
    } as unknown as jest.Mocked<CommunicationEventRepository>;
    service = new CommunicationProjectionService(prisma, conversations, events);
  });

  it('creates envelope and appends event with unread delta on first create', async () => {
    conversations.ensureConversationEnvelope.mockResolvedValue({
      conversation: {
        id: 'cc-1',
        organizationId: 'org-1',
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: 'wa-1',
        lastActivityAt: new Date('2026-08-21T10:00:00Z'),
        unreadCount: 0,
        customerId: null,
        bookingId: null,
        vehicleId: null,
      } as any,
      created: true,
    });
    events.appendEventIdempotently.mockResolvedValue({
      event: { id: 'ev-1' } as any,
      created: true,
    });

    const result = await service.projectNormalizedInput({
      envelope: {
        organizationId: 'org-1',
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: 'wa-1',
      },
      event: {
        eventType: CommunicationEventType.MESSAGE_RECEIVED,
        occurredAt: new Date('2026-08-21T10:00:00Z'),
        providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
        providerEventId: 'evt-wa-1',
        idempotencyKey: buildCanonicalIdempotencyKey({
          organizationId: 'org-1',
          channel: CommunicationChannel.WHATSAPP,
          providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
          eventType: CommunicationEventType.MESSAGE_RECEIVED,
          nativeConversationId: 'wa-1',
          providerEventId: 'evt-wa-1',
        }),
      },
      projection: { unreadDelta: 1 },
    });

    expect(result.conversationCreated).toBe(true);
    expect(result.eventCreated).toBe(true);
    expect(events.appendEventIdempotently).toHaveBeenCalled();
    expect(conversations.updateConversationProjection).toHaveBeenCalledWith(
      'org-1',
      'cc-1',
      expect.objectContaining({ unreadCount: 1 }),
      expect.anything(),
    );
  });

  it('replay does not duplicate event and does not reapply unread delta', async () => {
    conversations.ensureConversationEnvelope.mockResolvedValue({
      conversation: {
        id: 'cc-1',
        organizationId: 'org-1',
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: 'wa-1',
        lastActivityAt: new Date('2026-08-21T10:00:00Z'),
        unreadCount: 3,
        customerId: null,
        bookingId: null,
        vehicleId: null,
      } as any,
      created: false,
    });
    events.appendEventIdempotently.mockResolvedValue({
      event: { id: 'ev-existing' } as any,
      created: false,
    });

    const result = await service.projectNormalizedInput({
      envelope: {
        organizationId: 'org-1',
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: 'wa-1',
      },
      event: {
        eventType: CommunicationEventType.MESSAGE_RECEIVED,
        occurredAt: new Date('2026-08-21T10:00:00Z'),
        providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
        providerEventId: 'evt-replay',
        idempotencyKey: 'org-1:wa:replay',
      },
      projection: { unreadDelta: 1 },
    });

    expect(result.eventCreated).toBe(false);
    const updateCalls = conversations.updateConversationProjection.mock.calls;
    const unreadPatch = updateCalls.find(
      ([, , patch]: [string, string, UpdateCommunicationConversationProjectionInput]) =>
        patch.unreadCount !== undefined,
    );
    expect(unreadPatch).toBeUndefined();
  });

  it('keeps lastActivityAt monotonic when older event arrives later', async () => {
    const newer = new Date('2026-08-21T12:00:00Z');
    const older = new Date('2026-08-21T11:00:00Z');
    conversations.ensureConversationEnvelope.mockResolvedValue({
      conversation: {
        id: 'cc-voice',
        organizationId: 'org-1',
        channel: CommunicationChannel.VOICE,
        nativeConversationId: 'voice-native-1',
        lastActivityAt: newer,
        unreadCount: 0,
        customerId: null,
        bookingId: null,
        vehicleId: null,
      } as any,
      created: false,
    });
    events.appendEventIdempotently.mockResolvedValue({
      event: { id: 'ev-old' } as any,
      created: true,
    });

    await service.projectNormalizedInput({
      ...voiceInput(
        CommunicationProviderIdentity.TWILIO,
        CommunicationEventType.CALL_CONNECTED,
        'CA-old',
      ),
      event: {
        ...voiceInput(
          CommunicationProviderIdentity.TWILIO,
          CommunicationEventType.CALL_CONNECTED,
          'CA-old',
        ).event,
        occurredAt: older,
      },
    });

    for (const [, , patch] of conversations.updateConversationProjection.mock.calls) {
      if (patch.lastActivityAt) {
        expect(patch.lastActivityAt.getTime()).toBeGreaterThanOrEqual(newer.getTime());
      }
    }
    expect(conversations.updateConversationProjection).not.toHaveBeenCalledWith(
      'org-1',
      'cc-voice',
      expect.objectContaining({ lastActivityAt: older }),
      expect.anything(),
    );
  });

  it('accepts TWILIO then ELEVENLABS events on same Voice conversation', async () => {
    const conversation = {
      id: 'cc-voice',
      organizationId: 'org-1',
      channel: CommunicationChannel.VOICE,
      nativeConversationId: 'voice-native-1',
      lastActivityAt: new Date('2026-08-21T10:00:00Z'),
      unreadCount: 0,
      customerId: 'cust-1',
      bookingId: null,
      vehicleId: null,
    } as any;

    conversations.ensureConversationEnvelope.mockResolvedValue({
      conversation,
      created: false,
    });
    events.appendEventIdempotently
      .mockResolvedValueOnce({ event: { id: 'ev-twilio' } as any, created: true })
      .mockResolvedValueOnce({ event: { id: 'ev-el' } as any, created: true });

    const twilio = await service.projectNormalizedInput(
      voiceInput(
        CommunicationProviderIdentity.TWILIO,
        CommunicationEventType.CALL_STARTED,
        'CA123',
      ),
    );
    const eleven = await service.projectNormalizedInput(
      voiceInput(
        CommunicationProviderIdentity.ELEVENLABS,
        CommunicationEventType.AI_INTENT_DETECTED,
        'el-evt-1',
      ),
    );

    expect(twilio.conversationId).toBe('cc-voice');
    expect(eleven.conversationId).toBe('cc-voice');
    expect(events.appendEventIdempotently).toHaveBeenCalledTimes(2);
    expect(conversations.ensureConversationEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({ nativeConversationId: 'voice-native-1' }),
      expect.anything(),
    );
  });

  it('propagates tenant context rejection from repository', async () => {
    conversations.ensureConversationEnvelope.mockRejectedValue(
      new BadRequestException('Customer not found in this organization'),
    );

    await expect(
      service.projectNormalizedInput({
        envelope: {
          organizationId: 'org-1',
          channel: CommunicationChannel.WHATSAPP,
          nativeConversationId: 'wa-1',
          initialContext: { customerId: 'cust-foreign' },
        },
        event: {
          eventType: CommunicationEventType.MESSAGE_RECEIVED,
          occurredAt: new Date(),
          providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
          providerEventId: 'evt-1',
          idempotencyKey: 'org-1:wa:1',
        },
      }),
    ).rejects.toMatchObject({
      code: CommunicationNormalizationErrorCode.TENANT_CONTEXT_REJECTED,
    });
  });

  it('wraps transaction failures as PROJECTION_FAILURE', async () => {
    prisma.$transaction.mockRejectedValue(new Error('db down'));

    await expect(
      service.projectNormalizedInput({
        envelope: {
          organizationId: 'org-1',
          channel: CommunicationChannel.WHATSAPP,
          nativeConversationId: 'wa-1',
        },
        event: {
          eventType: CommunicationEventType.MESSAGE_RECEIVED,
          occurredAt: new Date(),
          providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
          providerEventId: 'evt-1',
          idempotencyKey: 'org-1:wa:1',
        },
      }),
    ).rejects.toMatchObject({
      code: CommunicationNormalizationErrorCode.PROJECTION_FAILURE,
    });
  });

  it('does not persist when persist=false after validation', async () => {
    const result = await service.projectNormalizedInput({
      envelope: {
        organizationId: 'org-1',
        channel: CommunicationChannel.EMAIL,
        nativeConversationId: 'outbound-1',
      },
      event: {
        eventType: CommunicationEventType.MESSAGE_DELIVERED,
        occurredAt: new Date(),
        providerIdentity: CommunicationProviderIdentity.RESEND,
        providerEventId: 'resend-1',
        idempotencyKey: buildCanonicalIdempotencyKey({
          organizationId: 'org-1',
          channel: CommunicationChannel.EMAIL,
          providerIdentity: CommunicationProviderIdentity.RESEND,
          eventType: CommunicationEventType.MESSAGE_DELIVERED,
          nativeConversationId: 'outbound-1',
          providerEventId: 'resend-1',
        }),
      },
      persist: false,
    });

    expect(result.eventCreated).toBe(false);
    expect(conversations.ensureConversationEnvelope).not.toHaveBeenCalled();
  });

  it('forwards convergent status on replay', async () => {
    conversations.ensureConversationEnvelope.mockResolvedValue({
      conversation: {
        id: 'cc-1',
        organizationId: 'org-1',
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: 'wa-1',
        lastActivityAt: new Date('2026-08-21T10:00:00Z'),
        unreadCount: 0,
        customerId: null,
        bookingId: null,
        vehicleId: null,
      } as any,
      created: false,
    });
    events.appendEventIdempotently.mockResolvedValue({
      event: { id: 'ev-existing' } as any,
      created: false,
    });

    await service.projectNormalizedInput({
      envelope: {
        organizationId: 'org-1',
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: 'wa-1',
      },
      event: {
        eventType: CommunicationEventType.HUMAN_REQUIRED,
        occurredAt: new Date('2026-08-21T10:00:00Z'),
        providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
        providerEventId: 'evt-hr',
        idempotencyKey: 'org-1:wa:hr',
      },
      projection: { status: CommunicationConversationStatus.HUMAN_REQUIRED },
    });

    expect(conversations.updateConversationProjection).toHaveBeenCalledWith(
      'org-1',
      'cc-1',
      expect.objectContaining({ status: CommunicationConversationStatus.HUMAN_REQUIRED }),
      expect.anything(),
    );
  });
});
