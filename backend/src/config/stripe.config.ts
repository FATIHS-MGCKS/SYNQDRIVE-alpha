import { registerAs } from '@nestjs/config';
import {
  resolveStripeEnvironment,
  validateStripeEnvironmentOrThrow,
} from '@shared/stripe/stripe-environment.util';

export default registerAs('stripe', () => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() || '';
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || '';
  const connectWebhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim() || '';
  const currency = (process.env.STRIPE_CURRENCY || 'eur').toLowerCase();
  const defaultPriceId = process.env.STRIPE_DEFAULT_PRICE_ID?.trim() || '';
  const portalReturnUrl =
    process.env.STRIPE_CUSTOMER_PORTAL_RETURN_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    '';

  const environment = resolveStripeEnvironment({
    nodeEnv,
    secretKey,
    explicitEnvironment: process.env.STRIPE_ENVIRONMENT,
    allowTestInProduction:
      process.env.STRIPE_ALLOW_TEST_IN_PRODUCTION?.trim().toLowerCase() === 'true',
  });

  if (secretKey) {
    validateStripeEnvironmentOrThrow(environment);
  }

  return {
    secretKey,
    webhookSecret,
    connectWebhookSecret,
    currency,
    defaultPriceId,
    portalReturnUrl,
    configured: Boolean(secretKey),
    webhookConfigured: Boolean(webhookSecret),
    connectWebhookConfigured: Boolean(connectWebhookSecret),
    environment: environment.explicitEnvironment ?? environment.runtimeEnvironment,
    explicitEnvironmentSetting: process.env.STRIPE_ENVIRONMENT?.trim() || null,
    runtimeEnvironment: environment.runtimeEnvironment,
    billingStripeMode: environment.billingStripeMode,
    allowTestInProduction: environment.allowTestInProduction,
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
