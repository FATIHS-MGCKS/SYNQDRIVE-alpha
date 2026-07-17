import { validateTwilioWebhookSignature, buildTwilioWebhookUrl } from './twilio-signature.util';

describe('twilio-signature.util', () => {
  it('builds webhook URLs from base + path', () => {
    expect(
      buildTwilioWebhookUrl('https://app.synqdrive.eu', '/api/v1/webhooks/twilio/voice'),
    ).toBe('https://app.synqdrive.eu/api/v1/webhooks/twilio/voice');
  });

  it('rejects missing signature', () => {
    expect(
      validateTwilioWebhookSignature({
        authToken: 'test-token',
        signature: undefined,
        url: 'https://example.com/webhook',
        body: { CallSid: 'CA123' },
      }),
    ).toBe(false);
  });
});
