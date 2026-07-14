import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityAction,
  ActivityEntity,
  BookingPaymentPurpose,
  BookingPaymentRequest,
  BookingPaymentRequestStatus,
  PaymentProvider,
  PaymentTransactionStatus,
  PaymentTransactionType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { PermissionActor } from '@shared/auth/permission.util';
import { derivePaymentStatus, isOutgoingInvoiceType } from '@modules/invoices/invoice-domain.util';
import {
  DepositRefundNotSupportedError,
  MissingStripeChargeError,
  PaymentRequestNotRefundableError,
  RefundExceedsRefundableDomainError,
  RefundIdempotencyKeyRequiredError,
} from './booking-payment-refund.errors';
import { PaymentFeeService } from './payment-fee.service';
import { PaymentsAccessService } from './payments-access.service';
import { OrganizationPaymentAccountService } from './organization-payment-account.service';
import { BookingPaymentRequestRepository } from './repositories/booking-payment-request.repository';
import { PaymentTransactionRepository } from './repositories/payment-transaction.repository';
import {
  calculateRefundableAmount,
  hasConfirmedCharge,
} from './payment-status.transitions';
import { STRIPE_CONNECT_ADAPTER } from './stripe/stripe-connect.adapter';
import type { StripeConnectAdapter } from './stripe/stripe-connect.adapter';
import { ConnectProviderError } from './stripe/stripe-connect.errors';
import { Inject } from '@nestjs/common';
import type { BookingPaymentRequestResult } from './booking-payment-request.service';

export interface RefundPaymentRequestInput {
  organizationId: string;
  paymentRequestId: string;
  actor: PermissionActor;
  idempotencyKey: string;
  amountCents?: number;
  reason: string;
}

export interface ApplyRefundLedgerInput {
  organizationId: string;
  paymentRequestId: string;
  refundAmountCents: number;
  applicationFeeRefundCents: number;
  currency: string;
  stripeRefundId: string;
  providerEventId: string;
  parentChargeTransactionId: string;
  reason?: string;
  actorUserId?: string | null;
}

type TxClient = Prisma.TransactionClient;

const REFUNDABLE_STATUSES: BookingPaymentRequestStatus[] = [
  BookingPaymentRequestStatus.PAID,
  BookingPaymentRequestStatus.PARTIALLY_REFUNDED,
];

@Injectable()
export class BookingPaymentRefundService {
  private readonly logger = new Logger(BookingPaymentRefundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsAccess: PaymentsAccessService,
    private readonly paymentFeeService: PaymentFeeService,
    private readonly paymentRequestRepository: BookingPaymentRequestRepository,
    private readonly paymentTransactionRepository: PaymentTransactionRepository,
    private readonly organizationPaymentAccountService: OrganizationPaymentAccountService,
    @Inject(STRIPE_CONNECT_ADAPTER)
    private readonly stripeConnectAdapter: StripeConnectAdapter,
  ) {}

