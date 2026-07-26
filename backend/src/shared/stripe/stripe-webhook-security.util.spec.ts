import {
  StripeConnectWebhookProcessingStatus,
  StripeWebhookEventStatus,
} from '@prisma/client';
import {
  assertWebhookPayloadHashMatches,
  hashStripeWebhookPayload,
  isTerminalBillingWebhookStatus,
  isTerminalConnectWebhookStatus,
  resolveBillingWebhookIngestAction,
  resolveConnectWebhookIngestAction,
  StripeWebhookSecurityError,
  STRIPE_WEBHOOK_SECURITY_ERROR,
} from './stripe-webhook-security.util';

describe('stripe-webhook-security.util', () => {
  it('hashes payload deterministically', () => {
    const body = Buffer.from('{"id":"evt_1"}');
    expect(hashStripeWebhookPayload(body)).toHaveLength(64);
    expect(hashStripeWebhookPayload(body)).toBe(hashStripeWebhookPayload(body));
  });

  it('treats billing terminal statuses as non-retryable', () => {
    expect(isTerminalBillingWebhookStatus(StripeWebhookEventStatus.PROCESSED)).toBe(true);
    expect(isTerminalBillingWebhookStatus(StripeWebhookEventStatus.IGNORED)).toBe(true);
    expect(isTerminalBillingWebhookStatus(StripeWebhookEventStatus.UNRESOLVED_MAPPING)).toBe(
      true,
    );
    expect(isTerminalBillingWebhookStatus(StripeWebhookEventStatus.FAILED)).toBe(false);
  });

  it('treats connect terminal statuses as non-retryable', () => {
    expect(isTerminalConnectWebhookStatus(StripeConnectWebhookProcessingStatus.PROCESSED)).toBe(
      true,
    );
    expect(isTerminalConnectWebhookStatus(StripeConnectWebhookProcessingStatus.IGNORED)).toBe(
      true,
    );
    expect(
      isTerminalConnectWebhookStatus(StripeConnectWebhookProcessingStatus.UNRESOLVED_ACCOUNT),
    ).toBe(true);
    expect(isTerminalConnectWebhookStatus(StripeConnectWebhookProcessingStatus.FAILED)).toBe(
      false,
    );
  });

  it('skips terminal billing events and retries failed ones', () => {
    expect(
      resolveBillingWebhookIngestAction({
        existing: {
          status: StripeWebhookEventStatus.PROCESSED,
          payloadHash: 'abc',
        },
        payloadHash: 'abc',
      }),
    ).toBe('skip_terminal');

    expect(
      resolveBillingWebhookIngestAction({
        existing: {
          status: StripeWebhookEventStatus.FAILED,
          payloadHash: 'abc',
        },
        payloadHash: 'abc',
      }),
    ).toBe('retry');
  });

  it('retries failed connect events but skips processed', () => {
    expect(
      resolveConnectWebhookIngestAction({
        existing: {
          processingStatus: StripeConnectWebhookProcessingStatus.PROCESSED,
          payloadHash: 'abc',
        },
        payloadHash: 'abc',
      }),
    ).toBe('skip_terminal');

    expect(
      resolveConnectWebhookIngestAction({
        existing: {
          processingStatus: StripeConnectWebhookProcessingStatus.FAILED,
          payloadHash: 'abc',
        },
        payloadHash: 'abc',
      }),
    ).toBe('retry');
  });

  it('detects payload hash conflicts', () => {
    expect(
      resolveBillingWebhookIngestAction({
        existing: {
          status: StripeWebhookEventStatus.FAILED,
          payloadHash: 'old',
        },
        payloadHash: 'new',
      }),
    ).toBe('payload_conflict');

    expect(() =>
      assertWebhookPayloadHashMatches('old', 'new', 'evt_1'),
    ).toThrow(StripeWebhookSecurityError);

    try {
      assertWebhookPayloadHashMatches('old', 'new', 'evt_1');
    } catch (error) {
      expect((error as StripeWebhookSecurityError).code).toBe(
        STRIPE_WEBHOOK_SECURITY_ERROR.PAYLOAD_HASH_MISMATCH,
      );
    }
  });
});
