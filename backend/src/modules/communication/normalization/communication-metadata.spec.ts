import { sanitizeCanonicalMetadata } from './communication-metadata';
import { CommunicationNormalizationErrorCode } from './communication-normalization.errors';

describe('sanitizeCanonicalMetadata', () => {
  it('retains allowed operational metadata', () => {
    const result = sanitizeCanonicalMetadata({
      durationSeconds: 42,
      intentCode: 'BOOKING_STATUS',
      toolName: 'lookup_booking',
    });
    expect(result).toEqual({
      durationSeconds: 42,
      intentCode: 'BOOKING_STATUS',
      toolName: 'lookup_booking',
    });
  });

  it('rejects raw payload/content fields', () => {
    try {
      sanitizeCanonicalMetadata({ transcript: 'hello there' });
      fail('expected rejection');
    } catch (error: any) {
      expect(error.code).toBe(CommunicationNormalizationErrorCode.INVALID_NORMALIZED_INPUT);
    }
  });

  it('rejects message body fields', () => {
    expect(() => sanitizeCanonicalMetadata({ messageBody: 'secret' })).toThrow(/not permitted/);
  });
});
