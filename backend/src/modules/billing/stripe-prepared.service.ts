import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { StripeBillingService } from './stripe-billing.service';
import { StripePaymentMethodService } from './stripe-payment-method.service';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeBilling: StripeBillingService,
    private readonly paymentMethods: StripePaymentMethodService,
  ) {}

  isStripeConfigured(): boolean {
    return this.stripeBilling.isStripeConfigured();
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

  async getDefaultPaymentMethod(organizationId: string) {
    const stripe = this.getPreparedStatus();
    const result = await this.paymentMethods.getDefaultPaymentMethodView(organizationId);
    return {
      exists: result.exists,
      stripe,
      billingState: result.billingState,
      paymentMethod: result.paymentMethod,
    };
  }

  async listPaymentMethods(organizationId: string) {
    if (!this.isStripeConfigured()) {
      const methods = await this.paymentMethods.listOrganizationPaymentMethods(organizationId);
      return { configured: false, paymentMethods: methods };
    }
    return {
      configured: true,
      paymentMethods: await this.paymentMethods.listOrganizationPaymentMethods(organizationId),
    };
  }

  async createCustomerPortalSession(organizationId: string, returnUrl?: string) {
    if (!this.isStripeConfigured()) {
      throw new HttpException(
        this.notConfiguredPayload('Customer portal'),
        HttpStatus.NOT_IMPLEMENTED,
      );
    }
    return this.stripeBilling.createCustomerPortalSession(organizationId, returnUrl);
  }

  async createSetupIntent(organizationId: string, paymentMethodType?: 'card' | 'sepa_debit') {
    if (!this.isStripeConfigured()) {
      throw new HttpException(
        this.notConfiguredPayload('Setup intent'),
        HttpStatus.NOT_IMPLEMENTED,
      );
    }
    return this.paymentMethods.createSetupIntent(organizationId, paymentMethodType ?? 'card');
  }

  async syncPaymentMethods(organizationId: string) {
    if (!this.isStripeConfigured()) {
      throw new HttpException(
        this.notConfiguredPayload('Payment method sync'),
        HttpStatus.NOT_IMPLEMENTED,
      );
    }
    return this.paymentMethods.syncPaymentMethods(organizationId);
  }

  async setDefaultPaymentMethod(organizationId: string, paymentMethodId: string) {
    if (!this.isStripeConfigured()) {
      throw new HttpException(
        this.notConfiguredPayload('Set default payment method'),
        HttpStatus.NOT_IMPLEMENTED,
      );
    }
    return this.paymentMethods.setDefaultPaymentMethod(organizationId, paymentMethodId);
  }

  async detachPaymentMethod(organizationId: string, paymentMethodId: string) {
    if (!this.isStripeConfigured()) {
      throw new HttpException(
        this.notConfiguredPayload('Detach payment method'),
        HttpStatus.NOT_IMPLEMENTED,
      );
    }
    return this.paymentMethods.detachPaymentMethod(organizationId, paymentMethodId);
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

    return this.stripeBilling.syncOrganizationStripe(organizationId);
  }
}
