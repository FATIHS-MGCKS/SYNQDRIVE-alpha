import {
  CommunicationActorType,
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationDirection,
  CommunicationEventType,
  CommunicationProviderIdentity,
  WhatsAppConversationStatus,
  WhatsAppMessageDeliveryStatus,
} from '@prisma/client';
import { buildCanonicalIdempotencyKey } from '../../normalization/communication-idempotency';
import {
  MetaWhatsAppCommunicationAdapter,
  mapWhatsAppConversationStatus,
} from './meta-whatsapp-communication.adapter';

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wa-convo-1',
    organizationId: 'org-1',
    contactPhone: '+491701234567',
    contactPhoneNormalized: '491701234567',
    contactName: 'Alex',
    phoneNumberId: 'pn-1',
    customerId: null,
    bookingId: null,
    vehicleId: null,
    lastMessageAt: new Date('2026-08-21T10:00:00Z'),
    lastMessagePreview: 'Hi',
    lastCustomerMessageAt: new Date('2026-08-21T10:00:00Z'),
    unreadCount: 1,
    status: WhatsAppConversationStatus.OPEN,
    assignedTo: null,
    lastDetectedIntent: null,
    createdAt: new Date('2026-08-21T09:00:00Z'),
    updatedAt: new Date('2026-08-21T10:00:00Z'),
    ...overrides,
  } as any;
}

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wa-msg-1',
    organizationId: 'org-1',
    conversationId: 'wa-convo-1',
    direction: 'incoming',
    senderType: 'customer',
    senderName: 'Alex',
    content: 'Hello there',
    messageType: 'text',
    templateName: null,
    providerMessageId: 'wamid.inbound.1',
    idempotencyKey: null,
    aiGenerated: false,
    aiSuggested: false,
    status: WhatsAppMessageDeliveryStatus.DELIVERED,
    failureReason: null,
    createdAt: new Date('2026-08-21T10:00:00Z'),
    updatedAt: new Date('2026-08-21T10:00:00Z'),
    ...overrides,
  } as any;
}

