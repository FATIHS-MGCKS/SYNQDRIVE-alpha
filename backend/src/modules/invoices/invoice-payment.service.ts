import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityAction,
  ActivityEntity,
  InvoicePaymentMethod,
  InvoicePaymentSource,
  OrgInvoice,
} from '@prisma/client';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import { PrismaService } from '@shared/database/prisma.service';
import { canRecordPayment, isOutgoingInvoiceType } from './invoice-domain.util';
import type { RecordInvoicePaymentDto } from './dto';
import {
  computeInvoicePaymentState,
  invoicePaymentMethodLabel,
  resolvePaymentSource,
  validateInvoicePaymentAmount,
} from './invoice-payment.util';

export interface RecordInvoicePaymentCommand extends RecordInvoicePaymentDto {
  correlationId?: string;
  source?: InvoicePaymentSource;
}

export interface RecordInvoicePaymentResult {
  payment: {
    id: string;
    amountCents: number;
    currency: string;
    method: InvoicePaymentMethod;
    methodLabel: string;
    source: InvoicePaymentSource;
    paidAt: string;
    reference: string | null;
    note: string | null;
    providerTransactionId: string | null;
    idempotencyKey: string | null;
  };
  invoice: {
    id: string;
    status: string;
    paidCents: number;
    outstandingCents: number;
    paidAt: string | null;
    currency: string;
  };
  idempotentReplay: boolean;
}

