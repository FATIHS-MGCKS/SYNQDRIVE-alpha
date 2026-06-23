import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { BillingPaymentMethodStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export interface StripePreparedStatusDto {
  configured: boolean;
  webhookConfigured: boolean;
  portalPrepared: boolean;
  message: string;
}

export interface StripeNotConfiguredResponse {
  status: 'NOT_CONFIGURED';
  prepared: true;
  message: string;
}

@Injectable()
export class StripePreparedService {
  constructor(private readonly prisma: PrismaService) {}

  isStripeConfigured(): boolean {
    return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  }

  isWebhookConfigured(): boolean {
    return Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
  }

  getPreparedStatus(): StripePreparedStatusDto {
    const configured = this.isStripeConfigured();
    return {
      configured,
      webhookConfigured: this.isWebhookConfigured(),
      portalPrepared: !configured,
      message: configured
        ? 'Stripe is configured.'
        : 'Stripe integration is prepared but not yet active.',
    };
  }

  private notConfiguredPayload(action: string): StripeNotConfiguredResponse {
    return {
      status: 'NOT_CONFIGURED',
      prepared: true,
      message: `Stripe is not configured. ${action} will be available once STRIPE_SECRET_KEY is set.`,
    };
  }

  private throwNotConfigured(action: string): never {
    throw new HttpException(this.notConfiguredPayload(action), HttpStatus.NOT_IMPLEMENTED);
  }

  async getDefaultPaymentMethod(organizationId: string) {
    const pm = await this.prisma.billingPaymentMethod.findFirst({
      where: { organizationId, isDefault: true },
      orderBy: { createdAt: 'desc' },
    });

    const stripe = this.getPreparedStatus();

    if (!pm) {
      return {
        exists: false,
        stripe,
        paymentMethod: null,
      };
    }

    return {
      exists: true,
      stripe,
      paymentMethod: {
        id: pm.id,
        type: pm.type,
        brand: pm.brand,
        last4: pm.last4,
        expMonth: pm.expMonth,
        expYear: pm.expYear,
        status: pm.status,
        isDefault: pm.isDefault,
        isActive: pm.status === BillingPaymentMethodStatus.ACTIVE,
      },
    };
  }

  async createCustomerPortalSession(organizationId: string) {
    if (!this.isStripeConfigured()) {
      this.throwNotConfigured('Customer portal');
    }
    // Future: Stripe Billing Portal session — no fake URLs
    this.throwNotConfigured('Customer portal');
  }

  async createSetupIntent(organizationId: string) {
    if (!this.isStripeConfigured()) {
      this.throwNotConfigured('Setup intent');
    }
    // Future: Stripe SetupIntent — no fake client secrets
    this.throwNotConfigured('Setup intent');
  }

  async syncOrganizationStripe(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, companyName: true },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    if (!this.isStripeConfigured()) {
      return {
        ...this.notConfiguredPayload('Stripe sync'),
        organizationId,
        synced: false,
      };
    }

    // Future: pull customer/subscription/payment method from Stripe API
    return {
      status: 'NOT_CONFIGURED' as const,
      prepared: true,
      message: 'Stripe SDK sync is not yet implemented.',
      organizationId,
      synced: false,
    };
  }
}
