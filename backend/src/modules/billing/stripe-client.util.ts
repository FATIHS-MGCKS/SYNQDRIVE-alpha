import Stripe from 'stripe';
import {
  resolveStripeEnvironment,
  validateStripeEnvironmentOrThrow,
} from '@shared/stripe/stripe-environment.util';

let stripeSingleton: Stripe | null = null;

export function getStripeClient(secretKey?: string): Stripe | null {
  const key = secretKey?.trim() || process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;

  validateStripeEnvironmentOrThrow(resolveStripeEnvironment({ secretKey: key }));

  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key, { typescript: true });
  }
  return stripeSingleton;
}

export function resetStripeClientForTests(): void {
  stripeSingleton = null;
}
