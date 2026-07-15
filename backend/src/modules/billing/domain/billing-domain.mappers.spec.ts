import { BillingInterval, BillingStatus, BillingTierMode, InvoiceStatus, ProductSlug } from '@prisma/client';
import {
  BillingAddonKey,
  BillingIntervalKind,
  BillingProductKind,
  DiscountKind,
  InvoiceDisplayStatus,
  InvoiceStatusDomain,
  PaymentStatusDomain,
  PricingModel,
  StripeMode,
  SubscriptionStatus,
  SyncStatus,
  BILLING_ADDON_KEYS,
  BILLING_INTERVAL_KINDS,
  BILLING_PRODUCT_KINDS,
  DISCOUNT_KINDS,
  INVOICE_STATUS_DOMAIN_VALUES,
  PAYMENT_STATUS_DOMAIN_VALUES,
  PRICING_MODELS,
  STRIPE_MODES,
  SUBSCRIPTION_STATUSES,
  SYNC_STATUSES,
} from './billing-domain.types';
import {
  mapBillingIntervalDomainToPrisma,
  mapIntegrationStringToSyncStatus,
  mapInvoiceDomainToDisplayStatus,
  mapPrismaBillingIntervalToDomain,
  mapPrismaInvoiceToDisplayStatus,
  mapPrismaTierModeToPricingModel,
  mapProductSlugToBillingProductKind,
  mapStripeLivemodeToDomain,
  isDiscountKind,
} from './mappers/billing-legacy.mappers';
import {
  mapStripeInvoiceToDomainStatus,
  mapStripeInvoiceStatus,
  mapPrismaInvoiceStatusToDomain,
} from './mappers/stripe-invoice-status.mapper';
import {
  mapStripeChargeToDomainStatus,
  mapStripePaymentIntentToDomainStatus,
} from './mappers/stripe-payment-status.mapper';
import {
  mapPrismaBillingStatusToDomain,
  mapStripeSubscriptionStatus,
  mapStripeSubscriptionToDomainStatus,
  mapSubscriptionDomainToPrismaBillingStatus,
} from './mappers/stripe-subscription-status.mapper';

describe('billing domain enums', () => {
  it('covers all canonical product kinds', () => {
    expect(BILLING_PRODUCT_KINDS).toEqual(['RENTAL', 'FLEET', 'ADDON']);
  });

  it('covers prepared addon keys', () => {
    expect(BILLING_ADDON_KEYS).toEqual(['VOICE_AGENT', 'AI_PACKAGE', 'WHATSAPP']);
  });

  it('covers subscription statuses', () => {
    expect(SUBSCRIPTION_STATUSES).toHaveLength(8);
    expect(SUBSCRIPTION_STATUSES).toContain(SubscriptionStatus.CANCEL_SCHEDULED);
  });

  it('covers billing intervals', () => {
    expect(BILLING_INTERVAL_KINDS).toEqual(['MONTH', 'YEAR']);
  });

  it('covers pricing models', () => {
    expect(PRICING_MODELS).toEqual(['VOLUME', 'GRADUATED', 'FLAT', 'USAGE_BASED']);
  });

  it('covers discount kinds', () => {
    expect(DISCOUNT_KINDS).toEqual(['PERCENTAGE', 'FIXED_AMOUNT']);
    expect(isDiscountKind('PERCENTAGE')).toBe(true);
    expect(isDiscountKind('INVALID')).toBe(false);
  });

  it('covers invoice domain statuses', () => {
    expect(INVOICE_STATUS_DOMAIN_VALUES).toEqual([
      'DRAFT',
      'OPEN',
      'PAID',
      'VOID',
      'UNCOLLECTIBLE',
    ]);
  });

  it('covers payment domain statuses', () => {
    expect(PAYMENT_STATUS_DOMAIN_VALUES).toContain(PaymentStatusDomain.PARTIALLY_REFUNDED);
  });

  it('covers stripe modes', () => {
    expect(STRIPE_MODES).toEqual(['TEST', 'LIVE']);
  });

  it('covers sync statuses', () => {
    expect(SYNC_STATUSES).toEqual(['PENDING', 'SYNCED', 'FAILED', 'DRIFTED']);
  });
});

