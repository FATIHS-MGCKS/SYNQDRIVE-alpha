import { CommunicationMessageContentType } from '@prisma/client';
import {
  buildMessagePreview,
  buildMessagePreviewToken,
  mapWhatsAppMessageType,
} from './communication-content.mapper';
import {
  extractSafeUserVisibleText,
  normalizeCanonicalText,
  truncateToCodePoints,
} from './communication-content-text.util';
import { CANONICAL_MESSAGE_TEXT_MAX_LENGTH } from './communication-content.constants';

describe('communication-content.mapper', () => {
  it('maps WhatsApp text message type', () => {
    expect(mapWhatsAppMessageType('text')).toBe(CommunicationMessageContentType.TEXT);
    expect(mapWhatsAppMessageType('image')).toBe(CommunicationMessageContentType.IMAGE);
    expect(mapWhatsAppMessageType('reaction')).toBe(CommunicationMessageContentType.UNSUPPORTED);
  });

  it('builds machine preview tokens for media', () => {
    expect(buildMessagePreview(CommunicationMessageContentType.IMAGE, null)).toBe('cc:IMAGE');
    expect(buildMessagePreviewToken(CommunicationMessageContentType.DOCUMENT)).toBe('cc:DOCUMENT');
    expect(buildMessagePreview(CommunicationMessageContentType.TEXT, 'Hello world')).toBe('Hello world');
  });

  it('rejects provider URLs in media content', () => {
    const unsafe = 'https://provider.example/signed?token=secret';
    expect(extractSafeUserVisibleText('image', unsafe)).toBeNull();
    expect(extractSafeUserVisibleText('text', unsafe)).toBeNull();
  });
});

describe('communication-content-text.util', () => {
  it('truncates by Unicode code point without splitting emoji', () => {
    const emoji = '😀';
    const text = `${'a'.repeat(CANONICAL_MESSAGE_TEXT_MAX_LENGTH)}${emoji}`;
    const result = normalizeCanonicalText(text);
    expect(result.truncated).toBe(true);
    expect([...result.text!].length).toBe(CANONICAL_MESSAGE_TEXT_MAX_LENGTH);
    expect(result.text!.endsWith('😀')).toBe(false);
    expect(result.text!.endsWith('a')).toBe(true);
  });

  it('preserves emoji when under limit', () => {
    const emoji = '😀';
    const text = `hello ${emoji}`;
    const result = normalizeCanonicalText(text);
    expect(result.truncated).toBe(false);
    expect(result.text).toContain('😀');
  });

  it('truncates preview by code points', () => {
    const long = 'x'.repeat(200);
    const { text } = truncateToCodePoints(long, 10);
    expect([...text].length).toBe(10);
  });
});
