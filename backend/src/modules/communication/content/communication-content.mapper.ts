import {
  CommunicationDirection,
  CommunicationEventType,
  CommunicationMessageContentType,
  CommunicationProviderIdentity,
} from '@prisma/client';
import type { SmsMessage, WhatsAppMessage } from '@prisma/client';
import {
  extractSafeUserVisibleText,
  normalizeCanonicalText,
  truncatePreviewText,
} from './communication-content-text.util';
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

/** Machine preview token — frontend maps to localized UI. */
export function buildMessagePreviewToken(
  contentType: CommunicationMessageContentType,
): string | null {
  switch (contentType) {
    case CommunicationMessageContentType.IMAGE:
      return 'cc:IMAGE';
    case CommunicationMessageContentType.VIDEO:
      return 'cc:VIDEO';
    case CommunicationMessageContentType.AUDIO:
      return 'cc:AUDIO';
    case CommunicationMessageContentType.DOCUMENT:
      return 'cc:DOCUMENT';
    case CommunicationMessageContentType.LOCATION:
      return 'cc:LOCATION';
    case CommunicationMessageContentType.CONTACT:
      return 'cc:CONTACT';
    case CommunicationMessageContentType.MIXED:
      return 'cc:MIXED';
    case CommunicationMessageContentType.UNSUPPORTED:
      return 'cc:UNSUPPORTED';
    default:
      return null;
  }
}

export function buildMessagePreview(
  contentType: CommunicationMessageContentType,
  text: string | null | undefined,
): string | null {
  if (text?.trim()) {
    return truncatePreviewText(text);
  }
  return buildMessagePreviewToken(contentType);
}

export { normalizeCanonicalText } from './communication-content-text.util';

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

  const safeText = extractSafeUserVisibleText(
    input.message.messageType,
    input.message.content,
  );

  return {
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    communicationEventId: input.communicationEventId,
    channel: 'WHATSAPP',
    direction,
    eventType: input.eventType,
    contentType,
    text: safeText,
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
