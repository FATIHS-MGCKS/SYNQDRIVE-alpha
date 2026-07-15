import { Injectable, Logger } from '@nestjs/common';
import {
  BillingCreditNoteStatus,
  BillingPaymentAttemptStatus,
  BillingPaymentStatus,
  BillingRefundStatus,
  BillingStripeMode,
  Prisma,
} from '@prisma/client';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { BillingDomainEventOutboxService } from './billing-domain-event-outbox.service';
import { BillingDomainEventType } from './domain/billing-domain.events';
import { mapStripeDisputeStatus, isDisputeClosedStatus } from './domain/stripe-webhook-matrix';
import { mapStripePaymentIntentToDomainStatus } from './domain/mappers/stripe-payment-status.mapper';
import { PaymentStatusDomain } from './domain/billing-domain.types';
import { resolveStripeModeFromSecretKey } from './migration/billing-legacy-backfill.util';

function readId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id ?? null;
}

function mapPaymentStatusToPrisma(status: PaymentStatusDomain): BillingPaymentStatus {
  switch (status) {
    case PaymentStatusDomain.SUCCEEDED:
      return BillingPaymentStatus.SUCCEEDED;
    case PaymentStatusDomain.FAILED:
      return BillingPaymentStatus.FAILED;
    case PaymentStatusDomain.REFUNDED:
      return BillingPaymentStatus.REFUNDED;
    case PaymentStatusDomain.PARTIALLY_REFUNDED:
      return BillingPaymentStatus.PARTIALLY_REFUNDED;
    default:
      return BillingPaymentStatus.PENDING;
  }
}

@Injectable()
export class StripePaymentLedgerService {
  private readonly logger = new Logger(StripePaymentLedgerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly outbox: BillingDomainEventOutboxService,
  ) {}

  private resolveStripeMode(livemode?: boolean | null): BillingStripeMode {
    const fromKey = resolveStripeModeFromSecretKey(
      this.configService.get<string>('stripe.secretKey'),
    );
    if (fromKey) return fromKey;
    return livemode ? BillingStripeMode.LIVE : BillingStripeMode.TEST;
  }

