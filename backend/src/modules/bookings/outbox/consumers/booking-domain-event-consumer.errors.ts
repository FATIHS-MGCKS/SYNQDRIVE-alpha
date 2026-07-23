export type BookingDomainEventConsumerErrorCode =
  | 'TENANT_MISMATCH'
  | 'BOOKING_NOT_FOUND'
  | 'STALE_AGGREGATE_VERSION'
  | 'RETRYABLE_EXTERNAL'
  | 'RETRYABLE_DEPENDENCY'
  | 'NON_RETRYABLE'
  | 'TIMEOUT';

export class BookingDomainEventConsumerError extends Error {
  readonly retryable: boolean;
  readonly code: BookingDomainEventConsumerErrorCode;
  readonly metadata?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      retryable: boolean;
      code?: BookingDomainEventConsumerErrorCode;
      metadata?: Record<string, unknown>;
    },
  ) {
    super(message);
    this.name = 'BookingDomainEventConsumerError';
    this.retryable = options.retryable;
    this.code = options.code ?? (options.retryable ? 'RETRYABLE_EXTERNAL' : 'NON_RETRYABLE');
    this.metadata = options.metadata;
  }
}

export class BookingDomainEventStaleError extends BookingDomainEventConsumerError {
  constructor(metadata?: Record<string, unknown>) {
    super('Stale aggregate version — skipping consumer', {
      retryable: false,
      code: 'STALE_AGGREGATE_VERSION',
      metadata,
    });
    this.name = 'BookingDomainEventStaleError';
  }
}

export class BookingDomainEventTenantError extends BookingDomainEventConsumerError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, {
      retryable: false,
      code: 'TENANT_MISMATCH',
      metadata,
    });
    this.name = 'BookingDomainEventTenantError';
  }
}

export function isRetryableConsumerError(err: unknown): boolean {
  if (err instanceof BookingDomainEventConsumerError) {
    return err.retryable;
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('etimedout')) {
      return true;
    }
    if (msg.includes('not found') && msg.includes('booking')) {
      return false;
    }
  }
  return true;
}

export function classifyConsumerError(err: unknown): BookingDomainEventConsumerError {
  if (err instanceof BookingDomainEventConsumerError) {
    return err;
  }
  const message = err instanceof Error ? err.message : String(err);
  const retryable = isRetryableConsumerError(err);
  return new BookingDomainEventConsumerError(message, {
    retryable,
    code: retryable ? 'RETRYABLE_EXTERNAL' : 'NON_RETRYABLE',
  });
}
