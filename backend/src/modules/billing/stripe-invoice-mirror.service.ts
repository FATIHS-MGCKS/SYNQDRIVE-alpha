import { Injectable, Logger } from '@nestjs/common';
import { BillingSubscription, InvoiceStatus } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '@shared/database/prisma.service';
import { mapStripeInvoiceStatus } from './stripe-status.mapper';

@Injectable()
export class StripeInvoiceMirrorService {
  private readonly logger = new Logger(StripeInvoiceMirrorService.name);

  constructor(private readonly prisma: PrismaService) {}

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

  async mirrorStripeInvoice(invoice: Stripe.Invoice): Promise<string | null> {
    if (!invoice.id) return null;

    const subscription = await this.findSubscriptionForStripeInvoice(invoice);
    if (!subscription) {
      this.logger.warn(
        `Skipping invoice mirror ${invoice.id}: no local subscription mapping`,
      );
      return null;
    }

    const status = mapStripeInvoiceStatus(invoice.status) as InvoiceStatus;
    const amountCents = invoice.total ?? invoice.amount_due ?? 0;
    const currency = (invoice.currency || 'eur').toLowerCase();
    const invoiceDate = invoice.created
      ? new Date(invoice.created * 1000)
      : new Date();
    const dueDate = invoice.due_date ? new Date(invoice.due_date * 1000) : null;
    const paidAt = invoice.status_transitions?.paid_at
      ? new Date(invoice.status_transitions.paid_at * 1000)
      : null;
    const periodStart = invoice.period_start
      ? new Date(invoice.period_start * 1000)
      : null;
    const periodEnd = invoice.period_end ? new Date(invoice.period_end * 1000) : null;

    const lines = (invoice.lines?.data ?? []).map((line) => ({
      description: line.description || line.plan?.nickname || 'Subscription',
      quantity: line.quantity ?? 1,
      unitAmountCents: line.price?.unit_amount ?? null,
      subtotalCents: line.amount ?? 0,
      taxRateBps: null,
      taxCents: null,
      totalCents: line.amount ?? 0,
      periodStart,
      periodEnd,
    }));

    const existing = await this.prisma.billingInvoice.findUnique({
      where: { stripeInvoiceId: invoice.id },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.$transaction(async (tx) => {
        await tx.billingInvoice.update({
          where: { id: existing.id },
          data: {
            amountCents,
            currency,
            status,
            invoiceDate,
            dueDate,
            paidAt,
            invoicePdfUrl: invoice.invoice_pdf ?? null,
          },
        });
        await tx.billingInvoiceLine.deleteMany({ where: { invoiceId: existing.id } });
        if (lines.length) {
          await tx.billingInvoiceLine.createMany({
            data: lines.map((line) => ({
              invoiceId: existing.id,
              description: line.description,
              quantity: line.quantity,
              unitAmountCents: line.unitAmountCents,
              subtotalCents: line.subtotalCents,
              taxRateBps: line.taxRateBps,
              taxCents: line.taxCents,
              totalCents: line.totalCents,
              periodStart: line.periodStart,
              periodEnd: line.periodEnd,
            })),
          });
        }
      });
      return existing.id;
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.billingInvoice.create({
        data: {
          subscriptionId: subscription.id,
          stripeInvoiceId: invoice.id,
          amountCents,
          currency,
          status,
          invoiceDate,
          dueDate,
          paidAt,
          invoicePdfUrl: invoice.invoice_pdf ?? null,
        },
      });
      if (lines.length) {
        await tx.billingInvoiceLine.createMany({
          data: lines.map((line) => ({
            invoiceId: row.id,
            description: line.description,
            quantity: line.quantity,
            unitAmountCents: line.unitAmountCents,
            subtotalCents: line.subtotalCents,
            taxRateBps: line.taxRateBps,
            taxCents: line.taxCents,
            totalCents: line.totalCents,
            periodStart: line.periodStart,
            periodEnd: line.periodEnd,
          })),
        });
      }
      return row;
    });

    return created.id;
  }
}
