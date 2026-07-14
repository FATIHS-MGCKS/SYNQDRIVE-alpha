import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import invoiceProcessConfig from '@config/invoice-process.config';
import {
  computeInvoiceProcessRetryAt,
} from './invoice-process-backoff.util';
import {
  classifyProcessError,
  sanitizeProcessErrorMessage,
} from './invoice-process-error.util';
import { InvoiceProcessExecutorService } from './invoice-process-executor.service';
import { InvoiceProcessRepository } from './invoice-process.repository';

export type ProcessRunOutcome = 'completed' | 'retry' | 'manual_review' | 'skipped';

@Injectable()
export class InvoiceProcessProcessorService {
  private readonly logger = new Logger(InvoiceProcessProcessorService.name);

  constructor(
    @Inject(invoiceProcessConfig.KEY)
    private readonly config: ConfigType<typeof invoiceProcessConfig>,
    private readonly repo: InvoiceProcessRepository,
    private readonly executor: InvoiceProcessExecutorService,
  ) {}

  async processById(id: string, organizationId: string): Promise<ProcessRunOutcome> {
    const claimed = await this.repo.claimForProcessing(id, organizationId);
    if (!claimed) return 'skipped';

    try {
      await this.executor.execute(claimed);
      await this.repo.markCompleted(claimed.id);
      return 'completed';
    } catch (error) {
      const classified = classifyProcessError(error);
      const sanitized = sanitizeProcessErrorMessage(
        error instanceof Error ? error.message : classified.message,
      );

      this.logger.error(
        `Invoice process failed ${claimed.processType} ${claimed.entityId}: ${classified.code}`,
        error instanceof Error ? error.stack : undefined,
      );

      if (!classified.retryable || claimed.attemptCount >= this.config.maxAttempts) {
        await this.repo.markManualReview(claimed.id, classified.code, sanitized);
        return 'manual_review';
      }

      const nextRetryAt = computeInvoiceProcessRetryAt(
        claimed.attemptCount,
        this.config.backoffMs,
      );
      await this.repo.markRetryScheduled(claimed.id, {
        errorCode: classified.code,
        errorMessage: sanitized,
        nextRetryAt,
      });
      return 'retry';
    }
  }
}
