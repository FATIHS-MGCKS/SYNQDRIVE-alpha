import { Injectable, Logger } from '@nestjs/common';
import {
  BookingIdempotencyOperation,
  BookingIdempotencyStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BookingIdempotencyConfigService } from './booking-idempotency.config';
import {
  BookingIdempotencyInProgressError,
  BookingIdempotencyKeyReusedError,
  BookingIdempotencyKeyRequiredError,
} from './booking-idempotency.errors';
import {
  hashBookingIdempotencyRequest,
  resolveBookingActorScope,
} from './booking-idempotency.util';

export interface ExecuteBookingIdempotencyInput<T> {
  organizationId: string;
  actorUserId?: string | null;
  operation: BookingIdempotencyOperation;
  idempotencyKey?: string | null;
  resourceId?: string | null;
  fingerprintPayload: unknown;
  handler: () => Promise<{ result: T; resultReference?: string | null }>;
}

export interface ExecuteBookingIdempotencyResult<T> {
  result: T;
  replayed: boolean;
  recordId: string;
}

@Injectable()
export class BookingIdempotencyService {
  private readonly logger = new Logger(BookingIdempotencyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: BookingIdempotencyConfigService,
  ) {}

  requireKey(idempotencyKey: string | undefined | null, operation?: string): string {
    const trimmed = idempotencyKey?.trim();
    if (!trimmed) {
      throw new BookingIdempotencyKeyRequiredError(operation);
    }
    return trimmed;
  }

  async execute<T>(
    input: ExecuteBookingIdempotencyInput<T>,
  ): Promise<ExecuteBookingIdempotencyResult<T>> {
    const idempotencyKey = this.requireKey(input.idempotencyKey, input.operation);
    const actorScope = resolveBookingActorScope(input.actorUserId);
    const requestFingerprint = hashBookingIdempotencyRequest(input.fingerprintPayload);
    const expiresAt = this.computeExpiresAt();

    const claim = await this.claimRecord({
      organizationId: input.organizationId,
      actorScope,
      operation: input.operation,
      idempotencyKey,
      resourceId: input.resourceId ?? null,
      requestFingerprint,
      expiresAt,
    });

    if (claim.replayed && claim.resultPayload != null) {
      return {
        result: claim.resultPayload as T,
        replayed: true,
        recordId: claim.recordId,
      };
    }

    try {
      const handlerResult = await input.handler();
      await this.finalizeRecord({
        recordId: claim.recordId,
        requestFingerprint,
        resultReference: handlerResult.resultReference ?? null,
        resultPayload: handlerResult.result,
      });
      return {
        result: handlerResult.result,
        replayed: false,
        recordId: claim.recordId,
      };
    } catch (error) {
      await this.markFailed(claim.recordId, error);
      throw error;
    }
  }

  async purgeExpired(batchSize = 500): Promise<number> {
    const rows = await this.prisma.bookingIdempotencyRecord.findMany({
      where: { expiresAt: { lt: new Date() } },
      select: { id: true },
      take: batchSize,
    });
    if (rows.length === 0) return 0;
    const result = await this.prisma.bookingIdempotencyRecord.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
    return result.count;
  }

