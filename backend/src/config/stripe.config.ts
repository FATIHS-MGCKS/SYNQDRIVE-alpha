import { registerAs } from '@nestjs/config';

export default registerAs('stripe', () => {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() || '';
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || '';
  const currency = (process.env.STRIPE_CURRENCY || 'eur').toLowerCase();
  const defaultPriceId = process.env.STRIPE_DEFAULT_PRICE_ID?.trim() || '';
  const portalReturnUrl =
    process.env.STRIPE_CUSTOMER_PORTAL_RETURN_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    '';

  return {
    secretKey,
    webhookSecret,
    currency,
    defaultPriceId,
    portalReturnUrl,
    configured: Boolean(secretKey),
    webhookConfigured: Boolean(webhookSecret),
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
  };
});
