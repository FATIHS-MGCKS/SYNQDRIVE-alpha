import Stripe from 'stripe';
import { StripeModeMismatchError } from './stripe-connect.errors';

let connectStripeSingleton: Stripe | null = null;

export function getStripeConnectClient(secretKey?: string): Stripe | null {
  const key = secretKey?.trim();
  if (!key) return null;
  if (!connectStripeSingleton) {
    connectStripeSingleton = new Stripe(key, { typescript: true });
  }
  return connectStripeSingleton;
}

export function resetStripeConnectClientForTests(): void {
  connectStripeSingleton = null;
}

export function inferStripeLiveMode(secretKey: string): boolean {
  return secretKey.trim().startsWith('sk_live_');
}

export function assertConnectTestModeOnly(secretKey: string): void {
  if (inferStripeLiveMode(secretKey)) {
    throw new StripeModeMismatchError();
  }
}
