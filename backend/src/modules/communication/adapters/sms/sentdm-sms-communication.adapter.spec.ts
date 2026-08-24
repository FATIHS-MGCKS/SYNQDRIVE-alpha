import { SentDmSmsCommunicationAdapter } from './sentdm-sms-communication.adapter';
import {
  CommunicationChannel,
  CommunicationEventType,
  CommunicationProviderIdentity,
  SmsConversationStatus,
  SmsMessageDeliveryStatus,
} from '@prisma/client';

describe('SentDmSmsCommunicationAdapter', () => {
  const adapter = new SentDmSmsCommunicationAdapter();

  const conversation = {
    id: 'sms-convo-1',
    organizationId: 'org-1',
    contactPhone: '+491701234567',
    contactPhoneNormalized: '491701234567',
    contactName: null,
    customerId: null,
    bookingId: null,
    vehicleId: null,
    lastMessageAt: null,
    lastMessagePreview: null,
    lastCustomerMessageAt: null,
    unreadCount: 0,
    status: SmsConversationStatus.OPEN,
    createdAt: new Date('2026-08-21T10:00:00Z'),
    updatedAt: new Date('2026-08-21T10:00:00Z'),
  };

  it('maps outbound accepted to MESSAGE_SENT without phone in metadata', () => {
    const message = {
      id: 'sms-msg-1',
      organizationId: 'org-1',
      conversationId: 'sms-convo-1',
      direction: 'outgoing',
      senderType: 'system',
      content: 'Hello',
      providerMessageId: 'prov-msg-1',
      businessOperationId: 'biz-op-1',
      providerStatus: 'QUEUED',
      status: SmsMessageDeliveryStatus.QUEUED,
      failureCode: null,
      failureReason: null,
      dispatchAttemptedAt: new Date('2026-08-21T10:01:00Z'),
      firstDispatchAttemptedAt: new Date('2026-08-21T10:01:00Z'),
      acceptedAt: new Date('2026-08-21T10:01:00Z'),
      deliveredAt: null,
      failedAt: null,
      dispatchAttemptedAt: null,
      firstDispatchAttemptedAt: null,
      createdAt: new Date('2026-08-21T10:01:00Z'),
      updatedAt: new Date('2026-08-21T10:01:00Z'),
    };

    const normalized = adapter.fromOutboundAccepted({ conversation, message });
    expect(normalized.event.eventType).toBe(CommunicationEventType.MESSAGE_SENT);
    expect(normalized.envelope.channel).toBe(CommunicationChannel.SMS);
    expect(normalized.event.providerIdentity).toBe(CommunicationProviderIdentity.SENT_DM);
    expect(JSON.stringify(normalized.event.metadata ?? {})).not.toMatch(/phone|4917|body/i);
  });

  it('maps delivered webhook to MESSAGE_DELIVERED with stable provider event id', () => {
    const message = {
      id: 'sms-msg-2',
      organizationId: 'org-1',
      conversationId: 'sms-convo-1',
      direction: 'outgoing',
      senderType: 'system',
      content: 'Hello',
      providerMessageId: 'prov-msg-2',
      businessOperationId: 'biz-op-2',
      providerStatus: 'DELIVERED',
      status: SmsMessageDeliveryStatus.DELIVERED,
      failureCode: null,
      failureReason: null,
      dispatchAttemptedAt: new Date('2026-08-21T10:01:00Z'),
      firstDispatchAttemptedAt: new Date('2026-08-21T10:01:00Z'),
      acceptedAt: new Date('2026-08-21T10:01:00Z'),
      deliveredAt: new Date('2026-08-21T10:02:00Z'),
      failedAt: null,
      dispatchAttemptedAt: null,
      firstDispatchAttemptedAt: null,
      createdAt: new Date('2026-08-21T10:01:00Z'),
      updatedAt: new Date('2026-08-21T10:02:00Z'),
    };

    const normalized = adapter.fromStatusUpdate({
      conversation,
      message,
      status: 'DELIVERED',
      webhookExternalEventId: 'prov-msg-2:DELIVERED',
      occurredAt: new Date('2026-08-21T10:02:00Z'),
    });

    expect(normalized.event.eventType).toBe(CommunicationEventType.MESSAGE_DELIVERED);
    expect(normalized.event.providerEventId).toBe('prov-msg-2:DELIVERED');
  });
});
