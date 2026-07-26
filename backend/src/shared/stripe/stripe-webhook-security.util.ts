import { createHash } from 'crypto';
import {
  StripeConnectWebhookProcessingStatus,
  StripeWebhookEventStatus,
} from '@prisma/client';
import Stripe from 'stripe';

export const DEFAULT_STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300;

export const STRIPE_WEBHOOK_SECURITY_ERROR = {
  MISSING_SIGNATURE: 'STRIPE_WEBHOOK_MISSING_SIGNATURE',
  MISSING_SECRET: 'STRIPE_WEBHOOK_MISSING_SECRET',
  SIGNATURE_INVALID: 'STRIPE_WEBHOOK_SIGNATURE_INVALID',
  PAYLOAD_HASH_MISMATCH: 'STRIPE_WEBHOOK_PAYLOAD_HASH_MISMATCH',
  MISSING_RAW_BODY: 'STRIPE_WEBHOOK_MISSING_RAW_BODY',
} as const;

export type StripeWebhookSecurityErrorCode =
  (typeof STRIPE_WEBHOOK_SECURITY_ERROR)[keyof typeof STRIPE_WEBHOOK_SECURITY_ERROR];

export type StripeWebhookIngestAction =
  | 'create'
  | 'skip_terminal'
  | 'retry'
  | 'payload_conflict';

export class StripeWebhookSecurityError extends Error {
  readonly code: StripeWebhookSecurityErrorCode;

  constructor(code: StripeWebhookSecurityErrorCode, message: string) {
    super(message);
    this.name = 'StripeWebhookSecurityError';
    this.code = code;
  }
}

export function hashStripeWebhookPayload(rawBody: Buffer): string {
  return createHash('sha256').update(rawBody).digest('hex');
}

export function constructVerifiedStripeEvent(
  stripe: Stripe,
  rawBody: Buffer,
  signature: string,
  webhookSecret: string,
  toleranceSeconds: number = DEFAULT_STRIPE_WEBHOOK_TOLERANCE_SECONDS,
): Stripe.Event {
  return stripe.webhooks.constructEvent(
    rawBody,
    signature,
    webhookSecret,
    toleranceSeconds,
  );
}

export function isTerminalBillingWebhookStatus(status: StripeWebhookEventStatus): boolean {
  return (
    status === StripeWebhookEventStatus.PROCESSED ||
    status === StripeWebhookEventStatus.IGNORED ||
    status === StripeWebhookEventStatus.UNRESOLVED_MAPPING
  );
}

export function isTerminalConnectWebhookStatus(
  status: StripeConnectWebhookProcessingStatus,
): boolean {
  return (
    status === StripeConnectWebhookProcessingStatus.PROCESSED ||
    status === StripeConnectWebhookProcessingStatus.IGNORED ||
    status === StripeConnectWebhookProcessingStatus.UNRESOLVED_ACCOUNT
  );
}

export function assertWebhookPayloadHashMatches(
  existingHash: string | null | undefined,
  incomingHash: string,
  stripeEventId: string,
): void {
  if (existingHash && existingHash !== incomingHash) {
    throw new StripeWebhookSecurityError(
      STRIPE_WEBHOOK_SECURITY_ERROR.PAYLOAD_HASH_MISMATCH,
      `Stripe webhook payload hash mismatch for ${stripeEventId}`,
    );
  }
}

export function resolveBillingWebhookIngestAction(params: {
  existing: {
    status: StripeWebhookEventStatus;
    payloadHash: string | null;
  } | null;
  payloadHash: string;
}): StripeWebhookIngestAction {
  if (!params.existing) {
    return 'create';
  }

  if (
    params.existing.payloadHash &&
    params.existing.payloadHash !== params.payloadHash
  ) {
    return 'payload_conflict';
  }

  if (isTerminalBillingWebhookStatus(params.existing.status)) {
    return 'skip_terminal';
  }

  return 'retry';
}

export function resolveConnectWebhookIngestAction(params: {
  existing: {
    processingStatus: StripeConnectWebhookProcessingStatus;
    payloadHash: string | null;
  } | null;
  payloadHash: string;
}): StripeWebhookIngestAction {
  if (!params.existing) {
    return 'create';
  }

  if (
    params.existing.payloadHash &&
    params.existing.payloadHash !== params.payloadHash
  ) {
    return 'payload_conflict';
  }

  if (isTerminalConnectWebhookStatus(params.existing.processingStatus)) {
    return 'skip_terminal';
  }

  return 'retry';
}

export function formatStripeWebhookLog(
  code: string,
  fields: Record<string, string | number | boolean | null | undefined>,
): string {
  const parts = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${value}`);
  return `STRIPE_WEBHOOK ${code}${parts.length ? ` ${parts.join(' ')}` : ''}`;
}
