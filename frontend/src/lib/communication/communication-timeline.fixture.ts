import type {
  CommunicationConversationDetail,
  CommunicationEvent,
  CommunicationEventListResponse,
} from './types';

export const MOCK_CONVERSATION_DETAIL_ID = '00000000-0000-4000-8000-000000000101';

export const COMMUNICATION_DETAIL_FIXTURE: CommunicationConversationDetail = {
  id: MOCK_CONVERSATION_DETAIL_ID,
  channel: 'WHATSAPP',
  status: 'AI_ACTIVE',
  unreadCount: 2,
  lastActivityAt: '2026-08-22T10:30:00.000Z',
  displayLabel: 'Max Mustermann',
  lastMessagePreview: 'Pickup reminder sent',
  customer: { id: 'cust-1', displayName: 'Max Mustermann' },
  booking: { id: 'book-1', reference: 'BK-ABC123', status: 'CONFIRMED' },
  vehicle: { id: 'veh-1', displayLabel: 'KS-AB 123' },
  station: null,
  assignedUser: null,
  assignedAgent: null,
  createdAt: '2026-08-20T08:00:00.000Z',
  updatedAt: '2026-08-22T10:30:00.000Z',
};

export const COMMUNICATION_DETAIL_EMPTY_CONTEXT_FIXTURE: CommunicationConversationDetail = {
  id: '00000000-0000-4000-8000-000000000199',
  channel: 'SMS',
  status: 'WAITING_CUSTOMER',
  unreadCount: 0,
  lastActivityAt: '2026-08-22T08:00:00.000Z',
  displayLabel: 'Unknown contact',
  lastMessagePreview: null,
  customer: null,
  booking: null,
  vehicle: null,
  station: null,
  assignedUser: null,
  assignedAgent: null,
  createdAt: '2026-08-21T08:00:00.000Z',
  updatedAt: '2026-08-22T08:00:00.000Z',
};

export const COMMUNICATION_VOICE_DETAIL_FIXTURE: CommunicationConversationDetail = {
  id: '00000000-0000-4000-8000-000000000102',
  channel: 'VOICE',
  status: 'HUMAN_REQUIRED',
  unreadCount: 0,
  lastActivityAt: '2026-08-22T09:15:00.000Z',
  displayLabel: 'Voice Customer',
  lastMessagePreview: null,
  customer: null,
  booking: null,
  vehicle: null,
  station: null,
  assignedUser: { id: 'user-1', displayName: 'Ops User' },
  assignedAgent: null,
  createdAt: '2026-08-21T09:00:00.000Z',
  updatedAt: '2026-08-22T09:15:00.000Z',
};

const whatsappInboundText: CommunicationEvent = {
  id: 'evt-001',
  eventType: 'MESSAGE_RECEIVED',
  direction: 'INBOUND',
  occurredAt: '2026-08-22T10:00:00.000Z',
  content: {
    id: 'cnt-001',
    contentType: 'TEXT',
    text: 'Hello, I need help with pickup',
    truncated: false,
    hasAttachments: false,
    attachmentCount: 0,
  },
};

const whatsappOutboundText: CommunicationEvent = {
  id: 'evt-002',
  eventType: 'MESSAGE_SENT',
  direction: 'OUTBOUND',
  occurredAt: '2026-08-22T10:05:00.000Z',
  content: {
    id: 'cnt-002',
    contentType: 'TEXT',
    text: 'Your pickup is scheduled for 14:00',
    truncated: false,
    hasAttachments: false,
    attachmentCount: 0,
  },
};

const smsInbound: CommunicationEvent = {
  id: 'evt-003',
  eventType: 'MESSAGE_RECEIVED',
  direction: 'INBOUND',
  occurredAt: '2026-08-22T09:00:00.000Z',
  content: {
    id: 'cnt-003',
    contentType: 'TEXT',
    text: 'SMS inbound message',
    truncated: false,
    hasAttachments: false,
    attachmentCount: 0,
  },
};

