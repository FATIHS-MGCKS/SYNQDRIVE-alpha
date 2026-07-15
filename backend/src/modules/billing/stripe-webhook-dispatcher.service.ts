import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '@shared/database/prisma.service';
import { getStripeClient } from './stripe-client.util';
import { StripeBillingService } from './stripe-billing.service';
import { StripeInvoiceMirrorService } from './stripe-invoice-mirror.service';
import { StripeBillingAdapter } from './adapters/stripe-billing.adapter';
import { BillingEventPublisher } from './events/billing-event.publisher';
import { StripePaymentMethodService } from './stripe-payment-method.service';
import { StripePaymentLedgerService } from './stripe-payment-ledger.service';
import { BillingDomainEventOutboxService } from './billing-domain-event-outbox.service';
import { BillingDomainEventType } from './domain/billing-domain.events';
import {
  requiresOrganizationMapping,
  StripeWebhookDispatchResult,
} from './domain/stripe-webhook-matrix';
import { buildSafeStripeWebhookPayload } from './stripe-webhook.util';

export interface StripeWebhookDispatchContext {
  event: Stripe.Event;
  organizationId: string | null;
}

@Injectable()
export class StripeWebhookDispatcherService {
  private readonly logger = new Logger(StripeWebhookDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly stripeBilling: StripeBillingService,
    private readonly stripeAdapter: StripeBillingAdapter,
    private readonly invoiceMirror: StripeInvoiceMirrorService,
    private readonly billingEvents: BillingEventPublisher,
    private readonly paymentMethods: StripePaymentMethodService,
    private readonly paymentLedger: StripePaymentLedgerService,
    private readonly outbox: BillingDomainEventOutboxService,
  ) {}

  async dispatch(context: StripeWebhookDispatchContext): Promise<StripeWebhookDispatchResult> {
    const { event } = context;
    let organizationId = context.organizationId;

    if (!organizationId) {
      organizationId = await this.resolveOrganizationId(event);
    }

    if (!organizationId && requiresOrganizationMapping(event.type)) {
      await this.recordUnresolvedMapping(event);
      return {
        outcome: 'unresolved_mapping',
        organizationId: null,
        message: `No organization mapping for ${event.type}`,
      };
    }

    switch (event.type) {
      case 'customer.updated':
        await this.handleCustomerUpdated(event.data.object as Stripe.Customer, organizationId!);
        return { outcome: 'processed', organizationId };
      case 'payment_method.attached':
        await this.paymentMethods.syncPaymentMethods(organizationId!);
        return { outcome: 'processed', organizationId };
      case 'payment_method.detached':
        await this.paymentMethods.handlePaymentMethodDetached(
          event.data.object as Stripe.PaymentMethod,
        );
        return { outcome: 'processed', organizationId };
      case 'payment_method.updated':
      case 'payment_method.automatically_updated':
        await this.paymentMethods.handlePaymentMethodUpdated(
          event.data.object as Stripe.PaymentMethod,
        );
        return { outcome: 'processed', organizationId };
      case 'setup_intent.succeeded':
        await this.paymentMethods.handleSetupIntentSucceeded(
          event.data.object as Stripe.SetupIntent,
        );
        return { outcome: 'processed', organizationId };
      case 'setup_intent.setup_failed':
        await this.paymentMethods.handleSetupIntentFailed(event.data.object as Stripe.SetupIntent);
        return { outcome: 'processed', organizationId };
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        return this.handleSubscriptionEvent(
          event.data.object as Stripe.Subscription,
          organizationId!,
          event,
        );
      case 'invoice.created':
      case 'invoice.finalized':
      case 'invoice.paid':
      case 'invoice.payment_failed':
      case 'invoice.voided':
      case 'invoice.marked_uncollectible':
        return this.handleInvoiceEvent(event.data.object as Stripe.Invoice, organizationId!, event);
      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed':
        return this.handlePaymentIntentEvent(
          event.data.object as Stripe.PaymentIntent,
          organizationId!,
          event,
        );
      case 'charge.refunded':
        return this.handleChargeRefunded(event.data.object as Stripe.Charge, organizationId!, event);
      case 'credit_note.created':
        return this.handleCreditNoteEvent(
          event.data.object as Stripe.CreditNote,
          organizationId!,
          event,
        );
      case 'charge.dispute.created':
      case 'charge.dispute.closed':
        return this.handleDisputeEvent(event.data.object as Stripe.Dispute, organizationId!, event);
      default:
        return { outcome: 'ignored', organizationId };
    }
  }

  async resolveOrganizationId(event: Stripe.Event): Promise<string | null> {
    const object = event.data.object as unknown as Record<string, unknown>;
    const metadata =
      object && typeof object.metadata === 'object'
        ? (object.metadata as Stripe.Metadata)
        : undefined;
    const metadataOrgId = metadata?.organizationId?.trim();
    if (metadataOrgId) {
      return metadataOrgId;
    }

    const customerRef = object?.customer as string | Stripe.Customer | null | undefined;
    const customerId =
      typeof customerRef === 'string' ? customerRef : customerRef?.id ?? null;
    if (customerId) {
      const orgId = await this.stripeBilling.findOrganizationIdByStripeCustomer(customerId);
      if (orgId) return orgId;
    }

    const subscriptionRef = object?.subscription as string | Stripe.Subscription | null | undefined;
    const subscriptionId =
      typeof subscriptionRef === 'string' ? subscriptionRef : subscriptionRef?.id ?? null;
    if (subscriptionId) {
      return this.stripeBilling.findOrganizationIdByStripeSubscription(subscriptionId);
    }

    if (typeof object?.id === 'string' && object.object === 'subscription') {
      return this.stripeBilling.findOrganizationIdByStripeSubscription(object.id);
    }

    return null;
  }

