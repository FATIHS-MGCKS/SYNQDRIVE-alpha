import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingPaymentMethodStatus,
  BillingPaymentMethodType,
  BillingStatus,
} from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '@shared/database/prisma.service';
import { BillableVehiclesService } from './billable-vehicles.service';
import { getStripeClient } from './stripe-client.util';
import { mapStripeSubscriptionStatus } from './stripe-status.mapper';

export interface StripeNotConfiguredResponse {
  status: 'NOT_CONFIGURED';
  prepared: true;
  message: string;
}

@Injectable()
export class StripeBillingService {
  private readonly logger = new Logger(StripeBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly billableVehiclesService: BillableVehiclesService,
  ) {}

  isStripeConfigured(): boolean {
    return Boolean(this.configService.get<string>('stripe.secretKey'));
  }

  private requireStripe(): Stripe {
    const client = getStripeClient(this.configService.get<string>('stripe.secretKey'));
    if (!client) {
      throw new HttpException(
        {
          status: 'NOT_CONFIGURED',
          prepared: true,
          message: 'Stripe is not configured. Set STRIPE_SECRET_KEY.',
        },
        HttpStatus.NOT_IMPLEMENTED,
      );
    }
    return client;
  }

  private async loadOrganization(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        companyName: true,
        legalCompanyName: true,
        email: true,
        invoiceEmail: true,
        managerEmail: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        country: true,
        vatId: true,
        taxId: true,
      },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async findPrimarySubscription(organizationId: string) {
    return this.prisma.billingSubscription.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findStripeCustomerId(organizationId: string): Promise<string | null> {
    const sub = await this.prisma.billingSubscription.findFirst({
      where: { organizationId, stripeCustomerId: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: { stripeCustomerId: true },
    });
    return sub?.stripeCustomerId ?? null;
  }

  private async ensurePrimarySubscriptionRecord(organizationId: string) {
    const existing = await this.findPrimarySubscription(organizationId);
    if (existing) return existing;

    return this.prisma.billingSubscription.create({
      data: {
        organizationId,
        status: BillingStatus.TRIALING,
      },
    });
  }

  async ensureCustomerForOrganization(organizationId: string): Promise<string> {
    const existingCustomerId = await this.findStripeCustomerId(organizationId);
    if (existingCustomerId) return existingCustomerId;

    const stripe = this.requireStripe();
    const org = await this.loadOrganization(organizationId);
    const email = org.invoiceEmail || org.email || org.managerEmail || undefined;

    const customer = await stripe.customers.create({
      email,
      name: org.legalCompanyName || org.companyName,
      phone: org.phone || undefined,
      metadata: {
        organizationId: org.id,
        synqdrive: 'true',
      },
      address: org.address
        ? {
            line1: org.address,
            city: org.city || undefined,
            state: org.state || undefined,
            postal_code: org.zip || undefined,
            country: org.country || undefined,
          }
        : undefined,
    });

    const sub = await this.ensurePrimarySubscriptionRecord(organizationId);
    await this.prisma.billingSubscription.update({
      where: { id: sub.id },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  resolvePortalReturnUrl(requested?: string): string {
    const configured = this.configService.get<string>('stripe.portalReturnUrl');
    const fallback = configured || 'http://localhost:5173/rental/settings';

    if (!requested?.trim()) return fallback;

    const url = requested.trim();
    try {
      const parsed = new URL(url);
      const allowedOrigins = this.configService.get<string[]>('app.corsOrigins', []);
      const originAllowed = allowedOrigins.some((allowed) => {
        try {
          return new URL(allowed).origin === parsed.origin;
        } catch {
          return false;
        }
      });
      if (!originAllowed && configured) {
        const configuredOrigin = new URL(configured).origin;
        if (parsed.origin !== configuredOrigin) {
          throw new BadRequestException('returnUrl origin is not allowed');
        }
      }
      return url;
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException('Invalid returnUrl');
    }
  }

  async createCustomerPortalSession(organizationId: string, returnUrl?: string) {
    const stripe = this.requireStripe();
    const customerId = await this.ensureCustomerForOrganization(organizationId);
    const resolvedReturnUrl = this.resolvePortalReturnUrl(returnUrl);

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: resolvedReturnUrl,
    });

    return {
      url: session.url,
      customerId,
      returnUrl: resolvedReturnUrl,
    };
  }

  async createSetupIntent(organizationId: string) {
    const stripe = this.requireStripe();
    const customerId = await this.ensureCustomerForOrganization(organizationId);

    const intent = await stripe.setupIntents.create({
      customer: customerId,
      usage: 'off_session',
      payment_method_types: ['card'],
      metadata: {
        organizationId,
      },
    });

    if (!intent.client_secret) {
      throw new BadRequestException('Stripe did not return a setup intent client secret');
    }

    return {
      clientSecret: intent.client_secret,
      customerId,
      setupIntentId: intent.id,
    };
  }

  private mapPaymentMethodType(type: string | undefined): BillingPaymentMethodType {
    if (type === 'card') return BillingPaymentMethodType.CARD;
    if (type === 'sepa_debit') return BillingPaymentMethodType.SEPA_DEBIT;
    return BillingPaymentMethodType.UNKNOWN;
  }

  async syncPaymentMethods(organizationId: string) {
    const stripe = this.requireStripe();
    const customerId = await this.findStripeCustomerId(organizationId);
    if (!customerId) {
      return { synced: 0, customerId: null };
    }

    const customer = (await stripe.customers.retrieve(customerId)) as Stripe.Customer;
    const defaultPmRef = customer.invoice_settings?.default_payment_method;
    const defaultPmId =
      typeof defaultPmRef === 'string' ? defaultPmRef : defaultPmRef?.id ?? null;

    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });

    const seen = new Set<string>();
    let synced = 0;

    for (const pm of paymentMethods.data) {
      seen.add(pm.id);
      const card = pm.card;
      await this.prisma.billingPaymentMethod.upsert({
        where: { stripePaymentMethodId: pm.id },
        create: {
          organizationId,
          stripePaymentMethodId: pm.id,
          type: this.mapPaymentMethodType(pm.type),
          brand: card?.brand ?? null,
          last4: card?.last4 ?? null,
          expMonth: card?.exp_month ?? null,
          expYear: card?.exp_year ?? null,
          isDefault: pm.id === defaultPmId,
          status: BillingPaymentMethodStatus.ACTIVE,
        },
        update: {
          type: this.mapPaymentMethodType(pm.type),
          brand: card?.brand ?? null,
          last4: card?.last4 ?? null,
          expMonth: card?.exp_month ?? null,
          expYear: card?.exp_year ?? null,
          isDefault: pm.id === defaultPmId,
          status: BillingPaymentMethodStatus.ACTIVE,
        },
      });
      synced++;
    }

    await this.prisma.billingPaymentMethod.updateMany({
      where: {
        organizationId,
        stripePaymentMethodId: { notIn: [...seen] },
      },
      data: {
        isDefault: false,
        status: BillingPaymentMethodStatus.DETACHED,
      },
    });

    if (defaultPmId) {
      await this.prisma.billingPaymentMethod.updateMany({
        where: { organizationId },
        data: { isDefault: false },
      });
      await this.prisma.billingPaymentMethod.updateMany({
        where: { organizationId, stripePaymentMethodId: defaultPmId },
        data: { isDefault: true },
      });
    }

    return { synced, customerId, defaultPaymentMethodId: defaultPmId };
  }

  async syncSubscriptionFromStripe(organizationId: string) {
    const stripe = this.requireStripe();
    const localSub = await this.findPrimarySubscription(organizationId);
    if (!localSub?.stripeSubscriptionId && !localSub?.stripeCustomerId) {
      return { synced: false, reason: 'No Stripe subscription or customer mapping' };
    }

    let stripeSub: Stripe.Subscription | null = null;

    if (localSub.stripeSubscriptionId) {
      stripeSub = await stripe.subscriptions.retrieve(localSub.stripeSubscriptionId);
    } else if (localSub.stripeCustomerId) {
      const list = await stripe.subscriptions.list({
        customer: localSub.stripeCustomerId,
        status: 'all',
        limit: 1,
      });
      stripeSub = list.data[0] ?? null;
    }

    if (!stripeSub) {
      return { synced: false, reason: 'No Stripe subscription found' };
    }

    return this.applyStripeSubscription(organizationId, stripeSub);
  }

  async applyStripeSubscription(organizationId: string, stripeSub: Stripe.Subscription) {
    const mapped = mapStripeSubscriptionStatus(stripeSub.status);
    const sub =
      (await this.findPrimarySubscription(organizationId)) ??
      (await this.ensurePrimarySubscriptionRecord(organizationId));

    const customerId =
      typeof stripeSub.customer === 'string'
        ? stripeSub.customer
        : stripeSub.customer?.id ?? sub.stripeCustomerId;

    const updated = await this.prisma.billingSubscription.update({
      where: { id: sub.id },
      data: {
        stripeSubscriptionId: stripeSub.id,
        stripeCustomerId: customerId ?? sub.stripeCustomerId,
        status: mapped.billingStatus,
        currentPeriodStart: stripeSub.current_period_start
          ? new Date(stripeSub.current_period_start * 1000)
          : null,
        currentPeriodEnd: stripeSub.current_period_end
          ? new Date(stripeSub.current_period_end * 1000)
          : null,
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end ?? false,
      },
    });

    return {
      synced: true,
      subscriptionId: updated.id,
      stripeSubscriptionId: stripeSub.id,
      status: mapped,
    };
  }

  async createOrUpdateSubscriptionForOrg(organizationId: string) {
    const priceId = this.configService.get<string>('stripe.defaultPriceId');
    if (!priceId) {
      return {
        prepared: true,
        created: false,
        message:
          'Stripe subscription creation requires STRIPE_DEFAULT_PRICE_ID. SynqDrive pricebook mapping to Stripe Prices is not yet configured.',
      };
    }

    const stripe = this.requireStripe();
    const customerId = await this.ensureCustomerForOrganization(organizationId);
    const billable =
      await this.billableVehiclesService.getBillableConnectedVehiclesForOrganization(
        organizationId,
      );
    const quantity = Math.max(billable.billableVehicleCount, 1);

    const localSub = await this.findPrimarySubscription(organizationId);
    let stripeSub: Stripe.Subscription;

    if (localSub?.stripeSubscriptionId) {
      const existing = await stripe.subscriptions.retrieve(localSub.stripeSubscriptionId);
      const itemId = existing.items.data[0]?.id;
      if (!itemId) {
        throw new BadRequestException('Stripe subscription has no line items');
      }
      stripeSub = await stripe.subscriptions.update(localSub.stripeSubscriptionId, {
        items: [{ id: itemId, quantity }],
        metadata: { organizationId },
      });
    } else {
      stripeSub = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId, quantity }],
        metadata: { organizationId },
      });
    }

    const result = await this.applyStripeSubscription(organizationId, stripeSub);
    return {
      prepared: false,
      created: true,
      quantity,
      priceId,
      ...result,
    };
  }

  async syncOrganizationStripe(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    if (!this.isStripeConfigured()) {
      return {
        status: 'NOT_CONFIGURED' as const,
        prepared: true,
        message: 'Stripe is not configured. Set STRIPE_SECRET_KEY.',
        organizationId,
        synced: false,
      };
    }

    const customerId = await this.ensureCustomerForOrganization(organizationId);
    const paymentMethods = await this.syncPaymentMethods(organizationId);
    const subscription = await this.syncSubscriptionFromStripe(organizationId);

    return {
      status: 'SYNCED' as const,
      organizationId,
      synced: true,
      customerId,
      paymentMethods,
      subscription,
    };
  }

  async findOrganizationIdByStripeCustomer(customerId: string): Promise<string | null> {
    const sub = await this.prisma.billingSubscription.findFirst({
      where: { stripeCustomerId: customerId },
      select: { organizationId: true },
    });
    return sub?.organizationId ?? null;
  }

  async findOrganizationIdByStripeSubscription(subscriptionId: string): Promise<string | null> {
    const sub = await this.prisma.billingSubscription.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
      select: { organizationId: true },
    });
    return sub?.organizationId ?? null;
  }
}
