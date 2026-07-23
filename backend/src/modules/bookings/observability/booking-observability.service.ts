import { Injectable, Logger } from '@nestjs/common';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  BOOKING_FAILURE_CATEGORIES,
  BOOKING_OBSERVABILITY_OPERATIONS,
  BOOKING_SAFE_ERROR_CODES,
} from './booking-observability.constants';
import { BookingProcessingFailureRepository } from './booking-processing-failure.repository';
import type {
  BookingFailureInput,
  BookingObservabilityContext,
  BookingSideEffectInput,
} from './booking-observability.types';
import {
  classifyBookingErrorCode,
  redactBookingLogValue,
} from './booking-log-redaction.util';

@Injectable()
export class BookingObservabilityService {
  private readonly logger = new Logger(BookingObservabilityService.name);

  constructor(
    private readonly metrics: TripMetricsService,
    private readonly failures: BookingProcessingFailureRepository,
  ) {}

  logInfo(ctx: BookingObservabilityContext, operation: string, fields?: Record<string, unknown>) {
    this.logger.log({
      msg: operation,
      organizationId: ctx.organizationId,
      bookingId: ctx.bookingId ?? null,
      correlationId: ctx.correlationId ?? null,
      requestId: ctx.requestId ?? null,
      eventId: ctx.eventId ?? null,
      operation,
      ...fields,
    });
  }

  recordCreateSuccess(ctx: BookingObservabilityContext) {
    this.metrics.bookingCreateSuccess.inc({ organization_id: 'all' });
    this.logInfo(ctx, BOOKING_OBSERVABILITY_OPERATIONS.CREATE, { outcome: 'success' });
  }

  recordCreateFailure(ctx: BookingObservabilityContext, error: unknown) {
    const errorCode = classifyBookingErrorCode(error, BOOKING_SAFE_ERROR_CODES.UNKNOWN);
    this.metrics.bookingCreateFailure.inc({ error_code: errorCode });
    void this.recordFailure({
      ...ctx,
      operation: BOOKING_OBSERVABILITY_OPERATIONS.CREATE,
      category: BOOKING_FAILURE_CATEGORIES.OTHER,
      errorCode,
      error,
      severity: 'CRITICAL',
      persist: true,
    });
  }

  recordConflict(ctx: BookingObservabilityContext, errorCode: string) {
    this.metrics.bookingConflictTotal.inc({ error_code: errorCode });
    void this.recordFailure({
      ...ctx,
      operation: BOOKING_OBSERVABILITY_OPERATIONS.CREATE,
      category: BOOKING_FAILURE_CATEGORIES.CONFLICT,
      errorCode,
      error: errorCode,
      retryable: false,
      severity: 'WARNING',
      persist: true,
    });
  }

  recordTenantDenial(ctx: BookingObservabilityContext, errorCode: string) {
    this.metrics.bookingTenantDenialTotal.inc({ error_code: errorCode });
    void this.recordFailure({
      ...ctx,
      operation: BOOKING_OBSERVABILITY_OPERATIONS.TENANT_DENIAL,
      category: BOOKING_FAILURE_CATEGORIES.TENANT,
      errorCode,
      error: errorCode,
      retryable: false,
      severity: 'WARNING',
      persist: true,
    });
  }

  async recordFailure(input: BookingFailureInput): Promise<void> {
    const message = redactBookingLogValue(input.error);
    const errorCode = input.errorCode || classifyBookingErrorCode(input.error, BOOKING_SAFE_ERROR_CODES.UNKNOWN);

    this.recordCategoryMetric(input.category, errorCode);
    if (input.category === BOOKING_FAILURE_CATEGORIES.HANDOVER) {
      this.metrics.bookingHandoverFailure.inc({ error_code: errorCode });
    }

    this.logger.warn({
      msg: `booking.failure.${input.operation}`,
      organizationId: input.organizationId,
      bookingId: input.bookingId ?? null,
      correlationId: input.correlationId ?? null,
      requestId: input.requestId ?? null,
      eventId: input.eventId ?? null,
      operation: input.operation,
      category: input.category,
      errorCode,
      retryable: input.retryable ?? true,
      severity: input.severity ?? 'ERROR',
      message,
      metadata: input.metadata ?? null,
    });

    if (input.persist === false) return;

    try {
      await this.failures.create({
        organizationId: input.organizationId,
        bookingId: input.bookingId ?? null,
        category: input.category,
        operation: input.operation,
        errorCode,
        message,
        correlationId: input.correlationId ?? null,
        requestId: input.requestId ?? null,
        eventId: input.eventId ?? null,
        retryable: input.retryable ?? true,
        severity: input.severity ?? 'ERROR',
        metadata: (input.metadata ?? null) as never,
      });
    } catch (persistErr) {
      this.logger.error({
        msg: 'booking.failure.persist_failed',
        organizationId: input.organizationId,
        bookingId: input.bookingId ?? null,
        operation: input.operation,
        errorCode: 'FAILURE_PERSIST_ERROR',
        message: redactBookingLogValue(persistErr),
      });
    }
  }

  runSideEffectVoid(
    ctx: BookingSideEffectInput,
    work: () => Promise<void>,
  ): void {
    void this.runSideEffect(ctx, work);
  }

  async runSideEffect(
    ctx: BookingSideEffectInput,
    work: () => Promise<void>,
  ): Promise<void> {
    try {
      await work();
    } catch (error) {
      await this.recordFailure({
        organizationId: ctx.organizationId,
        bookingId: ctx.bookingId,
        correlationId: ctx.correlationId,
        requestId: ctx.requestId,
        eventId: ctx.eventId,
        operation: ctx.operation,
        category: ctx.category,
        errorCode: ctx.errorCode,
        error,
        persist: ctx.persistFailure ?? true,
        metadata: ctx.metadata,
      });
    }
  }

  private recordCategoryMetric(category: string, errorCode: string) {
    switch (category) {
      case BOOKING_FAILURE_CATEGORIES.INVOICE:
        this.metrics.bookingInvoiceFailure.inc({ error_code: errorCode });
        break;
      case BOOKING_FAILURE_CATEGORIES.DOCUMENT:
        this.metrics.bookingDocumentFailure.inc({ error_code: errorCode });
        break;
      case BOOKING_FAILURE_CATEGORIES.EMAIL:
        this.metrics.bookingEmailFailure.inc({ error_code: errorCode });
        break;
      case BOOKING_FAILURE_CATEGORIES.TASK:
        this.metrics.bookingTaskFailure.inc({ error_code: errorCode });
        break;
      case BOOKING_FAILURE_CATEGORIES.OUTBOX:
        this.metrics.bookingOutboxRetry.inc({ error_code: errorCode });
        break;
      default:
        break;
    }
  }
}