describe('MetaWhatsAppCommunicationAdapter', () => {
  const adapter = new MetaWhatsAppCommunicationAdapter();

  it('maps inbound text message to MESSAGE_RECEIVED', () => {
    const result = adapter.fromInbound({
      conversation: conversation(),
      message: message(),
      webhookExternalEventId: 'msg:wamid.inbound.1',
    });

    expect(result.envelope.channel).toBe(CommunicationChannel.WHATSAPP);
    expect(result.envelope.nativeConversationId).toBe('wa-convo-1');
    expect(result.event.eventType).toBe(CommunicationEventType.MESSAGE_RECEIVED);
    expect(result.event.direction).toBe(CommunicationDirection.INBOUND);
    expect(result.event.providerIdentity).toBe(CommunicationProviderIdentity.META_WHATSAPP);
    expect(result.event.actorType).toBe(CommunicationActorType.CUSTOMER);
    expect(result.projection?.unreadDelta).toBe(1);
  });

  it('maps inbound media message without body duplication', () => {
    const result = adapter.fromInbound({
      conversation: conversation(),
      message: message({
        messageType: 'image',
        content: '[media omitted]',
      }),
      webhookExternalEventId: 'msg:wamid.media.1',
    });

    expect(result.event.eventType).toBe(CommunicationEventType.MESSAGE_RECEIVED);
    expect(result.event.metadata).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('Hello there');
  });

  it('maps outbound AI reply to MESSAGE_SENT with AI actor', () => {
    const result = adapter.fromOutboundAccepted({
      conversation: conversation(),
      message: message({
        direction: 'outgoing',
        senderType: 'human',
        aiGenerated: true,
        status: WhatsAppMessageDeliveryStatus.SENT,
        providerMessageId: 'wamid.out.ai.1',
      }),
    });

    expect(result.event.eventType).toBe(CommunicationEventType.MESSAGE_SENT);
    expect(result.event.direction).toBe(CommunicationDirection.OUTBOUND);
    expect(result.event.actorType).toBe(CommunicationActorType.AI_AGENT);
  });

  it('maps outbound human reply to MESSAGE_SENT with USER actor', () => {
    const result = adapter.fromOutboundAccepted({
      conversation: conversation(),
      message: message({
        direction: 'outgoing',
        senderType: 'human',
        status: WhatsAppMessageDeliveryStatus.SENT,
        providerMessageId: 'wamid.out.human.1',
      }),
    });

    expect(result.event.actorType).toBe(CommunicationActorType.USER);
  });

  it('maps delivered lifecycle to MESSAGE_DELIVERED', () => {
    const result = adapter.fromStatusUpdate({
      conversation: conversation(),
      message: message({
        direction: 'outgoing',
        status: WhatsAppMessageDeliveryStatus.DELIVERED,
        providerMessageId: 'wamid.shared.1',
      }),
      status: 'DELIVERED',
      webhookExternalEventId: 'status:wamid.shared.1:delivered:1',
      occurredAt: new Date('2026-08-21T10:01:00Z'),
    });

    expect(result.event.eventType).toBe(CommunicationEventType.MESSAGE_DELIVERED);
    expect(result.projection?.unreadDelta).toBeUndefined();
  });

  it('maps read lifecycle to MESSAGE_READ', () => {
    const result = adapter.fromStatusUpdate({
      conversation: conversation(),
      message: message({
        direction: 'outgoing',
        providerMessageId: 'wamid.shared.1',
      }),
      status: 'READ',
      webhookExternalEventId: 'status:wamid.shared.1:read:2',
      occurredAt: new Date('2026-08-21T10:02:00Z'),
    });

    expect(result.event.eventType).toBe(CommunicationEventType.MESSAGE_READ);
  });

  it('maps failed lifecycle to MESSAGE_FAILED with safe failure code', () => {
    const result = adapter.fromStatusUpdate({
      conversation: conversation(),
      message: message({
        direction: 'outgoing',
        providerMessageId: 'wamid.shared.1',
      }),
      status: 'FAILED',
      webhookExternalEventId: 'status:wamid.shared.1:failed:3',
      occurredAt: new Date('2026-08-21T10:03:00Z'),
      failureReason: '131047: Re-engagement message',
    });

    expect(result.event.eventType).toBe(CommunicationEventType.MESSAGE_FAILED);
    expect(result.event.metadata).toEqual({ failureCode: '131047_RE_ENGAGEMENT_MESSAGE' });
    expect(JSON.stringify(result.event.metadata)).not.toContain('Re-engagement');
  });

  it('produces distinct idempotency keys for delivered vs read on same wamid', () => {
    const delivered = adapter.fromStatusUpdate({
      conversation: conversation(),
      message: message({ direction: 'outgoing', providerMessageId: 'wamid.shared.1' }),
      status: 'DELIVERED',
      webhookExternalEventId: 'status:wamid.shared.1:delivered:1',
      occurredAt: new Date('2026-08-21T10:01:00Z'),
    });
    const read = adapter.fromStatusUpdate({
      conversation: conversation(),
      message: message({ direction: 'outgoing', providerMessageId: 'wamid.shared.1' }),
      status: 'READ',
      webhookExternalEventId: 'status:wamid.shared.1:read:2',
      occurredAt: new Date('2026-08-21T10:02:00Z'),
    });

    expect(delivered.event.idempotencyKey).not.toBe(read.event.idempotencyKey);
  });

  it('produces stable idempotency key for provider replay', () => {
    const first = adapter.fromInbound({
      conversation: conversation(),
      message: message(),
      webhookExternalEventId: 'msg:wamid.inbound.1',
    });
    const replay = adapter.fromInbound({
      conversation: conversation(),
      message: message(),
      webhookExternalEventId: 'msg:wamid.inbound.1',
    });

    expect(first.event.idempotencyKey).toBe(replay.event.idempotencyKey);
    expect(first.event.idempotencyKey).toMatch(/^cc1:[a-f0-9]{64}$/);
  });

  it('uses WhatsAppConversation.id as nativeConversationId', () => {
    const result = adapter.fromInbound({
      conversation: conversation({ id: 'native-wa-convo-id' }),
      message: message({ conversationId: 'native-wa-convo-id' }),
      webhookExternalEventId: 'msg:wamid.1',
    });
    expect(result.envelope.nativeConversationId).toBe('native-wa-convo-id');
    expect(result.envelope.nativeConversationId).not.toBe('wamid.1');
  });

  it('forwards customer context when native relation exists', () => {
    const result = adapter.fromInbound({
      conversation: conversation({
        customerId: 'cust-1',
        bookingId: 'book-1',
        vehicleId: 'veh-1',
      }),
      message: message(),
      webhookExternalEventId: 'msg:wamid.1',
    });

    expect(result.envelope.initialContext).toEqual({
      customerId: 'cust-1',
      bookingId: 'book-1',
      vehicleId: 'veh-1',
      assignedUserId: null,
    });
  });

  it('leaves unresolved context null', () => {
    const result = adapter.fromInbound({
      conversation: conversation(),
      message: message(),
      webhookExternalEventId: 'msg:wamid.1',
    });
    expect(result.envelope.initialContext?.customerId).toBeNull();
    expect(result.envelope.initialContext?.bookingId).toBeNull();
  });

  it('rejects wamid used as native conversation id', () => {
    expect(() =>
      adapter.fromInbound({
        conversation: conversation({ id: 'wamid.bad' }),
        message: message({ conversationId: 'wamid.bad', providerMessageId: 'wamid.bad' }),
        webhookExternalEventId: 'msg:wamid.bad',
      }),
    ).toThrow();
  });

  it('maps pending human native status to HUMAN_REQUIRED canonical status', () => {
    expect(mapWhatsAppConversationStatus(WhatsAppConversationStatus.PENDING_HUMAN)).toBe(
      CommunicationConversationStatus.HUMAN_REQUIRED,
    );
  });

  it('uses webhook external event id in idempotency when provided', () => {
    const result = adapter.fromInbound({
      conversation: conversation(),
      message: message(),
      webhookExternalEventId: 'msg:wamid.inbound.1',
    });
    const expected = buildCanonicalIdempotencyKey({
      organizationId: 'org-1',
      channel: CommunicationChannel.WHATSAPP,
      providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
      eventType: CommunicationEventType.MESSAGE_RECEIVED,
      nativeConversationId: 'wa-convo-1',
      providerEventId: 'msg:wamid.inbound.1',
    });
    expect(result.event.idempotencyKey).toBe(expected);
  });
});
