import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  OrgInvoiceProcessEntityType,
  OrgInvoiceProcessStatus,
  OrgInvoiceProcessType,
} from '@prisma/client';
import invoiceProcessConfig from '@config/invoice-process.config';
import {
  buildProcessIdempotencyKey,
  computeInvoiceProcessRetryAt,
} from './invoice-process-backoff.util';
import {
  buildProcessUserMessage,
  classifyProcessError,
  invoiceProcessStatusLabel,
  invoiceProcessTypeLabel,
  sanitizeProcessErrorMessage,
} from './invoice-process-error.util';
import { InvoiceProcessRepository } from './invoice-process.repository';
import type {
  EnqueueInvoiceProcessInput,
  InvoiceProcessDto,
  RecordInvoiceProcessFailureInput,
} from './invoice-process.types';

@Injectable()
export class InvoiceProcessOutboxService {
  private readonly logger = new Logger(InvoiceProcessOutboxService.name);

  constructor(
    @Inject(invoiceProcessConfig.KEY)
    private readonly config: ConfigType<typeof invoiceProcessConfig>,
    private readonly repo: InvoiceProcessRepository,
  ) {}

  isEnabled(): boolean {
    return this.config.enabled;
  }

  async enqueue(input: EnqueueInvoiceProcessInput) {
    if (!this.isEnabled()) return null;
    return this.repo.createIdempotent(input);
  }

  async recordFailure(input: RecordInvoiceProcessFailureInput) {
    if (!this.isEnabled()) {
      this.logger.error(
        `Invoice process failure (tracking disabled) ${input.processType} ${input.entityId}`,
        input.error instanceof Error ? input.error.stack : String(input.error),
      );
      return null;
    }

    const classified = classifyProcessError(input.error);
    const idempotencyKey =
      input.idempotencyKey ??
      buildProcessIdempotencyKey(input.processType, input.entityType, input.entityId);

    const existing = await this.repo.findByIdempotencyKey(
      input.organizationId,
      idempotencyKey,
    );

    const sanitized = sanitizeProcessErrorMessage(classified.message);
    const attemptCount = (existing?.attemptCount ?? 0) + 1;

    if (existing?.status === OrgInvoiceProcessStatus.COMPLETED) {
      return existing;
    }

    if (!classified.retryable || attemptCount >= this.config.maxAttempts) {
      if (existing) {
        return this.repo.markManualReview(existing.id, classified.code, sanitized);
      }
      const created = await this.repo.createIdempotent({
        organizationId: input.organizationId,
        processType: input.processType,
        entityType: input.entityType,
        entityId: input.entityId,
        idempotencyKey,
        correlationId: input.correlationId,
        payloadJson: input.payloadJson,
      });
      if (!created) return null;
      await this.repo.claimForProcessing(created.id, input.organizationId);
      return this.repo.markManualReview(created.id, classified.code, sanitized);
    }

    const nextRetryAt = computeInvoiceProcessRetryAt(
      attemptCount,
      this.config.backoffMs,
    );

    if (existing) {
      await this.repo.claimForProcessing(existing.id, input.organizationId);
      return this.repo.markRetryScheduled(existing.id, {
        errorCode: classified.code,
        errorMessage: sanitized,
        nextRetryAt,
      });
    }

    const row = await this.repo.createIdempotent({
      organizationId: input.organizationId,
      processType: input.processType,
      entityType: input.entityType,
      entityId: input.entityId,
      idempotencyKey,
      correlationId: input.correlationId,
      payloadJson: input.payloadJson,
      nextRetryAt,
    });
    if (!row) return null;

    await this.repo.markRetryScheduled(row.id, {
      errorCode: classified.code,
      errorMessage: sanitized,
      nextRetryAt,
    });

    this.logger.warn(
      `Invoice process scheduled retry: ${input.processType} entity=${input.entityId} code=${classified.code}`,
    );
    return this.repo.findById(row.id, input.organizationId);
  }

  toDto(row: {
    id: string;
    organizationId: string;
    processType: OrgInvoiceProcessType;
    entityType: OrgInvoiceProcessEntityType;
    entityId: string;
    status: OrgInvoiceProcessStatus;
    attemptCount: number;
    lastAttemptAt: Date | null;
    nextRetryAt: Date | null;
    lastErrorCode: string | null;
    correlationId: string | null;
    resolvedAt: Date | null;
    resolvedByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): InvoiceProcessDto {
    return {
      id: row.id,
      organizationId: row.organizationId,
      processType: row.processType,
      processTypeLabel: invoiceProcessTypeLabel(row.processType),
      entityType: row.entityType,
      entityId: row.entityId,
      status: row.status,
      statusLabel: invoiceProcessStatusLabel(row.status),
      userMessage: buildProcessUserMessage({
        processType: row.processType,
        status: row.status,
        lastErrorCode: row.lastErrorCode,
      }),
      attemptCount: row.attemptCount,
      lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
      nextRetryAt: row.nextRetryAt?.toISOString() ?? null,
      lastErrorCode: row.lastErrorCode,
      correlationId: row.correlationId,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      resolvedByUserId: row.resolvedByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
