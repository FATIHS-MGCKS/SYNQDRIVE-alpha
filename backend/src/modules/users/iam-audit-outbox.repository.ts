import { Injectable } from '@nestjs/common';
import { IamAuditOutboxStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export interface EnqueueIamAuditOutboxInput {
  organizationId: string;
  idempotencyKey: string;
  auditAction: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class IamAuditOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  enqueueInTransaction(
    tx: Prisma.TransactionClient,
    input: EnqueueIamAuditOutboxInput,
  ) {
    return tx.iamAuditOutbox.create({
      data: {
        organizationId: input.organizationId,
        idempotencyKey: input.idempotencyKey,
        auditAction: input.auditAction,
        payload: input.payload as Prisma.InputJsonValue,
        status: IamAuditOutboxStatus.PENDING,
      },
    });
  }

  findPendingBatch(limit: number) {
    return this.prisma.iamAuditOutbox.findMany({
      where: { status: IamAuditOutboxStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  markProcessed(id: string) {
    return this.prisma.iamAuditOutbox.update({
      where: { id },
      data: {
        status: IamAuditOutboxStatus.PROCESSED,
        processedAt: new Date(),
        errorMessage: null,
      },
    });
  }

  markDeadLetter(id: string, errorMessage: string) {
    return this.prisma.iamAuditOutbox.update({
      where: { id },
      data: {
        status: IamAuditOutboxStatus.DEAD_LETTER,
        processedAt: new Date(),
        errorMessage: errorMessage.slice(0, 2000),
      },
    });
  }
}