  private async recordUnresolvedMapping(event: Stripe.Event): Promise<void> {
    const safePayload = buildSafeStripeWebhookPayload(event, null);
    this.logger.warn(
      `Stripe webhook ${event.id} (${event.type}) has no organization mapping`,
    );

    await this.prisma.$transaction(async (tx) => {
      await this.outbox.enqueue(tx, {
        eventType: BillingDomainEventType.WEBHOOK_UNRESOLVED,
        aggregateType: 'StripeWebhookEvent',
        aggregateId: event.id,
        idempotencyKey: `stripe-webhook:${event.id}:unresolved`,
        payload: safePayload as unknown as Record<string, unknown>,
      });
    });

    await this.billingEvents.publish({
      type: BillingDomainEventType.WEBHOOK_UNRESOLVED,
      organizationId: null,
      occurredAt: new Date(),
      payload: safePayload as unknown as Record<string, unknown>,
      correlationId: event.id,
    });
  }

  private async handleCustomerUpdated(customer: Stripe.Customer, organizationId: string) {
    await this.stripeBilling.syncPaymentMethods(organizationId);
  }

  private async handleSubscriptionEvent(
    subscription: Stripe.Subscription,
    organizationId: string,
    event: Stripe.Event,
  ): Promise<StripeWebhookDispatchResult> {
    await this.stripeAdapter.applyStripeSubscription(organizationId, subscription);
    await this.stripeAdapter.syncPaymentMethods(organizationId);

    await this.prisma.$transaction(async (tx) => {
      await this.outbox.enqueue(tx, {
        eventType: BillingDomainEventType.SUBSCRIPTION_SYNCED,
        aggregateType: 'BillingSubscription',
        aggregateId: subscription.id,
        idempotencyKey: `stripe-webhook:${event.id}:subscription:${subscription.id}`,
        payload: {
          organizationId,
          stripeSubscriptionId: subscription.id,
          stripeStatus: subscription.status,
        },
      });
    });

    await this.billingEvents.publishSubscriptionSynced(organizationId, {
      stripeSubscriptionId: subscription.id,
      stripeStatus: subscription.status,
      source: event.type,
    }, event.id);

    return { outcome: 'processed', organizationId };
  }

  private async handleInvoiceEvent(
    invoice: Stripe.Invoice,
    organizationId: string,
    event: Stripe.Event,
  ): Promise<StripeWebhookDispatchResult> {
    const localInvoiceId = await this.invoiceMirror.mirrorStripeInvoice(invoice);

    if (invoice.subscription) {
      const subscriptionId =
        typeof invoice.subscription === 'string'
          ? invoice.subscription
          : invoice.subscription.id;
      const stripe = getStripeClient(this.configService.get<string>('stripe.secretKey'));
      if (stripe) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        await this.stripeAdapter.applyStripeSubscription(organizationId, sub);
        await this.billingEvents.publishSubscriptionSynced(organizationId, {
          stripeSubscriptionId: sub.id,
          stripeStatus: sub.status,
          source: event.type,
        }, event.id);
      }
    }

    await this.stripeAdapter.syncPaymentMethods(organizationId);

    if (localInvoiceId) {
      await this.prisma.$transaction(async (tx) => {
        await this.outbox.enqueue(tx, {
          eventType: BillingDomainEventType.INVOICE_MIRRORED,
          aggregateType: 'BillingInvoice',
          aggregateId: localInvoiceId,
          idempotencyKey: `stripe-webhook:${event.id}:invoice:${invoice.id}`,
          payload: {
            organizationId,
            invoiceId: localInvoiceId,
            stripeInvoiceId: invoice.id,
            status: invoice.status,
          },
        });
      });

      await this.billingEvents.publishInvoiceMirrored(organizationId, {
        invoiceId: localInvoiceId,
        stripeInvoiceId: invoice.id,
        status: invoice.status,
        source: event.type,
      }, event.id);
    }

    return { outcome: 'processed', organizationId };
  }

  private async handlePaymentIntentEvent(
    paymentIntent: Stripe.PaymentIntent,
    organizationId: string,
    event: Stripe.Event,
  ): Promise<StripeWebhookDispatchResult> {
    await this.paymentLedger.mirrorPaymentIntent(paymentIntent, organizationId, event.id);
    await this.stripeAdapter.syncPaymentMethods(organizationId);
    return { outcome: 'processed', organizationId };
  }

  private async handleChargeRefunded(
    charge: Stripe.Charge,
    organizationId: string,
    event: Stripe.Event,
  ): Promise<StripeWebhookDispatchResult> {
    await this.paymentLedger.mirrorChargeRefunded(charge, organizationId, event.id);
    await this.stripeBilling.syncPaymentMethods(organizationId);
    return { outcome: 'processed', organizationId };
  }

  private async handleCreditNoteEvent(
    creditNote: Stripe.CreditNote,
    organizationId: string,
    event: Stripe.Event,
  ): Promise<StripeWebhookDispatchResult> {
    await this.paymentLedger.mirrorCreditNote(creditNote, organizationId, event.id);
    return { outcome: 'processed', organizationId };
  }

  private async handleDisputeEvent(
    dispute: Stripe.Dispute,
    organizationId: string,
    event: Stripe.Event,
  ): Promise<StripeWebhookDispatchResult> {
    await this.paymentLedger.mirrorDispute(
      dispute,
      organizationId,
      event.id,
      event.type as 'charge.dispute.created' | 'charge.dispute.closed',
    );
    return { outcome: 'processed', organizationId };
  }
}
