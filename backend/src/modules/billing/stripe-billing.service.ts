import { BadRequestException, forwardRef, Inject, Injectable, Logger, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingStatus } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '@shared/database/prisma.service';
import { BillableVehiclesService } from './billable-vehicles.service';
import { StripeCatalogMappingService } from './stripe-catalog-mapping.service';
import { StripeSubscriptionOrchestratorService } from './stripe-subscription-orchestrator.service';
import { StripePaymentMethodService } from './stripe-payment-method.service';
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
    private readonly catalogMappings: StripeCatalogMappingService,
    private readonly subscriptionOrchestrator: StripeSubscriptionOrchestratorService,
    @Inject(forwardRef(() => StripePaymentMethodService))
    private readonly paymentMethods: StripePaymentMethodService,
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
    return this.paymentMethods.createCustomerPortalSession(organizationId, returnUrl);
  }

  async createSetupIntent(organizationId: string) {
    return this.paymentMethods.createSetupIntent(organizationId);
  }

  async syncPaymentMethods(organizationId: string) {
    const result = await this.paymentMethods.syncPaymentMethods(organizationId);
    return {
      synced: result.synced,
      customerId: result.customerId,
      defaultPaymentMethodId: result.defaultPaymentMethodId,
    };
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
    const mapped = mapStripeSubscriptionStatus(stripeSub.status, {
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end ?? false,
    });
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
    try {
      const result = await this.subscriptionOrchestrator.syncOrganizationSubscription({
        organizationId,
      });

      const mapped = await this.prisma.billingSubscription.findUnique({
        where: { id: result.subscriptionId },
        select: { status: true, cancelAtPeriodEnd: true },
      });

      return {
        prepared: false,
        created: result.created,
        subscriptionId: result.subscriptionId,
        stripeSubscriptionId: result.stripeSubscriptionId,
        status: mapped
          ? mapStripeSubscriptionStatus(
              result.syncStatus === 'SYNCED' ? 'active' : 'incomplete',
              { cancelAtPeriodEnd: mapped.cancelAtPeriodEnd },
            )
          : mapStripeSubscriptionStatus('active'),
        quantity: result.itemCount,
        priceId: null,
        synced: true,
      };
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.NOT_IMPLEMENTED) {
        const response = error.getResponse();
        const message =
          response && typeof response === 'object' && 'message' in response
            ? String((response as { message: string }).message)
            : 'Stripe is not configured. Set STRIPE_SECRET_KEY.';
        return {
          prepared: true,
          created: false,
          message,
        };
      }
      throw error;
    }
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
