import type {
  AiDomainAuditEvent,
  AiDomainErrorCode,
  AiDomainErrorRetryPolicy,
  AiDomainErrorSeverity,
  AiDomainHttpStatus,
} from './ai-domain-error.enums';
import type { AiEvidence } from './ai-evidence.types';

/**
 * Internal diagnostics — **never** exposed to LLM or frontend clients.
 * May contain entity ids and service names for support/audit only.
 */
export interface AiDomainErrorDiagnostics {
  readonly correlationId?: string;
  readonly domainService?: string;
  readonly internalDetail?: string;
  readonly entityId?: string;
  readonly entityKind?: string;
  readonly organizationId?: string;
  readonly upstreamStatus?: number;
  readonly causeCode?: string;
}

/** Safe, user/LLM-facing error record — no stack traces or secrets. */
export interface AiDomainError {
  readonly code: AiDomainErrorCode;
  readonly publicMessage: string;
  readonly severity: AiDomainErrorSeverity;
  readonly retryPolicy: AiDomainErrorRetryPolicy;
  readonly httpStatus: AiDomainHttpStatus;
  readonly auditEvent: AiDomainAuditEvent;
  /**
   * When true, public message must not reveal whether a protected entity exists.
   * Used for permission_denied vs vehicle_not_found separation.
   */
  readonly maskEntityExistence: boolean;
  /** LLM must not invent data to compensate for this error. */
  readonly blockLlmInference: boolean;
  readonly diagnostics: AiDomainErrorDiagnostics;
}

/** Catalog metadata for a domain error code — single source for defaults. */
export interface AiDomainErrorCatalogEntry {
  readonly code: AiDomainErrorCode;
  readonly publicMessageEn: string;
  readonly publicMessageDe: string;
  readonly severity: AiDomainErrorSeverity;
  readonly retryPolicy: AiDomainErrorRetryPolicy;
  readonly httpStatus: AiDomainHttpStatus;
  readonly auditEvent: AiDomainAuditEvent;
  readonly maskEntityExistence: boolean;
  readonly blockLlmInference: boolean;
}

export interface CreateAiDomainErrorInput {
  readonly code: AiDomainErrorCode;
  readonly locale?: 'en' | 'de';
  readonly publicMessageOverride?: string;
  readonly diagnostics?: AiDomainErrorDiagnostics;
  readonly maskEntityExistence?: boolean;
}

/**
 * Outcome envelope for AI domain tool queries — supports partial success.
 * `allowLlmInference` is always false when any blocking error is present.
 */
export interface AiDomainQueryOutcome<T> {
  readonly tenantId: string;
  readonly partial: boolean;
  readonly data: T | null;
  readonly evidence: readonly AiEvidence[];
  readonly errors: readonly AiDomainError[];
  readonly warnings: readonly string[];
  readonly allowLlmInference: boolean;
}

/** LLM-safe error projection — strips diagnostics. */
export interface AiDomainErrorPublicView {
  readonly code: AiDomainErrorCode;
  readonly message: string;
  readonly severity: AiDomainErrorSeverity;
  readonly retryPolicy: AiDomainErrorRetryPolicy;
  readonly partial: boolean;
}

/** Frontend-safe API error body. */
export interface AiDomainErrorApiView extends AiDomainErrorPublicView {
  readonly httpStatus: AiDomainHttpStatus;
}
