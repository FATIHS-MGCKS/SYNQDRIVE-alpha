import Stripe from 'stripe';
import {
  BillingPaymentMethodStatus,
  BillingPaymentMethodType,
  BillingStripeMode,
  Prisma,
} from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { getStripeClient } from './stripe-client.util';
import { StripeBillingService } from './stripe-billing.service';
import { BillingEventPublisher } from './events/billing-event.publisher';
import { resolveStripeModeFromSecretKey } from './migration/billing-legacy-backfill.util';
import {
  PaymentMethodSyncResult,
  SafePaymentMethodView,
  StripePaymentMethodErrorCode,
  SupportedSetupPaymentMethodType,
  assertSetupIntentOrganization,
  mapCardExpiryStatus,
  mapSepaMandateStatusToLocalStatus,
  resolveBillingPaymentState,
  toSafePaymentMethodView,
} from './domain/stripe-payment-methods';

@Injectable()
export class StripePaymentMethodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => StripeBillingService))
    private readonly stripeBilling: StripeBillingService,
    private readonly events: BillingEventPublisher,
  ) {}

  getRuntimeStripeMode(): BillingStripeMode | null {
    return resolveStripeModeFromSecretKey(this.configService.get<string>('stripe.secretKey'));
  }

  async listOrganizationPaymentMethods(organizationId: string): Promise<SafePaymentMethodView[]> {
    const rows = await this.prisma.billingPaymentMethod.findMany({
      where: { organizationId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => toSafePaymentMethodView(row));
  }

  async getDefaultPaymentMethodView(organizationId: string) {
    const pm = await this.prisma.billingPaymentMethod.findFirst({
      where: { organizationId, isDefault: true, status: BillingPaymentMethodStatus.ACTIVE },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      exists: Boolean(pm),
      billingState: resolveBillingPaymentState({
        exists: Boolean(pm),
        status: pm?.status ?? null,
      }),
      paymentMethod: pm ? toSafePaymentMethodView(pm) : null,
    };
  }

  resolvePortalReturnUrl(requested?: string): string {
    return this.stripeBilling.resolvePortalReturnUrl(requested);
  }

  async createCustomerPortalSession(organizationId: string, returnUrl?: string) {
    const stripe = this.requireStripe();
    const customerId = await this.stripeBilling.ensureCustomerForOrganization(organizationId);
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

  async createSetupIntent(
    organizationId: string,
    paymentMethodType: SupportedSetupPaymentMethodType = 'card',
  ) {
    const stripe = this.requireStripe();
    const customerId = await this.stripeBilling.ensureCustomerForOrganization(organizationId);
    const stripeMode = this.requireRuntimeStripeMode();

    const intent = await stripe.setupIntents.create({
      customer: customerId,
      usage: 'off_session',
      payment_method_types: [paymentMethodType],
      metadata: {
        organizationId,
        synqdrive: 'true',
        stripeMode,
      },
    });

    if (!intent.client_secret) {
      throw new BadRequestException('Stripe did not return a setup intent client secret');
    }

    return {
      clientSecret: intent.client_secret,
      customerId,
      setupIntentId: intent.id,
      paymentMethodType,
      stripeMode,
    };
  }

  async syncPaymentMethods(organizationId: string): Promise<PaymentMethodSyncResult> {
    const stripe = this.requireStripe();
    const stripeMode = this.requireRuntimeStripeMode();
    const customerId = await this.stripeBilling.findStripeCustomerId(organizationId);
    if (!customerId) {
      return {
        organizationId,
        synced: 0,
        customerId: null,
        defaultPaymentMethodId: null,
        stripeMode,
      };
    }

    const customer = (await stripe.customers.retrieve(customerId)) as Stripe.Customer;
    const defaultPmId = this.resolveDefaultPaymentMethodId(customer);

    const seen = new Set<string>();
    let synced = 0;

    for (const type of ['card', 'sepa_debit'] as const) {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type,
      });

      for (const pm of paymentMethods.data) {
        seen.add(pm.id);
        const safe = await this.buildSafePaymentMethodPayload({
          stripe,
          organizationId,
          stripeMode,
          paymentMethod: pm,
          isDefault: pm.id === defaultPmId,
        });

        await this.prisma.billingPaymentMethod.upsert({
          where: { stripePaymentMethodId: pm.id },
          create: safe,
          update: safe,
        });
        synced += 1;
      }
    }

    await this.prisma.billingPaymentMethod.updateMany({
      where: {
        organizationId,
        stripeMode,
        stripePaymentMethodId: { notIn: [...seen] },
        status: { not: BillingPaymentMethodStatus.DETACHED },
      },
      data: {
        isDefault: false,
        status: BillingPaymentMethodStatus.DETACHED,
      },
    });

    await this.enforceSingleLocalDefault(organizationId, defaultPmId);

    await this.alignSubscriptionDefaultPaymentMethod(organizationId, customerId, defaultPmId);

    await this.events.publishPaymentMethodSynced(organizationId, {
      synced,
      customerId,
      defaultPaymentMethodId: defaultPmId,
      stripeMode,
    });

    return {
      organizationId,
      synced,
      customerId,
      defaultPaymentMethodId: defaultPmId,
      stripeMode,
    };
  }

  async setDefaultPaymentMethod(organizationId: string, paymentMethodId: string) {
    const row = await this.requireOrganizationPaymentMethod(organizationId, paymentMethodId);
    this.assertPaymentMethodActive(row);

    const stripe = this.requireStripe();
    const customerId = await this.stripeBilling.ensureCustomerForOrganization(organizationId);
    if (!row.stripePaymentMethodId) {
      throw new ConflictException({
        code: StripePaymentMethodErrorCode.PAYMENT_METHOD_INACTIVE,
        message: StripePaymentMethodErrorCode.PAYMENT_METHOD_INACTIVE,
      });
    }

    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: row.stripePaymentMethodId,
      },
    });

    await this.alignSubscriptionDefaultPaymentMethod(
      organizationId,
      customerId,
      row.stripePaymentMethodId,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.billingPaymentMethod.updateMany({
        where: { organizationId, isDefault: true },
        data: { isDefault: false },
      });
      await tx.billingPaymentMethod.update({
        where: { id: row.id },
        data: { isDefault: true, status: BillingPaymentMethodStatus.ACTIVE },
      });
    });

    await this.events.publishPaymentMethodSynced(organizationId, {
      action: 'SET_DEFAULT',
      paymentMethodId: row.id,
      stripePaymentMethodId: row.stripePaymentMethodId,
    }, row.id);

    return this.getDefaultPaymentMethodView(organizationId);
  }

  async detachPaymentMethod(organizationId: string, paymentMethodId: string) {
    const row = await this.requireOrganizationPaymentMethod(organizationId, paymentMethodId);
    const stripe = this.requireStripe();

    if (row.stripePaymentMethodId) {
      try {
        await stripe.paymentMethods.detach(row.stripePaymentMethodId);
      } catch (error) {
        const stripeType =
          error && typeof error === 'object' && 'type' in error
            ? String((error as { type: string }).type)
            : '';
        if (stripeType !== 'StripeInvalidRequestError') {
          throw error;
        }
      }
    }

    await this.prisma.billingPaymentMethod.update({
      where: { id: row.id },
      data: {
        isDefault: false,
        status: BillingPaymentMethodStatus.DETACHED,
      },
    });

    await this.syncPaymentMethods(organizationId);

    await this.events.publishPaymentMethodSynced(organizationId, {
      action: 'DETACHED',
      paymentMethodId: row.id,
      stripePaymentMethodId: row.stripePaymentMethodId,
    }, row.id);

    return { detached: true, paymentMethodId: row.id };
  }

  async handleSetupIntentSucceeded(setupIntent: Stripe.SetupIntent) {
    const organizationId = setupIntent.metadata?.organizationId?.trim();
    if (!organizationId) {
      return;
    }
    assertSetupIntentOrganization(setupIntent.metadata ?? {}, organizationId);
    await this.syncPaymentMethods(organizationId);
  }

  async handleSetupIntentFailed(setupIntent: Stripe.SetupIntent) {
    const organizationId = setupIntent.metadata?.organizationId?.trim();
    if (!organizationId) {
      return;
    }
    assertSetupIntentOrganization(setupIntent.metadata ?? {}, organizationId);
    await this.events.publishPaymentMethodSynced(organizationId, {
      action: 'SETUP_FAILED',
      setupIntentId: setupIntent.id,
      lastSetupError: setupIntent.last_setup_error?.code ?? null,
    }, setupIntent.id);
  }

  async handlePaymentMethodDetached(paymentMethod: Stripe.PaymentMethod) {
    const orgId = await this.resolveOrganizationIdFromPaymentMethod(paymentMethod);
    if (!orgId) {
      return;
    }

    await this.prisma.billingPaymentMethod.updateMany({
      where: {
        organizationId: orgId,
        stripePaymentMethodId: paymentMethod.id,
      },
      data: {
        isDefault: false,
        status: BillingPaymentMethodStatus.DETACHED,
      },
    });

    await this.syncPaymentMethods(orgId);
  }

  async handlePaymentMethodUpdated(paymentMethod: Stripe.PaymentMethod) {
    const orgId = await this.resolveOrganizationIdFromPaymentMethod(paymentMethod);
    if (!orgId) {
      return;
    }
    await this.syncPaymentMethods(orgId);
  }

  private async buildSafePaymentMethodPayload(input: {
    stripe: Stripe;
    organizationId: string;
    stripeMode: BillingStripeMode;
    paymentMethod: Stripe.PaymentMethod;
    isDefault: boolean;
  }): Promise<Prisma.BillingPaymentMethodCreateInput> {
    const type = this.mapPaymentMethodType(input.paymentMethod.type);
    const billingName = input.paymentMethod.billing_details?.name?.trim() || null;
    const country =
      input.paymentMethod.card?.country ??
      input.paymentMethod.sepa_debit?.country ??
      input.paymentMethod.billing_details?.address?.country ??
      null;

    let status: BillingPaymentMethodStatus = BillingPaymentMethodStatus.ACTIVE;
    let sepaMandateStatus: string | null = null;
    let sepaBankCode: string | null = null;
    let brand: string | null = null;
    let last4: string | null = null;
    let expMonth: number | null = null;
    let expYear: number | null = null;

    if (type === BillingPaymentMethodType.CARD) {
      brand = input.paymentMethod.card?.brand ?? null;
      last4 = input.paymentMethod.card?.last4 ?? null;
      expMonth = input.paymentMethod.card?.exp_month ?? null;
      expYear = input.paymentMethod.card?.exp_year ?? null;
      status = mapCardExpiryStatus(expMonth, expYear);
    }

    if (type === BillingPaymentMethodType.SEPA_DEBIT) {
      last4 = input.paymentMethod.sepa_debit?.last4 ?? null;
      sepaBankCode = input.paymentMethod.sepa_debit?.bank_code ?? null;
      const paymentMethod = input.paymentMethod as Stripe.PaymentMethod & {
        mandate?: string | Stripe.Mandate | null;
      };
      const sepaDebit = paymentMethod.sepa_debit as
        | (Stripe.PaymentMethod.SepaDebit & { mandate?: string | Stripe.Mandate | null })
        | undefined;
      const mandateRef = paymentMethod.mandate ?? sepaDebit?.mandate ?? null;
      const mandateId =
        typeof mandateRef === 'string' ? mandateRef : mandateRef?.id ?? null;
      if (mandateId) {
        const mandate = await input.stripe.mandates.retrieve(mandateId);
        sepaMandateStatus = mandate.status;
        status = mapSepaMandateStatusToLocalStatus(mandate.status);
      } else {
        status = BillingPaymentMethodStatus.REQUIRES_ACTION;
      }
    }

    return {
      organization: { connect: { id: input.organizationId } },
      stripePaymentMethodId: input.paymentMethod.id,
      stripeMode: input.stripeMode,
      type,
      brand,
      last4,
      expMonth,
      expYear,
      country,
      billingName,
      sepaMandateStatus,
      sepaBankCode,
      isDefault: input.isDefault,
      status,
    };
  }

  private async enforceSingleLocalDefault(organizationId: string, defaultStripePaymentMethodId: string | null) {
    await this.prisma.$transaction(async (tx) => {
      await tx.billingPaymentMethod.updateMany({
        where: { organizationId },
        data: { isDefault: false },
      });

      if (!defaultStripePaymentMethodId) {
        return;
      }

      await tx.billingPaymentMethod.updateMany({
        where: {
          organizationId,
          stripePaymentMethodId: defaultStripePaymentMethodId,
          status: BillingPaymentMethodStatus.ACTIVE,
        },
        data: { isDefault: true },
      });
    });
  }

  private async alignSubscriptionDefaultPaymentMethod(
    organizationId: string,
    customerId: string,
    defaultStripePaymentMethodId: string | null,
  ) {
    if (!defaultStripePaymentMethodId) {
      return;
    }

    const stripe = this.requireStripe();
    const subscription = await this.prisma.billingSubscription.findFirst({
      where: { organizationId, stripeSubscriptionId: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: { stripeSubscriptionId: true },
    });

    if (!subscription?.stripeSubscriptionId) {
      return;
    }

    const existing = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
    const currentDefault =
      typeof existing.default_payment_method === 'string'
        ? existing.default_payment_method
        : existing.default_payment_method?.id ?? null;

    if (currentDefault === defaultStripePaymentMethodId) {
      return;
    }

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      default_payment_method: defaultStripePaymentMethodId,
    });
  }

  private resolveDefaultPaymentMethodId(customer: Stripe.Customer): string | null {
    const defaultPmRef = customer.invoice_settings?.default_payment_method;
    return typeof defaultPmRef === 'string' ? defaultPmRef : defaultPmRef?.id ?? null;
  }

  private async requireOrganizationPaymentMethod(organizationId: string, paymentMethodId: string) {
    const row = await this.prisma.billingPaymentMethod.findUnique({
      where: { id: paymentMethodId },
    });

    if (!row) {
      throw new NotFoundException({
        code: StripePaymentMethodErrorCode.PAYMENT_METHOD_NOT_FOUND,
        message: StripePaymentMethodErrorCode.PAYMENT_METHOD_NOT_FOUND,
      });
    }

    if (row.organizationId !== organizationId) {
      throw new ForbiddenException({
        code: StripePaymentMethodErrorCode.ORGANIZATION_MISMATCH,
        message: StripePaymentMethodErrorCode.ORGANIZATION_MISMATCH,
      });
    }

    const runtimeMode = this.getRuntimeStripeMode();
    if (row.stripeMode && runtimeMode && row.stripeMode !== runtimeMode) {
      throw new ConflictException({
        code: StripePaymentMethodErrorCode.STRIPE_MODE_MISMATCH,
        message: StripePaymentMethodErrorCode.STRIPE_MODE_MISMATCH,
      });
    }

    return row;
  }

  private assertPaymentMethodActive(row: { status: BillingPaymentMethodStatus }) {
    if (row.status === BillingPaymentMethodStatus.DETACHED) {
      throw new ConflictException({
        code: StripePaymentMethodErrorCode.PAYMENT_METHOD_INACTIVE,
        message: StripePaymentMethodErrorCode.PAYMENT_METHOD_INACTIVE,
      });
    }
  }

  private async resolveOrganizationIdFromPaymentMethod(paymentMethod: Stripe.PaymentMethod) {
    const local = await this.prisma.billingPaymentMethod.findUnique({
      where: { stripePaymentMethodId: paymentMethod.id },
      select: { organizationId: true },
    });
    if (local) {
      return local.organizationId;
    }

    const customerId =
      typeof paymentMethod.customer === 'string'
        ? paymentMethod.customer
        : paymentMethod.customer?.id ?? null;
    if (!customerId) {
      return null;
    }

    return this.stripeBilling.findOrganizationIdByStripeCustomer(customerId);
  }

  private mapPaymentMethodType(type: string | undefined): BillingPaymentMethodType {
    if (type === 'card') return BillingPaymentMethodType.CARD;
    if (type === 'sepa_debit') return BillingPaymentMethodType.SEPA_DEBIT;
    return BillingPaymentMethodType.UNKNOWN;
  }

  private requireStripe(): Stripe {
    const client = getStripeClient(this.configService.get<string>('stripe.secretKey'));
    if (!client) {
      throw new HttpException(
        {
          code: StripePaymentMethodErrorCode.NOT_CONFIGURED,
          message: StripePaymentMethodErrorCode.NOT_CONFIGURED,
        },
        HttpStatus.NOT_IMPLEMENTED,
      );
    }
    return client;
  }

  private requireRuntimeStripeMode(): BillingStripeMode {
    const mode = this.getRuntimeStripeMode();
    if (!mode) {
      throw new ConflictException({
        code: StripePaymentMethodErrorCode.STRIPE_MODE_MISMATCH,
        message: StripePaymentMethodErrorCode.STRIPE_MODE_MISMATCH,
      });
    }
    return mode;
  }
}