describe('stripe subscription status mapper', () => {
  it('maps known Stripe subscription statuses to domain', () => {
    expect(mapStripeSubscriptionToDomainStatus('active')).toBe(SubscriptionStatus.ACTIVE);
    expect(mapStripeSubscriptionToDomainStatus('trialing')).toBe(SubscriptionStatus.TRIALING);
    expect(mapStripeSubscriptionToDomainStatus('past_due')).toBe(SubscriptionStatus.PAST_DUE);
    expect(mapStripeSubscriptionToDomainStatus('canceled')).toBe(SubscriptionStatus.CANCELLED);
    expect(mapStripeSubscriptionToDomainStatus('incomplete')).toBe(SubscriptionStatus.INCOMPLETE);
    expect(mapStripeSubscriptionToDomainStatus('paused')).toBe(SubscriptionStatus.PAUSED);
  });

  it('maps cancel_at_period_end to CANCEL_SCHEDULED', () => {
    expect(
      mapStripeSubscriptionToDomainStatus('active', { cancelAtPeriodEnd: true }),
    ).toBe(SubscriptionStatus.CANCEL_SCHEDULED);
  });

  it('maps unknown Stripe subscription status to INCOMPLETE without throwing', () => {
    expect(mapStripeSubscriptionToDomainStatus('brand_new_status')).toBe(
      SubscriptionStatus.INCOMPLETE,
    );
  });

  it('maps domain status to legacy Prisma BillingStatus', () => {
    expect(mapSubscriptionDomainToPrismaBillingStatus(SubscriptionStatus.PAUSED)).toBe(
      BillingStatus.ACTIVE,
    );
    expect(mapSubscriptionDomainToPrismaBillingStatus(SubscriptionStatus.PAST_DUE)).toBe(
      BillingStatus.PAST_DUE,
    );
  });

  it('maps legacy Prisma status back to domain', () => {
    expect(
      mapPrismaBillingStatusToDomain(BillingStatus.ACTIVE, { cancelAtPeriodEnd: true }),
    ).toBe(SubscriptionStatus.CANCEL_SCHEDULED);
  });

  it('mapStripeSubscriptionStatus returns domain and legacy fields', () => {
    const mapped = mapStripeSubscriptionStatus('past_due');
    expect(mapped.domainStatus).toBe(SubscriptionStatus.PAST_DUE);
    expect(mapped.billingStatus).toBe(BillingStatus.PAST_DUE);
    expect(mapped.attentionRequired).toBe(true);
  });
});

describe('stripe invoice status mapper', () => {
  it('maps Stripe invoice statuses to domain', () => {
    expect(mapStripeInvoiceToDomainStatus('paid')).toBe(InvoiceStatusDomain.PAID);
    expect(mapStripeInvoiceToDomainStatus('void')).toBe(InvoiceStatusDomain.VOID);
    expect(mapStripeInvoiceToDomainStatus('open')).toBe(InvoiceStatusDomain.OPEN);
  });

  it('maps unknown Stripe invoice status to DRAFT without throwing', () => {
    expect(mapStripeInvoiceToDomainStatus('mystery')).toBe(InvoiceStatusDomain.DRAFT);
  });

  it('legacy mapStripeInvoiceStatus returns Prisma enum', () => {
    expect(mapStripeInvoiceStatus('void')).toBe(InvoiceStatus.VOID);
  });

  it('round-trips prisma invoice status through domain', () => {
    for (const status of Object.values(InvoiceStatus)) {
      expect(mapPrismaInvoiceStatusToDomain(status)).toBeTruthy();
    }
  });

  it('VOID domain status never maps to PAID display', () => {
    const display = mapInvoiceDomainToDisplayStatus(InvoiceStatusDomain.VOID);
    expect(display).toBe(InvoiceDisplayStatus.VOID);
    expect(display).not.toBe(InvoiceDisplayStatus.PAID);
  });

  it('mapPrismaInvoiceToDisplayStatus maps VOID to Void not Paid', () => {
    expect(mapPrismaInvoiceToDisplayStatus(InvoiceStatus.VOID)).toBe(InvoiceDisplayStatus.VOID);
  });
});

