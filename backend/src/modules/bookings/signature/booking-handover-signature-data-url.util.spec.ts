import { BadRequestException } from '@nestjs/common';
import {
  parseAndValidateSignatureDataUrl,
  signatureDataUrlPresent,
} from './booking-handover-signature-data-url.util';

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('booking-handover-signature-data-url.util', () => {
  it('parses valid png data URL', () => {
    const parsed = parseAndValidateSignatureDataUrl(TINY_PNG);
    expect(parsed.mimeType).toBe('image/png');
    expect(parsed.sizeBytes).toBeGreaterThan(0);
  });

  it('rejects unsupported mime types', () => {
    expect(() =>
      parseAndValidateSignatureDataUrl('data:image/gif;base64,abc'),
    ).toThrow(BadRequestException);
  });

  it('rejects oversized payloads', () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(700_000);
    expect(() => parseAndValidateSignatureDataUrl(huge)).toThrow(BadRequestException);
  });

  it('detects present signature data URLs', () => {
    expect(signatureDataUrlPresent(TINY_PNG)).toBe(true);
    expect(signatureDataUrlPresent('')).toBe(false);
    expect(signatureDataUrlPresent(null)).toBe(false);
  });
});
