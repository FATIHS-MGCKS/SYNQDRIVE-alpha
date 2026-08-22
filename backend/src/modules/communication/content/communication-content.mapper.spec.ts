import { CommunicationMessageContentType } from '@prisma/client';
import {
  buildMessagePreview,
  mapWhatsAppMessageType,
  normalizeCanonicalText,
} from './communication-content.mapper';
import { CANONICAL_MESSAGE_TEXT_MAX_LENGTH } from './communication-content.constants';

describe('communication-content.mapper', () => {
  it('maps WhatsApp text message type', () => {
    expect(mapWhatsAppMessageType('text')).toBe(CommunicationMessageContentType.TEXT);
    expect(mapWhatsAppMessageType('image')).toBe(CommunicationMessageContentType.IMAGE);
    expect(mapWhatsAppMessageType('sticker')).toBe(CommunicationMessageContentType.IMAGE);
    expect(mapWhatsAppMessageType('reaction')).toBe(CommunicationMessageContentType.UNSUPPORTED);
  });

  it('truncates oversized text with flag', () => {
    const long = 'a'.repeat(CANONICAL_MESSAGE_TEXT_MAX_LENGTH + 10);
    const result = normalizeCanonicalText(long);
    expect(result.text).toHaveLength(CANONICAL_MESSAGE_TEXT_MAX_LENGTH);
    expect(result.truncated).toBe(true);
  });

  it('builds semantic preview for media-only messages', () => {
    expect(buildMessagePreview(CommunicationMessageContentType.IMAGE, null)).toBe('[image]');
    expect(buildMessagePreview(CommunicationMessageContentType.TEXT, 'Hello world')).toBe('Hello world');
  });
});
