import { Injectable, Logger } from '@nestjs/common';
import { BillingStripeMode, BillingSubscription, Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildMirroredInvoicePayload,
  mergeImmutableInvoiceSnapshots,
  mergeImmutableLineSnapshots,
  MirroredInvoiceLinePayload,
} from './domain/stripe-invoice-mirror';

@Injectable()
export class StripeInvoiceMirrorService {
  private readonly logger = new Logger(StripeInvoiceMirrorService.name);

  constructor(private readonly prisma: PrismaService) {}

  private resolveStripeMode(
    invoice: Stripe.Invoice,
    subscription: BillingSubscription,
  ): BillingStripeMode {
    if (subscription.stripeMode) return subscription.stripeMode;
    if (invoice.livemode === false) return 'TEST';
    return 'LIVE';
  }

  async findSubscriptionForStripeInvoice(
    invoice: Stripe.Invoice,
  ): Promise<BillingSubscription | null> {
    const subscriptionRef = invoice.subscription;
    const subscriptionId =
      typeof subscriptionRef === 'string' ? subscriptionRef : subscriptionRef?.id;

    if (subscriptionId) {
      const bySub = await this.prisma.billingSubscription.findFirst({
        where: { stripeSubscriptionId: subscriptionId },
      });
      if (bySub) return bySub;
    }

    const customerRef = invoice.customer;
    const customerId = typeof customerRef === 'string' ? customerRef : customerRef?.id;
    if (!customerId) return null;

    return this.prisma.billingSubscription.findFirst({
      where: { stripeCustomerId: customerId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async loadOrganizationSnapshot(organizationId: string) {
    return this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        companyName: true,
        legalCompanyName: true,
        vatId: true,
        taxId: true,
        taxNumber: true,
        invoiceEmail: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        country: true,
      },
    });
  }

  async mirrorStripeInvoice(invoice: Stripe.Invoice): Promise<string | null> {
    if (!invoice.id) return null;

    const subscription = await this.findSubscriptionForStripeInvoice(invoice);
    if (!subscription) {
      this.logger.warn(
        `Skipping invoice mirror ${invoice.id}: no local subscription mapping`,
      );
      return null;
    }

    const organization = await this.loadOrganizationSnapshot(subscription.organizationId);
    if (!organization) {
      this.logger.warn(
        `Skipping invoice mirror ${invoice.id}: organization ${subscription.organizationId} missing`,
      );
      return null;
    }

    const mirrored = buildMirroredInvoicePayload({ invoice, organization });
    const stripeMode = this.resolveStripeMode(invoice, subscription);

    const existing = await this.prisma.billingInvoice.findUnique({
      where: {
        stripeInvoiceId_stripeMode: {
          stripeInvoiceId: invoice.id,
          stripeMode,
        },
      },
      select: {
        id: true,
        customerSnapshotJson: true,
        companySnapshotJson: true,
        billingAddressJson: true,
        taxIdSnapshot: true,
      },
    });

    const snapshots = mergeImmutableInvoiceSnapshots(
      existing as {
        customerSnapshotJson?: unknown;
        companySnapshotJson?: unknown;
        billingAddressJson?: unknown;
        taxIdSnapshot?: string | null;
      } | null,
      {
        customerSnapshotJson: mirrored.customerSnapshotJson,
        companySnapshotJson: mirrored.companySnapshotJson,
        billingAddressJson: mirrored.billingAddressJson,
        taxIdSnapshot: mirrored.taxIdSnapshot,
      },
    );

    const headerData = {
      invoiceNumber: mirrored.invoiceNumber,
      amountCents: mirrored.grossAmountCents,
      netAmountCents: mirrored.netAmountCents,
      discountAmountCents: mirrored.discountAmountCents,
      taxAmountCents: mirrored.taxAmountCents,
      amountDueCents: mirrored.amountDueCents,
      amountPaidCents: mirrored.amountPaidCents,
      amountRemainingCents: mirrored.amountRemainingCents,
      currency: mirrored.currency,
      status: mirrored.status,
      periodStart: mirrored.periodStart,
      periodEnd: mirrored.periodEnd,
      stripeCreatedAt: mirrored.stripeCreatedAt,
      finalizedAt: mirrored.finalizedAt,
      invoiceDate: mirrored.stripeCreatedAt,
      dueDate: mirrored.dueDate,
      paidAt: mirrored.paidAt,
      voidedAt: mirrored.voidedAt,
      hostedInvoiceUrl: mirrored.hostedInvoiceUrl,
      invoicePdfUrl: mirrored.invoicePdfUrl,
      customerSnapshotJson: snapshots.customerSnapshotJson as unknown as Prisma.InputJsonValue,
      companySnapshotJson: snapshots.companySnapshotJson as unknown as Prisma.InputJsonValue,
      billingAddressJson: snapshots.billingAddressJson as unknown as Prisma.InputJsonValue,
      taxIdSnapshot: snapshots.taxIdSnapshot,
      stripeMode,
    };

    if (existing) {
      await this.prisma.$transaction(async (tx) => {
        await tx.billingInvoice.update({
          where: { id: existing.id },
          data: headerData,
        });
        await this.syncMirroredLines(tx, existing.id, mirrored.lines, stripeMode);
      });
      return existing.id;
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.billingInvoice.create({
        data: {
          subscriptionId: subscription.id,
          stripeInvoiceId: mirrored.stripeInvoiceId,
          ...headerData,
        },
      });
      await this.syncMirroredLines(tx, row.id, mirrored.lines, stripeMode);
      return row;
    });

    return created.id;
  }

  private async syncMirroredLines(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    lines: MirroredInvoiceLinePayload[],
    stripeMode: BillingStripeMode,
  ) {
    for (const line of lines) {
      const existingLine = await tx.billingInvoiceLine.findUnique({
        where: {
          stripeInvoiceLineId_stripeMode: {
            stripeInvoiceLineId: line.stripeInvoiceLineId,
            stripeMode,
          },
        },
        select: {
          id: true,
          productSnapshotJson: true,
          priceSnapshotJson: true,
        },
      });

      const lineSnapshots = mergeImmutableLineSnapshots(existingLine, line);
      const lineData = {
        description: line.description,
        quantity: line.quantity,
        unitAmountCents: line.unitAmountCents,
        discountCents: line.discountCents,
        subtotalCents: line.subtotalCents,
        netCents: line.netCents,
        taxRateBps: line.taxRateBps,
        taxCents: line.taxCents,
        totalCents: line.totalCents,
        periodStart: line.periodStart,
        periodEnd: line.periodEnd,
        productSnapshotJson: lineSnapshots.productSnapshotJson as unknown as Prisma.InputJsonValue,
        priceSnapshotJson: lineSnapshots.priceSnapshotJson as unknown as Prisma.InputJsonValue,
        discountDetailsJson: line.discountDetailsJson as unknown as Prisma.InputJsonValue,
        taxDetailsJson: line.taxDetailsJson as unknown as Prisma.InputJsonValue,
        stripeMode,
      };

      if (existingLine) {
        await tx.billingInvoiceLine.update({
          where: { id: existingLine.id },
          data: lineData,
        });
        continue;
      }

      await tx.billingInvoiceLine.create({
        data: {
          invoiceId,
          stripeInvoiceLineId: line.stripeInvoiceLineId,
          ...lineData,
        },
      });
    }
  }
}
