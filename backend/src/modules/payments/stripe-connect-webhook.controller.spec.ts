import { GUARDS_METADATA } from '@nestjs/common/constants';
import { StripeConnectWebhookController } from './stripe-connect-webhook.controller';

describe('StripeConnectWebhookController', () => {
  it('uses dedicated stripe-connect webhook route', () => {
    const path = Reflect.getMetadata('path', StripeConnectWebhookController);
    expect(path).toBe('webhooks/stripe-connect');
  });

  it('does not apply JWT guards', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, StripeConnectWebhookController) ?? [];
    expect(guards).toEqual([]);
  });
});
