import {
  CommunicationDirection,
  CommunicationEventType,
  CommunicationMessageContentType,
  CommunicationProviderIdentity,
} from '@prisma/client';
import type { SmsMessage, WhatsAppMessage } from '@prisma/client';
import {
  CANONICAL_MESSAGE_PREVIEW_MAX_LENGTH,
  CANONICAL_MESSAGE_TEXT_MAX_LENGTH,
} from './communication-content.constants';
import type { ProjectMessageContentInput } from './communication-content.types';

const WHATSAPP_MEDIA_TYPES = new Set([
  'image',
  'video',
  'audio',
  'document',
  'sticker',
]);

const WHATSAPP_UNSUPPORTED_TYPES = new Set([
  'reaction',
  'unknown',
  'unsupported',
]);

export function mapWhatsAppMessageType(messageType: string): CommunicationMessageContentType {
  const normalized = messageType.trim().toLowerCase();
  if (normalized === 'text' || normalized === 'template') return CommunicationMessageContentType.TEXT;
  if (normalized === 'image') return CommunicationMessageContentType.IMAGE;
  if (normalized === 'video') return CommunicationMessageContentType.VIDEO;
  if (normalized === 'audio') return CommunicationMessageContentType.AUDIO;
  if (normalized === 'document') return CommunicationMessageContentType.DOCUMENT;
  if (normalized === 'location') return CommunicationMessageContentType.LOCATION;
  if (normalized === 'contacts' || normalized === 'contact') {
    return CommunicationMessageContentType.CONTACT;
  }
  if (WHATSAPP_UNSUPPORTED_TYPES.has(normalized)) {
    return CommunicationMessageContentType.UNSUPPORTED;
  }
  if (WHATSAPP_MEDIA_TYPES.has(normalized)) {
    return CommunicationMessageContentType.IMAGE;
  }
  return CommunicationMessageContentType.UNSUPPORTED;
}

export function normalizeCanonicalText(
  raw: string | null | undefined,
): { text: string | null; truncated: boolean } {
  if (raw === null || raw === undefined) {
    return { text: null, truncated: false };
  }
  const normalized = raw.replace(/\r\n/g, '\n');
  if (normalized.length <= CANONICAL_MESSAGE_TEXT_MAX_LENGTH) {
    return { text: normalized, truncated: false };
  }
  return {
    text: normalized.slice(0, CANONICAL_MESSAGE_TEXT_MAX_LENGTH),
    truncated: true,
  };
}

export function buildMessagePreview(
  contentType: CommunicationMessageContentType,
  text: string | null | undefined,
): string | null {
  if (text?.trim()) {
    const collapsed = text.replace(/\s+/g, ' ').trim();
    if (collapsed.length <= CANONICAL_MESSAGE_PREVIEW_MAX_LENGTH) {
      return collapsed;
    }
    return `${collapsed.slice(0, CANONICAL_MESSAGE_PREVIEW_MAX_LENGTH - 1)}…`;
  }

  switch (contentType) {
    case CommunicationMessageContentType.IMAGE:
      return '[image]';
    case CommunicationMessageContentType.VIDEO:
      return '[video]';
    case CommunicationMessageContentType.AUDIO:
      return '[audio]';
    case CommunicationMessageContentType.DOCUMENT:
      return '[document]';
    case CommunicationMessageContentType.LOCATION:
      return '[location]';
    case CommunicationMessageContentType.CONTACT:
      return '[contact]';
    case CommunicationMessageContentType.MIXED:
      return '[attachment]';
    case CommunicationMessageContentType.UNSUPPORTED:
      return '[unsupported]';
    default:
      return null;
  }
}

export function mapWhatsAppMessageToContentInput(input: {
  organizationId: string;
  conversationId: string;
  communicationEventId: string;
  eventType: CommunicationEventType;
  message: WhatsAppMessage;
  occurredAt: Date;
}): ProjectMessageContentInput | null {
  if (
    input.eventType !== CommunicationEventType.MESSAGE_RECEIVED
    && input.eventType !== CommunicationEventType.MESSAGE_SENT
  ) {
    return null;
  }

  const contentType = mapWhatsAppMessageType(input.message.messageType);
  const direction =
    input.message.direction === 'incoming'
      ? CommunicationDirection.INBOUND
      : CommunicationDirection.OUTBOUND;
  const hasMedia = contentType !== CommunicationMessageContentType.TEXT
    && contentType !== CommunicationMessageContentType.UNSUPPORTED;

  return {
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    communicationEventId: input.communicationEventId,
    channel: 'WHATSAPP',
    direction,
    eventType: input.eventType,
    contentType,
    text: input.message.content,
    nativeMessageId: input.message.id,
    providerMessageId: input.message.providerMessageId,
    providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
    occurredAt: input.occurredAt,
    hasAttachments: hasMedia,
    attachmentCount: hasMedia ? 1 : 0,
  };
}

export function mapSmsMessageToContentInput(input: {
  organizationId: string;
  conversationId: string;
  communicationEventId: string;
  eventType: CommunicationEventType;
  message: SmsMessage;
  occurredAt: Date;
}): ProjectMessageContentInput | null {
  if (
    input.eventType !== CommunicationEventType.MESSAGE_RECEIVED
    && input.eventType !== CommunicationEventType.MESSAGE_SENT
  ) {
    return null;
  }

  const direction =
    input.message.direction === 'incoming'
      ? CommunicationDirection.INBOUND
      : CommunicationDirection.OUTBOUND;

  return {
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    communicationEventId: input.communicationEventId,
    channel: 'SMS',
    direction,
    eventType: input.eventType,
    contentType: CommunicationMessageContentType.TEXT,
    text: input.message.content,
    nativeMessageId: input.message.id,
    providerMessageId: input.message.providerMessageId,
    providerIdentity: CommunicationProviderIdentity.SENT_DM,
    occurredAt: input.occurredAt,
    hasAttachments: false,
    attachmentCount: 0,
  };
}