describe('stripe payment status mapper', () => {
  it('maps payment_intent.succeeded to SUCCEEDED', () => {
    expect(mapStripePaymentIntentToDomainStatus('succeeded')).toBe(
      PaymentStatusDomain.SUCCEEDED,
    );
  });

  it('maps payment_intent.processing to PENDING', () => {
    expect(mapStripePaymentIntentToDomainStatus('processing')).toBe(
      PaymentStatusDomain.PENDING,
    );
  });

  it('maps failed payment intent to FAILED', () => {
    expect(mapStripePaymentIntentToDomainStatus('failed')).toBe(PaymentStatusDomain.FAILED);
  });

  it('maps unknown payment intent status to PENDING', () => {
    expect(mapStripePaymentIntentToDomainStatus('future_status')).toBe(
      PaymentStatusDomain.PENDING,
    );
  });

  it('maps full refund on charge', () => {
    expect(
      mapStripeChargeToDomainStatus('succeeded', {
        refunded: true,
        amountRefundedCents: 1000,
        amountCents: 1000,
      }),
    ).toBe(PaymentStatusDomain.REFUNDED);
  });

  it('maps partial refund on charge', () => {
    expect(
      mapStripeChargeToDomainStatus('succeeded', {
        refunded: true,
        amountRefundedCents: 400,
        amountCents: 1000,
      }),
    ).toBe(PaymentStatusDomain.PARTIALLY_REFUNDED);
  });
});

describe('billing legacy mappers', () => {
  it('maps product slugs to billing product kinds', () => {
    expect(mapProductSlugToBillingProductKind(ProductSlug.RENTAL)).toBe(
      BillingProductKind.RENTAL,
    );
    expect(mapProductSlugToBillingProductKind(ProductSlug.FLEET)).toBe(BillingProductKind.FLEET);
    expect(mapProductSlugToBillingProductKind(BillingAddonKey.VOICE_AGENT)).toBe(
      BillingProductKind.ADDON,
    );
  });

  it('maps prisma billing interval MONTHLY to MONTH domain', () => {
    expect(mapPrismaBillingIntervalToDomain(BillingInterval.MONTHLY)).toBe(
      BillingIntervalKind.MONTH,
    );
  });

  it('maps YEAR domain to legacy MONTHLY prisma until migration', () => {
    expect(mapBillingIntervalDomainToPrisma(BillingIntervalKind.YEAR)).toBe(
      BillingInterval.MONTHLY,
    );
  });

  it('maps tier mode to pricing model', () => {
    expect(mapPrismaTierModeToPricingModel(BillingTierMode.VOLUME)).toBe(PricingModel.VOLUME);
    expect(mapPrismaTierModeToPricingModel(BillingTierMode.GRADUATED)).toBe(
      PricingModel.GRADUATED,
    );
  });

  it('maps stripe livemode boolean to domain stripe mode', () => {
    expect(mapStripeLivemodeToDomain(true)).toBe(StripeMode.LIVE);
    expect(mapStripeLivemodeToDomain(false)).toBe(StripeMode.TEST);
  });

  it('maps integration strings to sync status', () => {
    expect(mapIntegrationStringToSyncStatus('SYNCED')).toBe(SyncStatus.SYNCED);
    expect(mapIntegrationStringToSyncStatus('NOT_CONNECTED')).toBe(SyncStatus.PENDING);
    expect(mapIntegrationStringToSyncStatus('weird')).toBe(SyncStatus.PENDING);
  });
});
