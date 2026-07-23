import type {
  BookingFailureCategory,
  BookingObservabilityOperation,
  BookingSafeErrorCode,
} from './booking-observability.constants';

export type BookingObservabilityContext = {
  organizationId: string;
  bookingId?: string | null;
  correlationId?: string | null;
  requestId?: string | null;
  eventId?: string | null;
};

export type BookingFailureInput = BookingObservabilityContext & {
  operation: BookingObservabilityOperation | string;
  category: BookingFailureCategory;
  errorCode: BookingSafeErrorCode | string;
  error: unknown;
  retryable?: boolean;
  severity?: 'WARNING' | 'ERROR' | 'CRITICAL';
  persist?: boolean;
  metadata?: Record<string, unknown>;
};

export type BookingSideEffectInput = BookingObservabilityContext & {
  operation: BookingObservabilityOperation | string;
  category: BookingFailureCategory;
  errorCode: BookingSafeErrorCode | string;
  persistFailure?: boolean;
  metadata?: Record<string, unknown>;
};
