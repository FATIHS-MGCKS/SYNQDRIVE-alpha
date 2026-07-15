import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { BillingDomainEventType } from '../domain/billing-domain.events';
import { BillingEmailLocale, resolveBillingEmailLocale } from './billing-email-i18n';
import {
  formatBillingDate,
  formatBillingMoney,
  resolveBillingPlanLabel,
  resolveBillingRecipientEmail,
  resolveBillingSettingsUrl,
} from './billing-email.util';
import { BillingEmailTemplateContext } from './billing-email-templates.util';

@Injectable()
export class BillingEmailContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async buildTemplateContext(input: {
    eventType: string;
    organizationId: string | null;
    payload: Record<string, unknown>;
  }): Promise<{
    context: BillingEmailTemplateContext | null;
    recipientEmail: string | null;
    skipReason?: string;
    invoicePdfUrl?: string | null;
  }> {
    const organizationId =
      input.organizationId
      ?? (typeof input.payload.organizationId === 'string' ? input.payload.organizationId : null);

    if (!organizationId) {
      return { context: null, recipientEmail: null, skipReason: 'missing_organization' };
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        companyName: true,
        legalCompanyName: true,
        language: true,
        invoiceEmail: true,
        email: true,
        managerEmail: true,
      },
    });
    if (!org) {
      return { context: null, recipientEmail: null, skipReason: 'organization_not_found' };
    }

    const recipientEmail = resolveBillingRecipientEmail(org);
    if (!recipientEmail) {
      return { context: null, recipientEmail: null, skipReason: 'missing_recipient' };
    }

    const locale = resolveBillingEmailLocale(org.language);
    const billingUrl = resolveBillingSettingsUrl(this.config);
    const supportEmail = this.config.get<string>('billingEmail.supportEmail', 'support@synqdrive.eu');

    const subscription = await this.resolveSubscription(organizationId, input.payload);
    const invoice = await this.resolveInvoice(organizationId, input.payload);
    const payment = await this.resolvePayment(organizationId, input.payload);

    const currency =
      (typeof input.payload.currency === 'string' && input.payload.currency)
      || invoice?.currency
      || payment?.currency
      || subscription?.currency
      || 'EUR';

    const amountCents =
      typeof input.payload.amountCents === 'number'
        ? input.payload.amountCents
        : invoice?.amountCents ?? payment?.amountCents ?? null;

    const context: BillingEmailTemplateContext = {
      eventType: input.eventType,
      locale,
      organizationName: org.companyName || org.legalCompanyName || 'Ihr Unternehmen',
      planName: resolveBillingPlanLabel({
        priceBookName: subscription?.priceBook?.name,
        productKey: subscription?.priceBook?.productKey,
      }),
      invoiceNumber: invoice?.invoiceNumber ?? null,
      amountFormatted: formatBillingMoney(amountCents, currency, locale),
      currency: currency.toUpperCase(),
      dueDateFormatted: formatBillingDate(invoice?.dueDate, locale),
      statusLabel: this.resolveStatusLabel(input.eventType, input.payload, locale),
      billingUrl,
      invoiceUrl: invoice?.hostedInvoiceUrl ?? invoice?.invoicePdfUrl ?? null,
      supportEmail,
      trialEndFormatted: formatBillingDate(
        subscription?.trialEndAt
          ?? (typeof input.payload.trialEnd === 'number'
            ? new Date(input.payload.trialEnd * 1000)
            : typeof input.payload.trialEnd === 'string'
              ? input.payload.trialEnd
              : null),
        locale,
      ),
      effectiveDateFormatted: formatBillingDate(subscription?.currentPeriodEnd, locale),
    };

    return {
      context,
      recipientEmail,
      invoicePdfUrl: invoice?.invoicePdfUrl ?? null,
    };
  }

  private async resolveSubscription(organizationId: string, payload: Record<string, unknown>) {
    const subscriptionId =
      typeof payload.subscriptionId === 'string' ? payload.subscriptionId : null;
    const stripeSubscriptionId =
      typeof payload.stripeSubscriptionId === 'string' ? payload.stripeSubscriptionId : null;

    if (subscriptionId) {
      return this.prisma.billingSubscription.findFirst({
        where: { id: subscriptionId, organizationId },
        include: { priceBook: { select: { name: true, productKey: true } } },
      });
    }

    if (stripeSubscriptionId) {
      return this.prisma.billingSubscription.findFirst({
        where: { stripeSubscriptionId, organizationId },
        include: { priceBook: { select: { name: true, productKey: true } } },
      });
    }

    return this.prisma.billingSubscription.findFirst({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
      include: { priceBook: { select: { name: true, productKey: true } } },
    });
  }

  private async resolveInvoice(organizationId: string, payload: Record<string, unknown>) {
    const invoiceId = typeof payload.invoiceId === 'string' ? payload.invoiceId : null;
    if (!invoiceId) return null;
    return this.prisma.billingInvoice.findFirst({
      where: { id: invoiceId, subscription: { organizationId } },
    });
  }

  private async resolvePayment(organizationId: string, payload: Record<string, unknown>) {
    const paymentId = typeof payload.paymentId === 'string' ? payload.paymentId : null;
    if (!paymentId) return null;
    return this.prisma.billingPayment.findFirst({
      where: {
        id: paymentId,
        invoice: { subscription: { organizationId } },
      },
    });
  }

  private resolveStatusLabel(
    eventType: string,
    payload: Record<string, unknown>,
    locale: BillingEmailLocale,
  ): string | null {
    const status = typeof payload.status === 'string' ? payload.status : null;
    if (!status) {
      if (eventType === BillingDomainEventType.PAYMENT_SUCCEEDED) {
        return locale === 'en' ? 'Paid' : 'Bezahlt';
      }
      if (eventType === BillingDomainEventType.PAYMENT_FAILED) {
        return locale === 'en' ? 'Failed' : 'Fehlgeschlagen';
      }
      return null;
    }
    return status.replace(/_/g, ' ');
  }
}
