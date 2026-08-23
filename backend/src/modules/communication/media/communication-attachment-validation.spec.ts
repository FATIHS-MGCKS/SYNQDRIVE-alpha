import { describe, expect, it } from '@jest/globals';
import {
  assertAttachmentSize,
  assertBufferMatchesMime,
  detectMediaKindFromMime,
  sanitizeAttachmentFileName,
} from './communication-attachment-validation';
import { CommunicationAttachmentError } from './communication-attachment.errors';

describe('communication-attachment-validation', () => {
  it('sanitizes malicious filename', () => {
    const sanitized = sanitizeAttachmentFileName('"><script>alert(1)</script>.pdf');
    expect(sanitized).not.toMatch(/[<>]/);
    expect(sanitized.endsWith('.pdf')).toBe(true);
  });

  it('rejects mime spoof for executable content', () => {
    const fakeJpeg = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
    expect(() => assertBufferMatchesMime(fakeJpeg, 'image/jpeg')).toThrow(
      CommunicationAttachmentError.mimeMismatch(),
    );
  });

  it('rejects zero-byte files', () => {
    expect(() => assertBufferMatchesMime(Buffer.alloc(0), 'image/jpeg')).toThrow(
      CommunicationAttachmentError.emptyFile(),
    );
  });

  it('detects image and document mimes', () => {
    expect(detectMediaKindFromMime('image/png')).toBe('IMAGE');
    expect(detectMediaKindFromMime('application/pdf')).toBe('DOCUMENT');
    expect(detectMediaKindFromMime('text/html')).toBeNull();
  });

  it('enforces size limits', () => {
    expect(() => assertAttachmentSize('IMAGE', 6 * 1024 * 1024)).toThrow();
    expect(() => assertAttachmentSize('DOCUMENT', 1024)).not.toThrow();
  });
});
