import { Injectable, Logger } from '@nestjs/common';
import {
  BillingCreditNoteStatus,
  BillingPaymentAttemptStatus,
  BillingPaymentStatus,
  BillingRefundStatus,
  BillingStripeMode,
} from '@prisma/client';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { BillingPaymentLedgerService } from './billing-payment-ledger.service';
import { mapStripeDisputeStatus, isDisputeClosedStatus } from './domain/stripe-webhook-matrix';
import { mapStripePaymentIntentToDomainStatus } from './domain/mappers/stripe-payment-status.mapper';
import { PaymentStatusDomain } from './domain/billing-domain.types';
import { resolveStripeModeFromSecretKey } from './migration/billing-legacy-backfill.util';
import { BillingDomainEventOutboxService } from './billing-domain-event-outbox.service';
import { BillingDomainEventType } from './domain/billing-domain.events';

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

function mapAttemptStatus(status: PaymentStatusDomain): BillingPaymentAttemptStatus {
  switch (status) {
    case PaymentStatusDomain.SUCCEEDED:
      return BillingPaymentAttemptStatus.SUCCEEDED;
    case PaymentStatusDomain.FAILED:
      return BillingPaymentAttemptStatus.FAILED;
    default:
      return BillingPaymentAttemptStatus.PENDING;
  }
}

function readCreditNoteHostedUrl(creditNote: Stripe.CreditNote): string | null {
  const extended = creditNote as Stripe.CreditNote & {
    hosted_credit_note_url?: string | null;
  };
  return extended.hosted_credit_note_url ?? null;
}

@Injectable()
export class StripePaymentLedgerService {
  private readonly logger = new Logger(StripePaymentLedgerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly ledger: BillingPaymentLedgerService,
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
        include: { subscription: { select: { organizationId: true } } },
      });
      if (byStripe) return byStripe;
    }

    if (!input.stripeCustomerId) {
      return null;
    }

    const subscription = await this.prisma.billingSubscription.findFirst({
      where: { stripeCustomerId: input.stripeCustomerId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, organizationId: true },
    });
    if (!subscription) return null;

    return this.prisma.billingInvoice.findFirst({
      where: { subscriptionId: subscription.id },
      orderBy: { createdAt: 'desc' },
      include: { subscription: { select: { organizationId: true } } },
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
    const prismaStatus = mapPaymentStatusToPrisma(domainStatus);
    const amountCents = paymentIntent.amount_received || paymentIntent.amount || 0;
    const currency = (paymentIntent.currency || invoice.currency || 'eur').toLowerCase();
    const latestChargeId = readId(paymentIntent.latest_charge);
    const paymentMethodId = readId(paymentIntent.payment_method);

    const payment = await this.ledger.recordPayment({
      invoiceId: invoice.id,
      organizationId,
      amountCents,
      currency,
      status: prismaStatus,
      stripePaymentIntentId: paymentIntent.id,
      stripeChargeId: latestChargeId,
      stripePaymentMethodId: paymentMethodId,
      stripeMode,
      succeededAt: prismaStatus === BillingPaymentStatus.SUCCEEDED ? new Date() : null,
      failedAt: prismaStatus === BillingPaymentStatus.FAILED ? new Date() : null,
      idempotencyKey: `stripe-webhook:${stripeEventId}:payment:${paymentIntent.id}`,
    });

    if (latestChargeId) {
      await this.ledger.appendPaymentAttempt({
        paymentId: payment.id,
        organizationId,
        amountCents,
        status: mapAttemptStatus(domainStatus),
        stripeChargeId: latestChargeId,
        stripeMode,
        errorCode: paymentIntent.last_payment_error?.code ?? null,
        declineCode: paymentIntent.last_payment_error?.decline_code ?? null,
        errorMessage: paymentIntent.last_payment_error?.message ?? null,
        nextRetryAt: paymentIntent.next_action?.type
          ? new Date(Date.now() + 24 * 60 * 60 * 1000)
          : null,
        idempotencyKey: `stripe-webhook:${stripeEventId}:attempt:${latestChargeId}`,
      });
    }

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
      const result = await this.ledger.recordRefund({
        paymentId: payment.id,
        organizationId,
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
        refundedAt: refund.created ? new Date(refund.created * 1000) : null,
        idempotencyKey: `stripe-webhook:${stripeEventId}:refund:${refund.id}`,
      });
      if (!result.duplicate) {
        mirrored += 1;
      }
    }

    await this.ledger.reconcilePaymentRefundState(payment.id);
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

    const result = await this.ledger.recordCreditNote({
      invoiceId: invoice.id,
      organizationId,
      amountCents: creditNote.total ?? creditNote.amount ?? 0,
      currency: (creditNote.currency || invoice.currency || 'eur').toLowerCase(),
      status,
      reason: creditNote.reason ?? null,
      stripeCreditNoteId: creditNote.id,
      stripeMode,
      hostedUrl: readCreditNoteHostedUrl(creditNote),
      pdfUrl: creditNote.pdf ?? null,
      issuedAt:
        creditNote.status === 'issued' && creditNote.created
          ? new Date(creditNote.created * 1000)
          : null,
      voidedAt:
        creditNote.status === 'void' && creditNote.created
          ? new Date(creditNote.created * 1000)
          : null,
      idempotencyKey: `stripe-webhook:${stripeEventId}:credit_note:${creditNote.id}`,
    });

    return result.creditNote.id;
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