  async refundPaymentRequest(
    input: RefundPaymentRequestInput,
  ): Promise<BookingPaymentRequestResult & {
    refundAmountCents: number;
    applicationFeeRefundCents: number;
    refundableAmountCents: number;
    stripeRefundId: string;
    idempotentReplay: boolean;
  }> {
    const idempotencyKey = input.idempotencyKey?.trim();
    if (!idempotencyKey) {
      throw new RefundIdempotencyKeyRequiredError();
    }

    await this.paymentsAccess.assertPaymentsFeatureEnabled(input.organizationId, input.actor);
    await this.paymentsAccess.assertPaymentPermission(
      input.organizationId,
      input.actor,
      'payments.refund',
    );

    const idemProviderEventId = this.buildIdempotencyProviderEventId(
      input.organizationId,
      idempotencyKey,
    );

    const existingIdem = await this.paymentTransactionRepository.findByProviderEvent(
      PaymentProvider.STRIPE,
      idemProviderEventId,
      PaymentTransactionType.REFUND,
    );
    if (existingIdem?.status === PaymentTransactionStatus.SUCCEEDED) {
      const request = await this.paymentRequestRepository.findById(
        input.organizationId,
        input.paymentRequestId,
      );
      if (!request) {
        throw new NotFoundException('Payment request not found');
      }
      const depositInfoCents = await this.loadDepositInfo(request.bookingId);
      const canViewFee = await this.canViewApplicationFee(input.organizationId, input.actor);
      const refundable = calculateRefundableAmount(request);
      const feeRefund = await this.findFeeRefundForRefund(idemProviderEventId);
      return {
        request,
        depositInfoCents,
        canViewFee,
        refundAmountCents: existingIdem.amountCents,
        applicationFeeRefundCents: feeRefund?.amountCents ?? 0,
        refundableAmountCents: refundable,
        stripeRefundId: existingIdem.providerObjectId ?? '',
        idempotentReplay: true,
      };
    }

    const reason = input.reason?.trim();
    if (!reason) {
      throw new PaymentRequestNotRefundableError('Refund reason is required');
    }

    if (input.amountCents != null && input.amountCents <= 0) {
      throw new RefundExceedsRefundableDomainError(input.amountCents, 0);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payment-refund:${input.paymentRequestId}`}))`;

      const request = await tx.bookingPaymentRequest.findFirst({
        where: { id: input.paymentRequestId, organizationId: input.organizationId },
      });
      if (!request) {
        throw new NotFoundException('Payment request not found');
      }

      this.assertRefundableRequest(request);

      if (request.purpose !== BookingPaymentPurpose.RENTAL_PAYMENT) {
        throw new DepositRefundNotSupportedError();
      }

      const refundable = calculateRefundableAmount(request);
      if (refundable <= 0) {
        throw new PaymentRequestNotRefundableError('No refundable amount remaining');
      }

      const refundAmountCents = input.amountCents ?? refundable;
      if (refundAmountCents > refundable) {
        throw new RefundExceedsRefundableDomainError(refundAmountCents, refundable);
      }

      if (!request.stripePaymentIntentId) {
        throw new MissingStripeChargeError();
      }
      if (!request.stripeConnectedAccountId) {
        throw new MissingStripeChargeError();
      }

      const account = await this.organizationPaymentAccountService.findByOrganization(
        input.organizationId,
      );
      if (
        account?.stripeConnectedAccountId
        && account.stripeConnectedAccountId !== request.stripeConnectedAccountId
      ) {
        throw new PaymentRequestNotRefundableError('Connected account mismatch');
      }

      const transactions = await tx.paymentTransaction.findMany({
        where: { paymentRequestId: request.id, organizationId: request.organizationId },
      });

      if (!hasConfirmedCharge(transactions)) {
        throw new PaymentRequestNotRefundableError('No confirmed charge to refund');
      }

      const chargeTx = transactions.find(
        (row) =>
          row.type === PaymentTransactionType.CHARGE
          && row.status === PaymentTransactionStatus.SUCCEEDED,
      );
      if (!chargeTx) {
        throw new MissingStripeChargeError();
      }

      const feeAdjustment = this.paymentFeeService.calculateRefundFee(
        {
          applicationFeeAmountCents: request.applicationFeeAmountCents ?? 0,
          rentalPaymentAmountCents: request.amountCents,
        },
        refundAmountCents,
        request.refundedAmountCents,
        request.paidAmountCents,
      );

      let stripeRefund;
      try {
        stripeRefund = await this.stripeConnectAdapter.createRefund({
          connectedAccountId: request.stripeConnectedAccountId,
          paymentIntentId: request.stripePaymentIntentId,
          chargeId: request.stripeChargeId,
          amountCents: refundAmountCents,
          refundApplicationFee: feeAdjustment.applicationFeeRefundCents > 0,
          reason: 'requested_by_customer',
          stripeIdempotencyKey: idempotencyKey,
        });
      } catch (error) {
        if (error instanceof ConnectProviderError) {
          throw new PaymentRequestNotRefundableError(
            `Stripe refund failed: ${error.message}`,
          );
        }
        throw error;
      }

      if (request.stripeLivemode != null && request.stripeLivemode !== stripeRefund.livemode) {
        throw new PaymentRequestNotRefundableError('Stripe livemode mismatch');
      }

      const updatedRequest = await this.applyRefundLedgerInTx(tx, {
        organizationId: input.organizationId,
        paymentRequestId: request.id,
        refundAmountCents,
        applicationFeeRefundCents: feeAdjustment.applicationFeeRefundCents,
        currency: request.currency,
        stripeRefundId: stripeRefund.refundId,
        providerEventId: idemProviderEventId,
        parentChargeTransactionId: chargeTx.id,
        reason,
        actorUserId: input.actor.id ?? null,
      });

      const depositInfoCents = await this.loadDepositInfo(updatedRequest.bookingId);
      const canViewFee = await this.canViewApplicationFee(input.organizationId, input.actor);

      return {
        request: updatedRequest,
        depositInfoCents,
        canViewFee,
        refundAmountCents,
        applicationFeeRefundCents: feeAdjustment.applicationFeeRefundCents,
        refundableAmountCents: calculateRefundableAmount(updatedRequest),
        stripeRefundId: stripeRefund.refundId,
        idempotentReplay: false,
      };
    });
  }

  async applyRefundLedgerInTx(
    tx: TxClient,
    input: ApplyRefundLedgerInput,
  ): Promise<BookingPaymentRequest> {
    const existingRefund = await tx.paymentTransaction.findUnique({
      where: {
        provider_providerEventId_type: {
          provider: PaymentProvider.STRIPE,
          providerEventId: input.providerEventId,
          type: PaymentTransactionType.REFUND,
        },
      },
    });
    if (existingRefund?.status === PaymentTransactionStatus.SUCCEEDED) {
      return tx.bookingPaymentRequest.findUniqueOrThrow({
        where: { id: input.paymentRequestId },
      });
    }

    const request = await tx.bookingPaymentRequest.findUniqueOrThrow({
      where: { id: input.paymentRequestId },
    });

    const refundTx = await tx.paymentTransaction.create({
      data: {
        organizationId: input.organizationId,
        paymentRequestId: input.paymentRequestId,
        type: PaymentTransactionType.REFUND,
        status: PaymentTransactionStatus.SUCCEEDED,
        amountCents: input.refundAmountCents,
        currency: input.currency,
        provider: PaymentProvider.STRIPE,
        providerObjectType: 'refund',
        providerObjectId: input.stripeRefundId,
        providerEventId: input.providerEventId,
        parentTransactionId: input.parentChargeTransactionId,
        balanceImpactCents: -input.refundAmountCents,
        applicationFeeImpactCents: 0,
        occurredAt: new Date(),
        metadata: {
          reason: input.reason ?? null,
          actorUserId: input.actorUserId ?? null,
        },
      },
    });

    if (input.applicationFeeRefundCents > 0) {
      const feeParent = await tx.paymentTransaction.findFirst({
        where: {
          paymentRequestId: input.paymentRequestId,
          type: PaymentTransactionType.APPLICATION_FEE,
          status: PaymentTransactionStatus.SUCCEEDED,
        },
      });

      await tx.paymentTransaction.create({
        data: {
          organizationId: input.organizationId,
          paymentRequestId: input.paymentRequestId,
          type: PaymentTransactionType.REFUND_APPLICATION_FEE,
          status: PaymentTransactionStatus.SUCCEEDED,
          amountCents: input.applicationFeeRefundCents,
          currency: input.currency,
          provider: PaymentProvider.STRIPE,
          providerObjectType: 'refund',
          providerObjectId: input.stripeRefundId,
          providerEventId: `${input.providerEventId}:fee`,
          parentTransactionId: feeParent?.id ?? input.parentChargeTransactionId,
          balanceImpactCents: 0,
          applicationFeeImpactCents: -input.applicationFeeRefundCents,
          occurredAt: new Date(),
        },
      });
    }

    const newRefundedTotal = request.refundedAmountCents + input.refundAmountCents;
    const isFullRefund = newRefundedTotal >= request.paidAmountCents;
    const toStatus = isFullRefund
      ? BookingPaymentRequestStatus.REFUNDED
      : BookingPaymentRequestStatus.PARTIALLY_REFUNDED;

    const allTransactions = await tx.paymentTransaction.findMany({
      where: { paymentRequestId: request.id, organizationId: request.organizationId },
    });

    const transitionResult = await this.transitionRequestInTx(
      tx,
      request,
      toStatus,
      input.refundAmountCents,
      allTransactions.map((row) => ({
        type: row.type,
        status: row.status,
        amountCents: row.amountCents,
      })),
    );

    if (request.invoiceId) {
      await this.adjustInvoiceForRefundInTx(tx, {
        organizationId: input.organizationId,
        invoiceId: request.invoiceId,
        refundAmountCents: input.refundAmountCents,
      });
    }

    await this.syncBookingPaymentSummary(tx, request.organizationId, request.bookingId);

    await this.writeAuditLog(tx, {
      organizationId: input.organizationId,
      entityId: request.id,
      description: `Refund recorded for payment request ${request.id}`,
      changeSummary: `refund=${input.refundAmountCents}${input.currency};fee=${input.applicationFeeRefundCents};stripe=${input.stripeRefundId}`,
      metaJson: {
        refundTransactionId: refundTx.id,
        stripeRefundId: input.stripeRefundId,
        refundAmountCents: input.refundAmountCents,
        applicationFeeRefundCents: input.applicationFeeRefundCents,
        reason: input.reason ?? null,
      },
    });

    return transitionResult;
  }

  private assertRefundableRequest(request: BookingPaymentRequest): void {
    if (!REFUNDABLE_STATUSES.includes(request.status)) {
      throw new PaymentRequestNotRefundableError(
        `Payment request status ${request.status} is not refundable`,
      );
    }
  }

  private buildIdempotencyProviderEventId(organizationId: string, idempotencyKey: string): string {
    return `refund-idem:${organizationId}:${idempotencyKey}`;
  }

  private async findFeeRefundForRefund(refundProviderEventId: string) {
    return this.prisma.paymentTransaction.findUnique({
      where: {
        provider_providerEventId_type: {
          provider: PaymentProvider.STRIPE,
          providerEventId: `${refundProviderEventId}:fee`,
          type: PaymentTransactionType.REFUND_APPLICATION_FEE,
        },
      },
    });
  }

  private async canViewApplicationFee(
    organizationId: string,
    actor: PermissionActor,
  ): Promise<boolean> {
    if (actor.platformRole === 'MASTER_ADMIN' || actor.membershipRole === 'ORG_ADMIN') {
      return true;
    }
    try {
      await this.paymentsAccess.assertPaymentPermission(
        organizationId,
        actor,
        'payments.settings.manage',
      );
      return true;
    } catch {
      return false;
    }
  }

  private async loadDepositInfo(bookingId: string): Promise<number> {
    const snapshot = await this.prisma.bookingPriceSnapshot.findFirst({
      where: { bookingId },
      select: { depositAmountCents: true },
    });
    return snapshot?.depositAmountCents ?? 0;
  }

  private async transitionRequestInTx(
    tx: TxClient,
    request: BookingPaymentRequest,
    toStatus: BookingPaymentRequestStatus,
    refundAmountCents: number,
    transactions: { type: PaymentTransactionType; status: PaymentTransactionStatus; amountCents: number }[],
  ): Promise<BookingPaymentRequest> {
    const { applyTransition } = await import('./payment-status.transitions');
    const patch = applyTransition(
      request.status,
      toStatus,
      {
        request: {
          status: request.status,
          amountCents: request.amountCents,
          paidAmountCents: request.paidAmountCents,
          refundedAmountCents: request.refundedAmountCents,
        },
        transactions,
        refundAmountCents,
      },
      new Date(),
    );

    return tx.bookingPaymentRequest.update({
      where: { id: request.id },
      data: {
        status: patch.status,
        refundedAmountCents: patch.refundedAmountCents ?? request.refundedAmountCents,
        version: request.version + 1,
      },
    });
  }

  private async adjustInvoiceForRefundInTx(
    tx: TxClient,
    input: { organizationId: string; invoiceId: string; refundAmountCents: number },
  ): Promise<void> {
    const invoice = await tx.orgInvoice.findFirst({
      where: { id: input.invoiceId, organizationId: input.organizationId },
    });
    if (!invoice) {
      return;
    }

    const newPaid = Math.max(0, invoice.paidCents - input.refundAmountCents);
    const newOutstanding = Math.max(0, invoice.totalCents - newPaid);
    const newStatus = derivePaymentStatus(
      newPaid,
      invoice.totalCents,
      invoice.status,
      isOutgoingInvoiceType(invoice.type),
    );

    await tx.orgInvoice.update({
      where: { id: invoice.id },
      data: {
        paidCents: newPaid,
        outstandingCents: newOutstanding,
        status: newStatus,
        paidAt: newOutstanding === 0 ? invoice.paidAt : null,
      },
    });
  }

  private async syncBookingPaymentSummary(
    tx: TxClient,
    organizationId: string,
    bookingId: string,
  ): Promise<void> {
    const { deriveBookingPaymentStatus } = await import('./payment-status.transitions');
    const requests = await tx.bookingPaymentRequest.findMany({
      where: { organizationId, bookingId },
      select: {
        status: true,
        amountCents: true,
        paidAmountCents: true,
        refundedAmountCents: true,
      },
    });
    const derived = deriveBookingPaymentStatus(requests);
    await tx.booking.update({
      where: { id: bookingId },
      data: { paymentStatus: derived },
    });
  }

  private async writeAuditLog(
    tx: TxClient,
    input: {
      organizationId: string;
      entityId: string;
      description: string;
      changeSummary: string;
      metaJson: Record<string, unknown>;
    },
  ): Promise<void> {
    await tx.activityLog.create({
      data: {
        organizationId: input.organizationId,
        action: ActivityAction.SYNC,
        entity: ActivityEntity.INVOICE,
        entityId: input.entityId,
        description: input.description,
        changeSummary: input.changeSummary,
        level: 'INFO',
        metaJson: input.metaJson as Prisma.InputJsonValue,
      },
    });
  }
}