@Injectable()
export class InvoicePaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async recordPayment(
    orgId: string,
    invoiceId: string,
    userId: string | null,
    command: RecordInvoicePaymentCommand,
  ): Promise<RecordInvoicePaymentResult> {
    const method = command.paymentMethod ?? command.method;
    if (!method) {
      throw new BadRequestException('paymentMethod is required');
    }

    if (command.idempotencyKey?.trim()) {
      const prior = await this.prisma.orgInvoicePayment.findFirst({
        where: {
          organizationId: orgId,
          idempotencyKey: command.idempotencyKey.trim(),
        },
      });
      if (prior) {
        if (prior.invoiceId !== invoiceId) {
          throw new BadRequestException(
            'Idempotency key already used for another invoice',
          );
        }
        return this.buildResultFromExisting(orgId, invoiceId, prior.id, true);
      }
    }

    if (command.providerTransactionId?.trim()) {
      const priorProvider = await this.prisma.orgInvoicePayment.findFirst({
        where: {
          organizationId: orgId,
          providerTransactionId: command.providerTransactionId.trim(),
        },
      });
      if (priorProvider) {
        if (priorProvider.invoiceId !== invoiceId) {
          throw new BadRequestException(
            'Provider transaction already recorded for another invoice',
          );
        }
        return this.buildResultFromExisting(
          orgId,
          invoiceId,
          priorProvider.id,
          true,
        );
      }
    }

    const invoice = await this.requireInvoice(invoiceId, orgId);
    if (!canRecordPayment(invoice.status)) {
      throw new BadRequestException(
        `Cannot record payment for status ${invoice.status}`,
      );
    }

    const currency = (command.currency ?? invoice.currency).toUpperCase();
    const outstanding = Math.max(0, invoice.totalCents - invoice.paidCents);
    const validation = validateInvoicePaymentAmount({
      amountCents: command.amountCents,
      currency,
      invoiceCurrency: invoice.currency,
      invoiceStatus: invoice.status,
      outstandingCents: outstanding,
    });
    if (!validation.ok) {
      throw new BadRequestException(validation.message);
    }

    const paidAt = command.paidAt ? new Date(command.paidAt) : new Date();
    const source = resolvePaymentSource({
      providerTransactionId: command.providerTransactionId,
      explicitSource: command.source,
    });

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.orgInvoicePayment.create({
        data: {
          organizationId: orgId,
          invoiceId,
          amountCents: command.amountCents,
          currency,
          method,
          source,
          paidAt,
          reference: command.reference?.trim() || null,
          note: command.note?.trim() || null,
          providerTransactionId: command.providerTransactionId?.trim() || null,
          idempotencyKey: command.idempotencyKey?.trim() || null,
          createdByUserId: userId,
        },
      });

      const newPaid = invoice.paidCents + command.amountCents;
      const newOutstanding = Math.max(0, invoice.totalCents - newPaid);
      const { status, paidAt: invoicePaidAt } = computeInvoicePaymentState({
        paidCents: newPaid,
        totalCents: invoice.totalCents,
        currentStatus: invoice.status,
        isOutgoing: isOutgoingInvoiceType(invoice.type),
        completingPaymentPaidAt: paidAt,
        previousPaidAt: invoice.paidAt,
        newOutstandingCents: newOutstanding,
      });

      await tx.orgInvoice.update({
        where: { id: invoiceId },
        data: {
          paidCents: newPaid,
          outstandingCents: newOutstanding,
          status,
          paidAt: invoicePaidAt,
        },
      });

      return created;
    });

    if (
      Math.max(0, invoice.totalCents - (invoice.paidCents + command.amountCents)) ===
      0
    ) {
      await this.closeLinkedTasks(invoiceId);
    }

    await this.activityLog.log({
      organizationId: orgId,
      userId: userId ?? undefined,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.INVOICE,
      entityId: invoiceId,
      description: `Zahlung erfasst: ${invoicePaymentMethodLabel(method)} ${(command.amountCents / 100).toFixed(2)} ${currency}`,
      metaJson: {
        paymentId: payment.id,
        amountCents: command.amountCents,
        currency,
        method,
        source,
        providerTransactionId: payment.providerTransactionId,
      },
    });

    return this.buildResultFromExisting(orgId, invoiceId, payment.id, false);
  }

  async recordFullBalancePayment(
    orgId: string,
    invoiceId: string,
    userId: string | null,
    paymentMethod: InvoicePaymentMethod,
    extras?: Pick<RecordInvoicePaymentCommand, 'paidAt' | 'note' | 'reference'>,
  ): Promise<RecordInvoicePaymentResult> {
    const invoice = await this.requireInvoice(invoiceId, orgId);
    const outstanding = Math.max(0, invoice.totalCents - invoice.paidCents);
    if (outstanding <= 0) {
      return this.buildResultFromExisting(orgId, invoiceId, null, false);
    }
    return this.recordPayment(orgId, invoiceId, userId, {
      amountCents: outstanding,
      currency: invoice.currency,
      paymentMethod,
      paidAt: extras?.paidAt,
      note: extras?.note,
      reference: extras?.reference,
    });
  }

  private async buildResultFromExisting(
    orgId: string,
    invoiceId: string,
    paymentId: string | null,
    idempotentReplay: boolean,
  ): Promise<RecordInvoicePaymentResult> {
    const invoice = await this.requireInvoice(invoiceId, orgId);
    const payment = paymentId
      ? await this.prisma.orgInvoicePayment.findFirst({
          where: { id: paymentId, organizationId: orgId, invoiceId },
        })
      : null;

    if (paymentId && !payment) {
      throw new NotFoundException('Payment not found');
    }

    return {
      payment: payment
        ? {
            id: payment.id,
            amountCents: payment.amountCents,
            currency: payment.currency,
            method: payment.method,
            methodLabel: invoicePaymentMethodLabel(payment.method),
            source: payment.source,
            paidAt: payment.paidAt.toISOString(),
            reference: payment.reference,
            note: payment.note,
            providerTransactionId: payment.providerTransactionId,
            idempotencyKey: payment.idempotencyKey,
          }
        : {
            id: '',
            amountCents: 0,
            currency: invoice.currency,
            method: InvoicePaymentMethod.OTHER,
            methodLabel: invoicePaymentMethodLabel(InvoicePaymentMethod.OTHER),
            source: InvoicePaymentSource.MANUAL,
            paidAt: invoice.paidAt?.toISOString() ?? new Date().toISOString(),
            reference: null,
            note: null,
            providerTransactionId: null,
            idempotencyKey: null,
          },
      invoice: {
        id: invoice.id,
        status: invoice.status,
        paidCents: invoice.paidCents,
        outstandingCents: invoice.outstandingCents,
        paidAt: invoice.paidAt?.toISOString() ?? null,
        currency: invoice.currency,
      },
      idempotentReplay,
    };
  }

  private async requireInvoice(
    invoiceId: string,
    orgId: string,
  ): Promise<OrgInvoice> {
    const invoice = await this.prisma.orgInvoice.findFirst({
      where: { id: invoiceId, organizationId: orgId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  private async closeLinkedTasks(invoiceId: string) {
    const tasks = await this.prisma.orgTask.findMany({
      where: { invoiceId, status: { not: 'DONE' } },
    });
    for (const task of tasks) {
      await this.prisma.orgTask.update({
        where: { id: task.id },
        data: { status: 'DONE', completedAt: new Date() },
      });
    }
  }
}
