import { createHmac } from 'crypto';
import {
  computeSentDmWebhookSignature,
  verifySentDmWebhookSignature,
} from './sentdm-webhook-verification';

describe('sentdm webhook verification', () => {
  const signingSecret = 'whsec_' + Buffer.from('test-secret-key-bytes!!').toString('base64');

  it('accepts valid signature', () => {
    const rawBody = Buffer.from(JSON.stringify({ field: 'message', event: 'message.delivered' }));
    const webhookId = '550e8400-e29b-41d4-a716-446655440000';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature =
      computeSentDmWebhookSignature({ rawBody, webhookId, timestamp, signingSecret })!;

    expect(
      verifySentDmWebhookSignature({
        rawBody,
        webhookId,
        timestamp,
        signatureHeader: signature,
        signingSecret,
      }),
    ).toBe(true);
  });

  it('rejects tampered body', () => {
    const rawBody = Buffer.from('{"field":"message"}');
    const webhookId = '550e8400-e29b-41d4-a716-446655440000';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature =
      computeSentDmWebhookSignature({ rawBody, webhookId, timestamp, signingSecret })!;

    expect(
      verifySentDmWebhookSignature({
        rawBody: Buffer.from('{"field":"tampered"}'),
        webhookId,
        timestamp,
        signatureHeader: signature,
        signingSecret,
      }),
    ).toBe(false);
  });

  it('rejects stale timestamp', () => {
    const rawBody = Buffer.from('{}');
    const webhookId = 'id';
    const timestamp = String(Math.floor(Date.now() / 1000) - 400);
    const keyBytes = Buffer.from('test-secret-key-bytes!!');
    const signedContent = `${webhookId}.${timestamp}.${rawBody.toString('utf8')}`;
    const digest = createHmac('sha256', keyBytes).update(signedContent).digest('base64');

    expect(
      verifySentDmWebhookSignature({
        rawBody,
        webhookId,
        timestamp,
        signatureHeader: `v1,${digest}`,
        signingSecret,
      }),
    ).toBe(false);
  });
});