const imageEvent: CommunicationEvent = {
  id: 'evt-004',
  eventType: 'MESSAGE_RECEIVED',
  direction: 'INBOUND',
  occurredAt: '2026-08-22T10:10:00.000Z',
  content: {
    id: 'cnt-004',
    contentType: 'IMAGE',
    text: 'Photo caption',
    truncated: false,
    hasAttachments: true,
    attachmentCount: 1,
  },
  metadata: {
    providerLifecycleState: 'delivered',
  },
};

const unsupportedEvent: CommunicationEvent = {
  id: 'evt-005',
  eventType: 'MESSAGE_RECEIVED',
  direction: 'INBOUND',
  occurredAt: '2026-08-22T10:12:00.000Z',
  content: {
    id: 'cnt-005',
    contentType: 'UNSUPPORTED',
    text: null,
    truncated: false,
    hasAttachments: false,
    attachmentCount: 0,
  },
};

const missingContentEvent: CommunicationEvent = {
  id: 'evt-006',
  eventType: 'MESSAGE_SENT',
  direction: 'OUTBOUND',
  occurredAt: '2026-08-22T10:15:00.000Z',
  content: null,
};

const deliveryEvent: CommunicationEvent = {
  id: 'evt-007',
  eventType: 'MESSAGE_DELIVERED',
  direction: 'OUTBOUND',
  occurredAt: '2026-08-22T10:06:00.000Z',
};

const voiceCallStarted: CommunicationEvent = {
  id: 'evt-voice-001',
  eventType: 'CALL_STARTED',
  direction: 'INBOUND',
  occurredAt: '2026-08-22T09:10:00.000Z',
};

const voiceCallEnded: CommunicationEvent = {
  id: 'evt-voice-002',
  eventType: 'CALL_ENDED',
  direction: 'INBOUND',
  occurredAt: '2026-08-22T09:13:24.000Z',
  metadata: { durationSeconds: 204 },
};

const xssEvent: CommunicationEvent = {
  id: 'evt-xss',
  eventType: 'MESSAGE_RECEIVED',
  direction: 'INBOUND',
  occurredAt: '2026-08-22T10:20:00.000Z',
  content: {
    id: 'cnt-xss',
    contentType: 'TEXT',
    text: '<script>alert(1)</script><img src=x onerror=alert(1)>',
    truncated: false,
    hasAttachments: false,
    attachmentCount: 0,
  },
  metadata: {
    providerLifecycleState: 'https://provider.example/signed?token=SECRET',
  } as Record<string, string>,
};

export const COMMUNICATION_TIMELINE_PAGE_1: CommunicationEventListResponse = {
  items: [
    whatsappOutboundText,
    imageEvent,
    unsupportedEvent,
    missingContentEvent,
    deliveryEvent,
    whatsappInboundText,
  ],
  nextCursor: 'cursor-older',
  hasMore: true,
};

export const COMMUNICATION_TIMELINE_PAGE_2: CommunicationEventListResponse = {
  items: [smsInbound, whatsappInboundText],
  nextCursor: null,
  hasMore: false,
};

export const COMMUNICATION_VOICE_TIMELINE: CommunicationEventListResponse = {
  items: [voiceCallEnded, voiceCallStarted],
  nextCursor: null,
  hasMore: false,
};

export const COMMUNICATION_XSS_TIMELINE: CommunicationEventListResponse = {
  items: [xssEvent],
  nextCursor: null,
  hasMore: false,
};

export const COMMUNICATION_TIMELINE_FIXTURE_EVENTS = {
  whatsappInboundText,
  whatsappOutboundText,
  smsInbound,
  imageEvent,
  unsupportedEvent,
  missingContentEvent,
  deliveryEvent,
  voiceCallStarted,
  voiceCallEnded,
  xssEvent,
};
