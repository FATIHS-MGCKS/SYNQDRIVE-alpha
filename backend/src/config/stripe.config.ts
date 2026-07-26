import { registerAs } from '@nestjs/config';
import { DEFAULT_STRIPE_WEBHOOK_TOLERANCE_SECONDS } from '@shared/stripe/stripe-webhook-security.util';

export default registerAs('stripe', () => {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() || '';
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || '';
  const connectWebhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim() || '';
  const currency = (process.env.STRIPE_CURRENCY || 'eur').toLowerCase();
  const defaultPriceId = process.env.STRIPE_DEFAULT_PRICE_ID?.trim() || '';
  const portalReturnUrl =
    process.env.STRIPE_CUSTOMER_PORTAL_RETURN_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    '';
  const webhookToleranceSeconds = Number.parseInt(
    process.env.STRIPE_WEBHOOK_TOLERANCE_SECONDS?.trim() ?? '',
    10,
  );

  return {
    secretKey,
    webhookSecret,
    connectWebhookSecret,
    currency,
    defaultPriceId,
    portalReturnUrl,
    webhookToleranceSeconds: Number.isFinite(webhookToleranceSeconds)
      ? webhookToleranceSeconds
      : DEFAULT_STRIPE_WEBHOOK_TOLERANCE_SECONDS,
    configured: Boolean(secretKey),
    webhookConfigured: Boolean(webhookSecret),
    connectWebhookConfigured: Boolean(connectWebhookSecret),
    connectAccountGeneration: (
      process.env.STRIPE_CONNECT_ACCOUNT_GENERATION?.trim() || 'V1'
    ).toUpperCase(),
    connectReturnUrl:
      process.env.STRIPE_CONNECT_RETURN_URL?.trim() ||
      process.env.APP_URL?.trim() ||
      portalReturnUrl,
    connectRefreshUrl:
      process.env.STRIPE_CONNECT_REFRESH_URL?.trim() ||
      process.env.APP_URL?.trim() ||
      portalReturnUrl,
    checkoutSuccessUrl:
      process.env.STRIPE_CHECKOUT_SUCCESS_URL?.trim() ||
      process.env.APP_URL?.trim() ||
      portalReturnUrl,
    checkoutCancelUrl:
      process.env.STRIPE_CHECKOUT_CANCEL_URL?.trim() ||
      process.env.APP_URL?.trim() ||
      portalReturnUrl,
  };
});