  private computeExpiresAt(): Date {
    const hours = this.config.getRetentionHours();
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  private async claimRecord(params: {
    organizationId: string;
    actorScope: string;
    operation: BookingIdempotencyOperation;
    idempotencyKey: string;
    resourceId: string | null;
    requestFingerprint: string;
    expiresAt: Date;
  }): Promise<{
    recordId: string;
    replayed: boolean;
    resultPayload?: unknown;
  }> {
    const lockKey = `booking-idempotency:${params.organizationId}:${params.operation}:${params.idempotencyKey}`;

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const existing = await tx.bookingIdempotencyRecord.findUnique({
        where: {
          organizationId_actorScope_operation_idempotencyKey: {
            organizationId: params.organizationId,
            actorScope: params.actorScope,
            operation: params.operation,
            idempotencyKey: params.idempotencyKey,
          },
        },
      });

      if (existing) {
        if (existing.requestFingerprint !== params.requestFingerprint) {
          throw new BookingIdempotencyKeyReusedError();
        }

        if (existing.status === BookingIdempotencyStatus.COMPLETED && existing.resultPayload != null) {
          return {
            recordId: existing.id,
            replayed: true,
            resultPayload: existing.resultPayload,
          };
        }

        if (existing.status === BookingIdempotencyStatus.PROCESSING) {
          const polled = await this.pollForCompletionOutsideTx(
            params.organizationId,
            params.actorScope,
            params.operation,
            params.idempotencyKey,
            params.requestFingerprint,
          );
          if (polled) {
            return {
              recordId: polled.id,
              replayed: true,
              resultPayload: polled.resultPayload,
            };
          }
          throw new BookingIdempotencyInProgressError();
        }

        if (existing.status === BookingIdempotencyStatus.FAILED) {
          const resumed = await tx.bookingIdempotencyRecord.update({
            where: { id: existing.id },
            data: {
              status: BookingIdempotencyStatus.PROCESSING,
              errorCode: null,
              expiresAt: params.expiresAt,
            },
          });
          return { recordId: resumed.id, replayed: false };
        }
      }

      try {
        const created = await tx.bookingIdempotencyRecord.create({
          data: {
            organizationId: params.organizationId,
            actorScope: params.actorScope,
            operation: params.operation,
            idempotencyKey: params.idempotencyKey,
            resourceId: params.resourceId,
            requestFingerprint: params.requestFingerprint,
            status: BookingIdempotencyStatus.PROCESSING,
            expiresAt: params.expiresAt,
          },
        });
        return { recordId: created.id, replayed: false };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const raced = await tx.bookingIdempotencyRecord.findUnique({
            where: {
              organizationId_actorScope_operation_idempotencyKey: {
                organizationId: params.organizationId,
                actorScope: params.actorScope,
                operation: params.operation,
                idempotencyKey: params.idempotencyKey,
              },
            },
          });
          if (raced) {
            if (raced.requestFingerprint !== params.requestFingerprint) {
              throw new BookingIdempotencyKeyReusedError();
            }
            if (raced.status === BookingIdempotencyStatus.COMPLETED && raced.resultPayload != null) {
              return {
                recordId: raced.id,
                replayed: true,
                resultPayload: raced.resultPayload,
              };
            }
          }
        }
        throw error;
      }
    });
  }

  private async pollForCompletionOutsideTx(
    organizationId: string,
    actorScope: string,
    operation: BookingIdempotencyOperation,
    idempotencyKey: string,
    requestFingerprint: string,
  ) {
    const attempts = this.config.getProcessingPollAttempts();
    const delayMs = this.config.getProcessingPollDelayMs();

    for (let i = 0; i < attempts; i++) {
      await this.sleep(delayMs);
      const row = await this.prisma.bookingIdempotencyRecord.findUnique({
        where: {
          organizationId_actorScope_operation_idempotencyKey: {
            organizationId,
            actorScope,
            operation,
            idempotencyKey,
          },
        },
      });
      if (!row) return null;
      if (row.requestFingerprint !== requestFingerprint) {
        throw new BookingIdempotencyKeyReusedError();
      }
      if (row.status === BookingIdempotencyStatus.COMPLETED && row.resultPayload != null) {
        return row;
      }
      if (row.status === BookingIdempotencyStatus.FAILED) {
        return null;
      }
    }
    return null;
  }

  private async finalizeRecord(params: {
    recordId: string;
    requestFingerprint: string;
    resultReference: string | null;
    resultPayload: unknown;
  }): Promise<void> {
    await this.prisma.bookingIdempotencyRecord.updateMany({
      where: {
        id: params.recordId,
        requestFingerprint: params.requestFingerprint,
        status: BookingIdempotencyStatus.PROCESSING,
      },
      data: {
        status: BookingIdempotencyStatus.COMPLETED,
        resultReference: params.resultReference,
        resultPayload: params.resultPayload as Prisma.InputJsonValue,
        errorCode: null,
      },
    });
  }

  private async markFailed(recordId: string, error: unknown): Promise<void> {
    const errorCode =
      error && typeof error === 'object' && 'response' in error
        ? String((error as { response?: { code?: string } }).response?.code ?? 'HANDLER_FAILED')
        : 'HANDLER_FAILED';

    await this.prisma.bookingIdempotencyRecord.updateMany({
      where: { id: recordId, status: BookingIdempotencyStatus.PROCESSING },
      data: {
        status: BookingIdempotencyStatus.FAILED,
        errorCode,
      },
    }).catch((err) => {
      this.logger.warn(`Failed to mark idempotency record ${recordId} as FAILED: ${String(err)}`);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
