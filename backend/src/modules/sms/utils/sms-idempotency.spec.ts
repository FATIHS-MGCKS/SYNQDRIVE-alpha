import { detectSmsIdempotencyPayloadMismatch } from './sms-idempotency';

describe('sms-idempotency', () => {
  const base = {
    existing: {
      id: 'msg-1',
      content: 'hello',
      conversation: { contactPhoneNormalized: '491701111111' },
    },
  } as const;

  it('accepts matching recipient and content', () => {
    expect(
      detectSmsIdempotencyPayloadMismatch({
        ...base,
        recipientNormalized: '491701111111',
        content: 'hello',
      }),
    ).toBeNull();
  });

  it('detects recipient mismatch', () => {
    expect(
      detectSmsIdempotencyPayloadMismatch({
        ...base,
        recipientNormalized: '491702222222',
        content: 'hello',
      }),
    ).toBe('recipient');
  });

  it('detects content mismatch', () => {
    expect(
      detectSmsIdempotencyPayloadMismatch({
        ...base,
        recipientNormalized: '491701111111',
        content: 'other',
      }),
    ).toBe('content');
  });
});
