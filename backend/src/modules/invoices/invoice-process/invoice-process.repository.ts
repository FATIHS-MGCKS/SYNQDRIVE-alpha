import { Injectable } from '@nestjs/common';
import {
  OrgInvoiceProcessStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { EnqueueInvoiceProcessInput } from './invoice-process.types';

@Injectable()
export class InvoiceProcessRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string, organizationId: string) {
    return this.prisma.orgInvoiceProcess.findFirst({
      where: { id, organizationId },
    });
  }

  findByIdempotencyKey(organizationId: string, idempotencyKey: string) {
    return this.prisma.orgInvoiceProcess.findFirst({
      where: { organizationId, idempotencyKey },
    });
  }

  async createIdempotent(input: EnqueueInvoiceProcessInput) {
    try {
      return await this.prisma.orgInvoiceProcess.create({
        data: {
          organizationId: input.organizationId,
          processType: input.processType,
          entityType: input.entityType,
          entityId: input.entityId,
          idempotencyKey: input.idempotencyKey,
          correlationId: input.correlationId ?? null,
          payloadJson: input.payloadJson ?? Prisma.JsonNull,
          status: OrgInvoiceProcessStatus.PENDING,
          nextRetryAt: input.nextRetryAt ?? null,
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
        return this.findByIdempotencyKey(input.organizationId, input.idempotencyKey);
      }
      throw err;
    }
  }

  findDueBatch(limit: number, now: Date = new Date()) {
    return this.prisma.orgInvoiceProcess.findMany({
      where: {
        status: {
          in: [
            OrgInvoiceProcessStatus.PENDING,
            OrgInvoiceProcessStatus.RETRY_SCHEDULED,
            OrgInvoiceProcessStatus.FAILED,
          ],
        },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      orderBy: [{ nextRetryAt: 'asc' }, { createdAt: 'asc' }],
      take: limit,
    });
  }

  async claimForProcessing(id: string, organizationId: string) {
    const result = await this.prisma.orgInvoiceProcess.updateMany({
      where: {
        id,
        organizationId,
        status: {
          in: [
            OrgInvoiceProcessStatus.PENDING,
            OrgInvoiceProcessStatus.RETRY_SCHEDULED,
            OrgInvoiceProcessStatus.FAILED,
          ],
        },
      },
      data: {
        status: OrgInvoiceProcessStatus.PROCESSING,
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });
    if (result.count === 0) return null;
    return this.findById(id, organizationId);
  }

  markCompleted(id: string) {
    return this.prisma.orgInvoiceProcess.update({
      where: { id },
      data: {
        status: OrgInvoiceProcessStatus.COMPLETED,
        resolvedAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
        nextRetryAt: null,
      },
    });
  }

  markRetryScheduled(
    id: string,
    input: { errorCode: string; errorMessage: string; nextRetryAt: Date },
  ) {
    return this.prisma.orgInvoiceProcess.update({
      where: { id },
      data: {
        status: OrgInvoiceProcessStatus.RETRY_SCHEDULED,
        lastErrorCode: input.errorCode,
        lastErrorMessage: input.errorMessage,
        nextRetryAt: input.nextRetryAt,
      },
    });
  }

  markManualReview(id: string, errorCode: string, errorMessage: string) {
    return this.prisma.orgInvoiceProcess.update({
      where: { id },
      data: {
        status: OrgInvoiceProcessStatus.MANUAL_REVIEW,
        lastErrorCode: errorCode,
        lastErrorMessage: errorMessage,
        nextRetryAt: null,
      },
    });
  }

  resetForManualRetry(id: string, userId: string | null) {
    return this.prisma.orgInvoiceProcess.update({
      where: { id },
      data: {
        status: OrgInvoiceProcessStatus.PENDING,
        nextRetryAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
        resolvedAt: null,
        resolvedByUserId: userId,
      },
    });
  }

  listByOrg(
    organizationId: string,
    options?: { status?: OrgInvoiceProcessStatus; entityId?: string; take?: number },
  ) {
    return this.prisma.orgInvoiceProcess.findMany({
      where: {
        organizationId,
        ...(options?.status ? { status: options.status } : {}),
        ...(options?.entityId ? { entityId: options.entityId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: options?.take ?? 50,
    });
  }
}
