import {
  classifyBookingErrorCode,
  redactBookingLogString,
  redactBookingLogValue,
} from './booking-log-redaction.util';

describe('booking-log-redaction.util', () => {
  it('redacts emails, bearer tokens, stripe keys, signatures, and card numbers', () => {
    const input =
      'user ops@tenant.example failed Bearer sk_live_abc123xyz pk_test_def456 ' +
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg== ' +
      'card 4111 1111 1111 1111';

    const redacted = redactBookingLogString(input);

    expect(redacted).not.toContain('ops@tenant.example');
    expect(redacted).not.toContain('sk_live_abc123xyz');
    expect(redacted).not.toContain('pk_test_def456');
    expect(redacted).not.toContain('iVBORw0KGgo');
    expect(redacted).not.toContain('4111');
    expect(redacted).toContain('[redacted-email]');
    expect(redacted).toContain('[redacted-token]');
    expect(redacted).toContain('[redacted]:signature');
    expect(redacted).toContain('[redacted-card]');
  });

  it('redacts Error messages via redactBookingLogValue', () => {
    const err = new Error('notify ops@tenant.example with Bearer sk_live_secret');
    expect(redactBookingLogValue(err)).not.toContain('ops@tenant.example');
    expect(redactBookingLogValue(err)).toContain('[redacted-email]');
  });

  it('classifies structured error codes from exception objects', () => {
    expect(
      classifyBookingErrorCode({ code: 'VEHICLE_BOOKING_OVERLAP' }, 'UNKNOWN'),
    ).toBe('VEHICLE_BOOKING_OVERLAP');
    expect(
      classifyBookingErrorCode({ response: { code: 'TENANT_MISMATCH' } }, 'UNKNOWN'),
    ).toBe('TENANT_MISMATCH');
    expect(classifyBookingErrorCode(new Error('plain'), 'FALLBACK')).toBe('FALLBACK');
  });

  it('truncates overly long log strings', () => {
    const long = 'x'.repeat(600);
    expect(redactBookingLogString(long).length).toBeLessThanOrEqual(500);
  });
});
