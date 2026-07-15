import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingPaymentMethodStatus,
  BillingStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { StripePreparedService } from './stripe-prepared.service';
import { StripePaymentMethodService } from './stripe-payment-method.service';
import { TenantBillingErrorCode, tenantBillingError } from './domain/tenant-billing.errors';
import {
  TenantCustomerPortalSessionDto,
  TenantDefaultPaymentMethodDto,
  TenantPaymentMethodBillingState,
  TenantPaymentMethodDto,
  TenantPaymentMethodsDto,
  TenantSetupIntentDto,
} from './dto/tenant-billing-payment-methods.dto';
import { SafePaymentMethodView } from './domain/stripe-payment-methods';
import { BillingPaymentMethodType } from '@prisma/client';

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  CARD: 'Karte',
  SEPA_DEBIT: 'SEPA-Lastschrift',
  OTHER: 'Zahlungsmethode',
};

const PAYMENT_STATUS_LABELS: Record<TenantPaymentMethodBillingState, string> = {
  READY: 'Hinterlegt',
  MISSING: 'Nicht hinterlegt',
  REQUIRES_ACTION: 'Bestätigung erforderlich',
  FAILED: 'Ungültig oder abgelaufen',
};

const MANDATE_STATUS_LABELS: Record<string, string> = {
  active: 'Aktiv',
  pending: 'Ausstehend',
  inactive: 'Inaktiv',
};

@Injectable()
export class TenantBillingPaymentMethodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripePrepared: StripePreparedService,
    private readonly paymentMethods: StripePaymentMethodService,
  ) {}

  async listPaymentMethods(organizationId: string): Promise<TenantPaymentMethodsDto> {
    const rows = await this.paymentMethods.listOrganizationPaymentMethods(organizationId);
    const active = rows.filter((row) => row.status !== BillingPaymentMethodStatus.DETACHED);
    const defaultMethod = active.find((row) => row.isDefault) ?? null;

    return {
      configured: this.stripePrepared.isStripeConfigured(),
      defaultMethodId: defaultMethod?.id ?? null,
      paymentMethods: active.map((row) => this.mapPaymentMethod(row)),
    };
  }

  async getDefaultPaymentMethod(organizationId: string): Promise<TenantDefaultPaymentMethodDto> {
    const result = await this.paymentMethods.getDefaultPaymentMethodView(organizationId);
    const billingState = this.mapBillingState(result.billingState);

    return {
      configured: this.stripePrepared.isStripeConfigured(),
      status: billingState,
      statusLabel: PAYMENT_STATUS_LABELS[billingState],
      defaultMethod: result.paymentMethod ? this.mapPaymentMethod(result.paymentMethod) : null,
    };
  }

  async createSetupIntent(
    organizationId: string,
    paymentMethodType?: 'card' | 'sepa_debit',
  ): Promise<TenantSetupIntentDto> {
    try {
      const result = await this.stripePrepared.createSetupIntent(
        organizationId,
        paymentMethodType,
      );
      return { clientSecret: result.clientSecret };
    } catch (error) {
      this.rethrowPortalOrStripeUnavailable(error);
      throw error;
    }
  }

  async createCustomerPortalSession(
    organizationId: string,
    returnUrl?: string,
  ): Promise<TenantCustomerPortalSessionDto> {
    try {
      const result = await this.stripePrepared.createCustomerPortalSession(
        organizationId,
        returnUrl,
      );
      return {
        url: result.url,
        returnUrl: result.returnUrl,
      };
    } catch (error) {
      this.rethrowPortalOrStripeUnavailable(error);
      throw error;
    }
  }

  async setDefaultPaymentMethod(organizationId: string, paymentMethodId: string) {
    await this.assertOrganizationPaymentMethod(organizationId, paymentMethodId);
    await this.stripePrepared.setDefaultPaymentMethod(organizationId, paymentMethodId);
    return this.getDefaultPaymentMethod(organizationId);
  }

  async detachPaymentMethod(organizationId: string, paymentMethodId: string) {
    const row = await this.assertOrganizationPaymentMethod(organizationId, paymentMethodId);
    await this.assertDetachAllowed(organizationId, row.id, row.isDefault);
    await this.stripePrepared.detachPaymentMethod(organizationId, paymentMethodId);
    return this.listPaymentMethods(organizationId);
  }

  private mapPaymentMethod(row: SafePaymentMethodView): TenantPaymentMethodDto {
    const type =
      row.type === BillingPaymentMethodType.CARD
        ? 'CARD'
        : row.type === BillingPaymentMethodType.SEPA_DEBIT
          ? 'SEPA_DEBIT'
          : 'OTHER';

    return {
      id: row.id,
      type,
      typeLabel: PAYMENT_TYPE_LABELS[type],
      brand: row.brand,
      last4: row.last4,
      expMonth: row.expMonth,
      expYear: row.expYear,
      bankName: row.sepaBankCode,
      mandateStatusLabel: row.sepaMandateStatus
        ? MANDATE_STATUS_LABELS[row.sepaMandateStatus.toLowerCase()] ?? row.sepaMandateStatus
        : null,
      isDefault: row.isDefault,
      statusLabel: row.isActive ? 'Aktiv' : 'Inaktiv',
      billingState: this.mapBillingState(row.billingState),
    };
  }

  private mapBillingState(
    billingState: SafePaymentMethodView['billingState'] | 'MISSING',
  ): TenantPaymentMethodBillingState {
    if (billingState === 'READY') return 'READY';
    if (billingState === 'REQUIRES_ACTION') return 'REQUIRES_ACTION';
    if (billingState === 'FAILED') return 'FAILED';
    return 'MISSING';
  }

  private async assertOrganizationPaymentMethod(organizationId: string, paymentMethodId: string) {
    const row = await this.prisma.billingPaymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        organizationId,
        status: { not: BillingPaymentMethodStatus.DETACHED },
      },
    });
    if (!row) {
      throw new NotFoundException('Payment method not found');
    }
    return row;
  }

  private async assertDetachAllowed(
    organizationId: string,
    paymentMethodId: string,
    isDefault: boolean,
  ) {
    const activeSubscription = await this.prisma.billingSubscription.findFirst({
      where: {
        organizationId,
        endedAt: null,
        status: {
          in: [
            BillingStatus.ACTIVE,
            BillingStatus.PAST_DUE,
            BillingStatus.TRIALING,
          ],
        },
      },
      select: { id: true },
    });

    if (!activeSubscription) {
      return;
    }

    const activeMethods = await this.prisma.billingPaymentMethod.count({
      where: {
        organizationId,
        status: BillingPaymentMethodStatus.ACTIVE,
      },
    });

    if (activeMethods <= 1 || (isDefault && activeMethods <= 1)) {
      throw new BadRequestException(
        tenantBillingError(
          TenantBillingErrorCode.PAYMENT_METHOD_REQUIRED,
          'Für Ihr aktives Abonnement muss mindestens eine gültige Zahlungsmethode hinterlegt bleiben.',
        ),
      );
    }
  }

  private rethrowPortalOrStripeUnavailable(error: unknown): void {
    if (error instanceof HttpException && error.getStatus() === 501) {
      throw new BadRequestException(tenantBillingError(TenantBillingErrorCode.PORTAL_UNAVAILABLE));
    }
  }
}