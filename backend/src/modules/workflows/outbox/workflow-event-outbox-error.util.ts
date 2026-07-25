import type { WorkflowEventRejectionReason } from '../envelope';
import { truncateOutboxErrorSummary } from './workflow-event-outbox.constants';

export type WorkflowEventOutboxErrorClass =
  | 'retryable'
  | 'permanent'
  | 'validation'
  | 'tenant_violation';

const VALIDATION_REASONS = new Set<WorkflowEventRejectionReason>([
  'MISSING_EVENT_TYPE',
  'UNKNOWN_EVENT_TYPE',
  'UNSUPPORTED_EVENT_VERSION',
  'INVALID_PAYLOAD',
  'INVALID_TIMESTAMP',
  'INVALID_ENVELOPE_SCHEMA',
  'PAYLOAD_TOO_LARGE',
  'METADATA_TOO_LARGE',
  'METADATA_SECRET_VIOLATION',
  'DUPLICATE_EVENT_ID',
  'MISSING_SOURCE',
  'MISSING_ORGANIZATION_ID',
]);

const TENANT_REASONS = new Set<WorkflowEventRejectionReason>(['CROSS_TENANT_VIOLATION']);

const PERMANENT_REASONS = new Set<string>([
  'TENANT_NOT_FOUND',
  'ORGANIZATION_MISMATCH',
  'ALREADY_DISPATCHED',
  'UNKNOWN_MANIPULATED_EVENT',
]);

export class WorkflowEventOutboxProcessingError extends Error {
  constructor(
    message: string,
    public readonly errorClass: WorkflowEventOutboxErrorClass,
    public readonly errorCode: string,
  ) {
    super(message);
    this.name = 'WorkflowEventOutboxProcessingError';
  }
}

export function classifyRejectionReason(
  reason: WorkflowEventRejectionReason,
): WorkflowEventOutboxErrorClass {
  if (TENANT_REASONS.has(reason)) return 'tenant_violation';
  if (VALIDATION_REASONS.has(reason)) return 'validation';
  return 'permanent';
}

export function classifyProcessingError(err: unknown): {
  errorClass: WorkflowEventOutboxErrorClass;
  errorCode: string;
  message: string;
} {
  if (err instanceof WorkflowEventOutboxProcessingError) {
    return {
      errorClass: err.errorClass,
      errorCode: err.errorCode,
      message: err.message,
    };
  }

  if (err instanceof Error) {
    const code = err.name || 'PROCESSING_ERROR';
    if (PERMANENT_REASONS.has(code)) {
      return { errorClass: 'permanent', errorCode: code, message: err.message };
    }
    if (/PrismaClientKnownRequestError|P2024|P2034|connection|timeout|ECONNRESET|ETIMEDOUT/i.test(
      `${code} ${err.message}`,
    )) {
      return { errorClass: 'retryable', errorCode: code, message: err.message };
    }
    return { errorClass: 'retryable', errorCode: code, message: err.message };
  }

  return {
    errorClass: 'retryable',
    errorCode: 'UNKNOWN_ERROR',
    message: String(err),
  };
}

export function shouldRetryErrorClass(errorClass: WorkflowEventOutboxErrorClass): boolean {
  return errorClass === 'retryable';
}

export function computeWorkflowOutboxBackoffMs(
  baseBackoffMs: number,
  maxBackoffMs: number,
  jitterMs: number,
  attempt: number,
): number {
  const exponent = Math.max(0, attempt - 1);
  const raw = Math.min(maxBackoffMs, baseBackoffMs * 2 ** exponent);
  const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
  return raw + jitter;
}

export function sanitizeOutboxErrorSummary(message: string): string {
  return truncateOutboxErrorSummary(message.replace(/\s+/g, ' ').trim());
}
