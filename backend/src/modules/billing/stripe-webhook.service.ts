import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StripeWebhookEventStatus } from '@prisma/client';
import Stripe from 'stripe';
import { createHash } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { getStripeClient } from './stripe-client.util';
import { StripeBillingService } from './stripe-billing.service';
import { StripeInvoiceMirrorService } from './stripe-invoice-mirror.service';

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly stripeBilling: StripeBillingService,
    private readonly invoiceMirror: StripeInvoiceMirrorService,
  ) {}

  constructEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event {
    const webhookSecret = this.configService.get<string>('stripe.webhookSecret');
    if (!webhookSecret) {
      throw new BadRequestException('Stripe webhook secret is not configured');
    }
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    const stripe = getStripeClient(this.configService.get<string>('stripe.secretKey'));
    if (!stripe) {
      throw new BadRequestException('Stripe is not configured');
    }

    try {
      return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid signature';
      throw new BadRequestException(`Stripe webhook signature verification failed: ${message}`);
    }
  }

  private hashPayload(rawBody: Buffer): string {
    return createHash('sha256').update(rawBody).digest('hex');
  }

  async ingestRawWebhook(rawBody: Buffer, signature: string | undefined) {
    const event = this.constructEvent(rawBody, signature);
    const payloadHash = this.hashPayload(rawBody);

    const existing = await this.prisma.stripeWebhookEvent.findUnique({
      where: { stripeEventId: event.id },
    });

    if (existing?.status === StripeWebhookEventStatus.PROCESSED) {
      return {
        received: true,
        duplicate: true,
        eventId: event.id,
        type: event.type,
        status: 'skipped_processed',
      };
    }

    if (!existing) {
      await this.prisma.stripeWebhookEvent.create({
        data: {
          stripeEventId: event.id,
          type: event.type,
          status: StripeWebhookEventStatus.RECEIVED,
          payloadHash,
        },
      });
    }

    try {
      const ignored = await this.dispatchEvent(event);
      await this.prisma.stripeWebhookEvent.update({
        where: { stripeEventId: event.id },
        data: {
          status: ignored
            ? StripeWebhookEventStatus.IGNORED
            : StripeWebhookEventStatus.PROCESSED,
          processedAt: new Date(),
          errorMessage: null,
        },
      });
      return {
        received: true,
        duplicate: false,
        eventId: event.id,
        type: event.type,
        status: ignored ? 'ignored' : 'processed',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Webhook processing failed';
      this.logger.warn(`Stripe webhook ${event.id} (${event.type}) failed: ${message}`);
      await this.prisma.stripeWebhookEvent.update({
        where: { stripeEventId: event.id },
        data: {
          status: StripeWebhookEventStatus.FAILED,
          errorMessage: message.slice(0, 500),
        },
      });
      throw err;
    }
  }

  /** @returns true when event type is intentionally ignored */
  private async dispatchEvent(event: Stripe.Event): Promise<boolean> {
    switch (event.type) {
      case 'customer.updated':
        await this.handleCustomerUpdated(event.data.object as Stripe.Customer);
        return false;
      case 'payment_method.attached':
        await this.handlePaymentMethodAttached(event.data.object as Stripe.PaymentMethod);
        return false;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.handleSubscriptionEvent(event.data.object as Stripe.Subscription);
        return false;
      case 'invoice.created':
      case 'invoice.finalized':
      case 'invoice.paid':
      case 'invoice.payment_failed':
        await this.handleInvoiceEvent(event.data.object as Stripe.Invoice);
        return false;
      case 'charge.refunded':
        await this.handleChargeRefunded(event.data.object as Stripe.Charge);
        return false;
      default:
        return true;
    }
  }

  private async resolveOrgIdFromCustomer(
    customerRef: string | Stripe.Customer | Stripe.DeletedCustomer | null,
  ): Promise<string | null> {
    const customerId =
      typeof customerRef === 'string' ? customerRef : customerRef?.id ?? null;
    if (!customerId) return null;
    return this.stripeBilling.findOrganizationIdByStripeCustomer(customerId);
  }

  private async handleCustomerUpdated(customer: Stripe.Customer) {
    const orgId =
      customer.metadata?.organizationId ||
      (await this.stripeBilling.findOrganizationIdByStripeCustomer(customer.id));
    if (!orgId) return;
    await this.stripeBilling.syncPaymentMethods(orgId);
  }

  private async handlePaymentMethodAttached(paymentMethod: Stripe.PaymentMethod) {
    const orgId = await this.resolveOrgIdFromCustomer(paymentMethod.customer ?? null);
    if (!orgId) return;
    await this.stripeBilling.syncPaymentMethods(orgId);
  }

  private async handleSubscriptionEvent(subscription: Stripe.Subscription) {
    const orgId =
      subscription.metadata?.organizationId ||
      (await this.stripeBilling.findOrganizationIdByStripeSubscription(subscription.id)) ||
      (await this.resolveOrgIdFromCustomer(subscription.customer));
    if (!orgId) {
      this.logger.warn(`Subscription webhook without org mapping: ${subscription.id}`);
      return;
    }
    await this.stripeBilling.applyStripeSubscription(orgId, subscription);
    await this.stripeBilling.syncPaymentMethods(orgId);
  }

  private async handleInvoiceEvent(invoice: Stripe.Invoice) {
    await this.invoiceMirror.mirrorStripeInvoice(invoice);

    const orgId = await this.resolveOrgIdFromCustomer(invoice.customer ?? null);
    if (!orgId) return;

    if (invoice.subscription) {
      const subscriptionId =
        typeof invoice.subscription === 'string'
          ? invoice.subscription
          : invoice.subscription.id;
      const stripe = getStripeClient(this.configService.get<string>('stripe.secretKey'));
      if (stripe) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        await this.stripeBilling.applyStripeSubscription(orgId, sub);
      }
    }

    await this.stripeBilling.syncPaymentMethods(orgId);
  }

  private async handleChargeRefunded(charge: Stripe.Charge) {
    const orgId = await this.resolveOrgIdFromCustomer(charge.customer ?? null);
    if (!orgId) return;
    await this.stripeBilling.syncPaymentMethods(orgId);
  }
}