  private async findInvoiceForStripeReference(input: {
    stripeInvoiceId?: string | null;
    stripeCustomerId?: string | null;
    stripeMode: BillingStripeMode;
  }) {
    if (input.stripeInvoiceId) {
      const byStripe = await this.prisma.billingInvoice.findUnique({
        where: {
          stripeInvoiceId_stripeMode: {
            stripeInvoiceId: input.stripeInvoiceId,
            stripeMode: input.stripeMode,
          },
        },
      });
      if (byStripe) return byStripe;
    }

    if (!input.stripeCustomerId) {
      return null;
    }

    const subscription = await this.prisma.billingSubscription.findFirst({
      where: { stripeCustomerId: input.stripeCustomerId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    if (!subscription) return null;

    return this.prisma.billingInvoice.findFirst({
      where: { subscriptionId: subscription.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async mirrorPaymentIntent(
    paymentIntent: Stripe.PaymentIntent,
    organizationId: string,
    stripeEventId: string,
  ): Promise<string | null> {
    if (!paymentIntent.id) return null;

    const stripeMode = this.resolveStripeMode(paymentIntent.livemode);
    const stripeInvoiceId = readId(paymentIntent.invoice);
    const stripeCustomerId = readId(paymentIntent.customer);
    const invoice = await this.findInvoiceForStripeReference({
      stripeInvoiceId,
      stripeCustomerId,
      stripeMode,
    });

    if (!invoice) {
      this.logger.warn(
        `Skipping payment intent mirror ${paymentIntent.id}: no local invoice mapping`,
      );
      return null;
    }

    const domainStatus = mapStripePaymentIntentToDomainStatus(paymentIntent.status);
    const amountCents = paymentIntent.amount_received || paymentIntent.amount || 0;
    const currency = (paymentIntent.currency || invoice.currency || 'eur').toLowerCase();
    const latestChargeId = readId(paymentIntent.latest_charge);

    const payment = await this.prisma.$transaction(async (tx) => {
      const row = await tx.billingPayment.upsert({
        where: {
          stripePaymentIntentId_stripeMode: {
            stripePaymentIntentId: paymentIntent.id,
            stripeMode,
          },
        },
        create: {
          invoiceId: invoice.id,
          amountCents,
          currency,
          status: mapPaymentStatusToPrisma(domainStatus),
          stripePaymentIntentId: paymentIntent.id,
          stripeChargeId: latestChargeId,
          stripeMode,
          attemptCount: 1,
        },
        update: {
          amountCents,
          currency,
          status: mapPaymentStatusToPrisma(domainStatus),
          stripeChargeId: latestChargeId ?? undefined,
          attemptCount: { increment: paymentIntent.status === 'requires_payment_method' ? 0 : 1 },
        },
      });

      const attemptStatus =
        domainStatus === PaymentStatusDomain.SUCCEEDED
          ? BillingPaymentAttemptStatus.SUCCEEDED
          : domainStatus === PaymentStatusDomain.FAILED
            ? BillingPaymentAttemptStatus.FAILED
            : BillingPaymentAttemptStatus.PENDING;

      if (latestChargeId) {
        await tx.billingPaymentAttempt.upsert({
          where: {
            stripeChargeId_stripeMode: {
              stripeChargeId: latestChargeId,
              stripeMode,
            },
          },
          create: {
            paymentId: row.id,
            attemptNumber: row.attemptCount,
            amountCents,
            status: attemptStatus,
            stripeChargeId: latestChargeId,
            stripeMode,
            errorCode: paymentIntent.last_payment_error?.code ?? null,
            errorMessage: paymentIntent.last_payment_error?.message ?? null,
          },
          update: {
            status: attemptStatus,
            errorCode: paymentIntent.last_payment_error?.code ?? null,
            errorMessage: paymentIntent.last_payment_error?.message ?? null,
          },
        });
      }

      await this.outbox.enqueue(tx, {
        eventType: BillingDomainEventType.PAYMENT_RECORDED,
        aggregateType: 'BillingPayment',
        aggregateId: row.id,
        idempotencyKey: `stripe-webhook:${stripeEventId}:payment:${paymentIntent.id}`,
        payload: {
          organizationId,
          paymentId: row.id,
          invoiceId: invoice.id,
          stripePaymentIntentId: paymentIntent.id,
          status: row.status,
          amountCents,
        },
      });

      return row;
    });

    return payment.id;
  }

  async mirrorChargeRefunded(
    charge: Stripe.Charge,
    organizationId: string,
    stripeEventId: string,
  ): Promise<number> {
    const stripeMode = this.resolveStripeMode(charge.livemode);
    const stripePaymentIntentId = readId(charge.payment_intent);
    const payment = stripePaymentIntentId
      ? await this.prisma.billingPayment.findUnique({
          where: {
            stripePaymentIntentId_stripeMode: {
              stripePaymentIntentId,
              stripeMode,
            },
          },
        })
      : await this.prisma.billingPayment.findFirst({
          where: {
            stripeChargeId: charge.id,
            stripeMode,
          },
        });

    if (!payment) {
      this.logger.warn(`Skipping charge refund mirror ${charge.id}: payment not found`);
      return 0;
    }

    const refunds = charge.refunds?.data ?? [];
    let mirrored = 0;

    for (const refund of refunds) {
      if (!refund.id) continue;
      await this.prisma.$transaction(async (tx) => {
        const row = await tx.billingRefund.upsert({
          where: {
            stripeRefundId_stripeMode: {
              stripeRefundId: refund.id,
              stripeMode,
            },
          },
          create: {
            paymentId: payment.id,
            invoiceId: payment.invoiceId,
            amountCents: refund.amount ?? 0,
            currency: (refund.currency || payment.currency || 'eur').toLowerCase(),
            status:
              refund.status === 'succeeded'
                ? BillingRefundStatus.SUCCEEDED
                : refund.status === 'failed'
                  ? BillingRefundStatus.FAILED
                  : refund.status === 'canceled'
                    ? BillingRefundStatus.CANCELLED
                    : BillingRefundStatus.PENDING,
            reason: refund.reason ?? null,
            stripeRefundId: refund.id,
            stripeMode,
          },
          update: {
            amountCents: refund.amount ?? 0,
            status:
              refund.status === 'succeeded'
                ? BillingRefundStatus.SUCCEEDED
                : refund.status === 'failed'
                  ? BillingRefundStatus.FAILED
                  : refund.status === 'canceled'
                    ? BillingRefundStatus.CANCELLED
                    : BillingRefundStatus.PENDING,
            reason: refund.reason ?? null,
          },
        });

        await this.outbox.enqueue(tx, {
          eventType: BillingDomainEventType.REFUND_RECORDED,
          aggregateType: 'BillingRefund',
          aggregateId: row.id,
          idempotencyKey: `stripe-webhook:${stripeEventId}:refund:${refund.id}`,
          payload: {
            organizationId,
            refundId: row.id,
            paymentId: payment.id,
            stripeRefundId: refund.id,
            amountCents: row.amountCents,
          },
        });
      });
      mirrored += 1;
    }

    const refundedAmount = charge.amount_refunded ?? 0;
    if (refundedAmount > 0) {
      const nextStatus =
        refundedAmount >= (charge.amount ?? 0)
          ? BillingPaymentStatus.REFUNDED
          : BillingPaymentStatus.PARTIALLY_REFUNDED;
      await this.prisma.billingPayment.update({
        where: { id: payment.id },
        data: { status: nextStatus },
      });
    }

    return mirrored;
  }

  async mirrorCreditNote(
    creditNote: Stripe.CreditNote,
    organizationId: string,
    stripeEventId: string,
  ): Promise<string | null> {
    if (!creditNote.id) return null;

    const stripeMode = this.resolveStripeMode(creditNote.livemode);
    const stripeInvoiceId = readId(creditNote.invoice);
    if (!stripeInvoiceId) return null;

    const invoice = await this.prisma.billingInvoice.findUnique({
      where: {
        stripeInvoiceId_stripeMode: {
          stripeInvoiceId,
          stripeMode,
        },
      },
    });
    if (!invoice) {
      this.logger.warn(`Skipping credit note mirror ${creditNote.id}: invoice not found`);
      return null;
    }

    const status =
      creditNote.status === 'void'
        ? BillingCreditNoteStatus.VOID
        : creditNote.status === 'issued'
          ? BillingCreditNoteStatus.ISSUED
          : BillingCreditNoteStatus.DRAFT;

    const row = await this.prisma.$transaction(async (tx) => {
      const note = await tx.billingCreditNote.upsert({
        where: {
          stripeCreditNoteId_stripeMode: {
            stripeCreditNoteId: creditNote.id,
            stripeMode,
          },
        },
        create: {
          invoiceId: invoice.id,
          amountCents: creditNote.total ?? creditNote.amount ?? 0,
          currency: (creditNote.currency || invoice.currency || 'eur').toLowerCase(),
          status,
          reason: creditNote.reason ?? null,
          stripeCreditNoteId: creditNote.id,
          stripeMode,
        },
        update: {
          amountCents: creditNote.total ?? creditNote.amount ?? 0,
          status,
          reason: creditNote.reason ?? null,
        },
      });

      await this.outbox.enqueue(tx, {
        eventType: BillingDomainEventType.CREDIT_NOTE_RECORDED,
        aggregateType: 'BillingCreditNote',
        aggregateId: note.id,
        idempotencyKey: `stripe-webhook:${stripeEventId}:credit_note:${creditNote.id}`,
        payload: {
          organizationId,
          creditNoteId: note.id,
          invoiceId: invoice.id,
          stripeCreditNoteId: creditNote.id,
          amountCents: note.amountCents,
        },
      });

      return note;
    });

    return row.id;
  }

  async mirrorDispute(
    dispute: Stripe.Dispute,
    organizationId: string,
    stripeEventId: string,
    eventType: 'charge.dispute.created' | 'charge.dispute.closed',
  ): Promise<string | null> {
    if (!dispute.id) return null;

    const stripeMode = this.resolveStripeMode(dispute.livemode);
    const stripeChargeId = readId(dispute.charge);
    const payment = stripeChargeId
      ? await this.prisma.billingPayment.findFirst({
          where: { stripeChargeId, stripeMode },
        })
      : null;

    const mappedStatus = mapStripeDisputeStatus(dispute.status);
    const closedAt =
      eventType === 'charge.dispute.closed' || isDisputeClosedStatus(mappedStatus)
        ? new Date()
        : null;

    const row = await this.prisma.$transaction(async (tx) => {
      const existing = dispute.id
        ? await tx.billingDispute.findUnique({
            where: {
              stripeDisputeId_stripeMode: {
                stripeDisputeId: dispute.id,
                stripeMode,
              },
            },
          })
        : null;

      const note = await tx.billingDispute.upsert({
        where: {
          stripeDisputeId_stripeMode: {
            stripeDisputeId: dispute.id,
            stripeMode,
          },
        },
        create: {
          organizationId,
          paymentId: payment?.id ?? null,
          invoiceId: payment?.invoiceId ?? null,
          amountCents: dispute.amount ?? 0,
          currency: (dispute.currency || payment?.currency || 'eur').toLowerCase(),
          status: mappedStatus,
          reason: dispute.reason ?? null,
          stripeDisputeId: dispute.id,
          stripeChargeId,
          stripeMode,
          openedAt: existing?.openedAt ?? new Date(dispute.created * 1000),
          closedAt,
        },
        update: {
          paymentId: payment?.id ?? undefined,
          invoiceId: payment?.invoiceId ?? undefined,
          amountCents: dispute.amount ?? 0,
          status: mappedStatus,
          reason: dispute.reason ?? null,
          closedAt: closedAt ?? undefined,
        },
      });

      await this.outbox.enqueue(tx, {
        eventType:
          eventType === 'charge.dispute.closed'
            ? BillingDomainEventType.DISPUTE_CLOSED
            : BillingDomainEventType.DISPUTE_OPENED,
        aggregateType: 'BillingDispute',
        aggregateId: note.id,
        idempotencyKey: `stripe-webhook:${stripeEventId}:dispute:${dispute.id}:${eventType}`,
        payload: {
          organizationId,
          disputeId: note.id,
          stripeDisputeId: dispute.id,
          status: note.status,
          amountCents: note.amountCents,
        },
      });

      return note;
    });

    return row.id;
  }
}
