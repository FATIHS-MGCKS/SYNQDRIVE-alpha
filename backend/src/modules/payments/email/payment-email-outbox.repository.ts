import { Injectable } from '@nestjs/common';
import {
  PaymentEmailOutboxStatus,
  PaymentEmailType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export interface CreatePaymentEmailOutboxInput {
  organizationId: string;
  paymentRequestId: string;
  emailType: PaymentEmailType;
  idempotencyKey: string;
  sentByUserId?: string | null;
  availableAt?: Date;
}

@Injectable()
export class PaymentEmailOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createEntryIdempotent(input: CreatePaymentEmailOutboxInput) {
    try {
      return await this.prisma.paymentEmailOutbox.create({
        data: {
          organizationId: input.organizationId,
          paymentRequestId: input.paymentRequestId,
          emailType: input.emailType,
          idempotencyKey: input.idempotencyKey,
          sentByUserId: input.sentByUserId ?? null,
          availableAt: input.availableAt ?? new Date(),
          status: PaymentEmailOutboxStatus.PENDING,
        },
      });
    } catch (err) {
      const code =
        err instanceof Prisma.PrismaClientKnownRequestError
          ? err.code
          : err && typeof err === 'object' && 'code' in err
            ? String((err as { code: unknown }).code)
            : undefined;
      if (code === 'P2002') {
        return null;
      }
      throw err;
    }
  }

  findById(id: string) {
    return this.prisma.paymentEmailOutbox.findUnique({ where: { id } });
  }

  findPendingBatch(limit: number, now: Date = new Date()) {
    return this.prisma.paymentEmailOutbox.findMany({
      where: {
        status: PaymentEmailOutboxStatus.PENDING,
        availableAt: { lte: now },
      },
      orderBy: { availableAt: 'asc' },
      take: limit,
    });
  }

  async claimForProcessing(id: string) {
    const result = await this.prisma.paymentEmailOutbox.updateMany({
      where: {
        id,
        status: PaymentEmailOutboxStatus.PENDING,
      },
      data: {
        status: PaymentEmailOutboxStatus.PROCESSING,
        attempts: { increment: 1 },
      },
    });
    if (result.count === 0) {
      return null;
    }
    return this.findById(id);
  }

  markCompleted(id: string, outboundEmailId: string) {
    return this.prisma.paymentEmailOutbox.update({
      where: { id },
      data: {
        status: PaymentEmailOutboxStatus.COMPLETED,
        outboundEmailId,
        processedAt: new Date(),
        errorMessage: null,
      },
    });
  }

  markDeadLetter(id: string, errorMessage: string) {
    return this.prisma.paymentEmailOutbox.update({
      where: { id },
      data: {
        status: PaymentEmailOutboxStatus.DEAD_LETTER,
        errorMessage: errorMessage.slice(0, 2000),
        processedAt: new Date(),
      },
    });
  }

  markRetry(id: string, errorMessage: string, availableAt: Date) {
    return this.prisma.paymentEmailOutbox.update({
      where: { id },
      data: {
        status: PaymentEmailOutboxStatus.PENDING,
        errorMessage: errorMessage.slice(0, 2000),
        availableAt,
      },
    });
  }
}
