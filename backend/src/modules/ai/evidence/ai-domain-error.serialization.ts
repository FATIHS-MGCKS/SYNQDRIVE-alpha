import type { AiEvidenceReasonCode } from './ai-evidence.enums';
import type { AiDomainErrorCode } from './ai-domain-error.enums';
import type {
  AiDomainError,
  AiDomainErrorApiView,
  AiDomainErrorPublicView,
} from './ai-domain-error.types';

const STACK_TRACE_PATTERN = /\bat\s+[\w./<>]+\s*\(/;
const FILE_PATH_PATTERN = /\/[\w./-]+\.(?:ts|js|mjs|cjs)(?::\d+:\d+)?/gi;
const BEARER_PATTERN = /Bearer\s+\S+/gi;
const API_KEY_PATTERN = /\b(?:api[_-]?key|secret|token|password)\s*[=:]\s*\S+/gi;
const MISTRAL_KEY_PATTERN = /\b[A-Za-z0-9]{20,}\b/g;

/**
 * Sanitize internal diagnostic strings before persistence — never expose to clients.
 */
export function sanitizeAiDomainDiagnosticText(text: string): string {
  return text
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(API_KEY_PATTERN, '[REDACTED]')
    .replace(FILE_PATH_PATTERN, '[REDACTED_PATH]')
    .replace(STACK_TRACE_PATTERN, 'at [REDACTED](')
    .slice(0, 500);
}

export function sanitizeInternalThrowable(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeAiDomainDiagnosticText(error.message);
  }
  return sanitizeAiDomainDiagnosticText(String(error));
}

/** Strips cross-tenant identifiers from diagnostic detail when tenant is known. */
export function redactForeignOrganizationReferences(
  detail: string,
  allowedOrganizationId: string,
): string {
  const uuidPattern =
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
  return detail.replace(uuidPattern, (match) =>
    match.toLowerCase() === allowedOrganizationId.toLowerCase()
      ? match
      : '[REDACTED_ORG]',
  );
}

export function toAiDomainErrorPublicView(
  error: AiDomainError,
  partial = false,
): AiDomainErrorPublicView {
  return {
    code: error.code,
    message: error.publicMessage,
    severity: error.severity,
    retryPolicy: error.retryPolicy,
    partial,
  };
}

export function toAiDomainErrorApiView(
  error: AiDomainError,
  partial = false,
): AiDomainErrorApiView {
  return {
    ...toAiDomainErrorPublicView(error, partial),
    httpStatus: error.httpStatus,
  };
}

/**
 * LLM-safe projection — diagnostics and stack traces are never included.
 */
export function serializeAiDomainErrorForLlm(
  error: AiDomainError,
): AiDomainErrorPublicView {
  return toAiDomainErrorPublicView(error);
}

export function serializeAiDomainErrorsForLlm(
  errors: readonly AiDomainError[],
): AiDomainErrorPublicView[] {
  return errors.map((error) => serializeAiDomainErrorForLlm(error));
}

/** Audit log payload — includes diagnostics, still sanitized. */
export function toAiDomainErrorAuditPayload(
  error: AiDomainError,
  tenantId: string,
): Record<string, string | number | boolean> {
  const detail = error.diagnostics.internalDetail
    ? redactForeignOrganizationReferences(
        sanitizeAiDomainDiagnosticText(error.diagnostics.internalDetail),
        tenantId,
      )
    : undefined;

  return {
    event: error.auditEvent,
    code: error.code,
    severity: error.severity,
    retryPolicy: error.retryPolicy,
    httpStatus: error.httpStatus,
    maskEntityExistence: error.maskEntityExistence,
    blockLlmInference: error.blockLlmInference,
    organizationId: tenantId,
    ...(error.diagnostics.correlationId
      ? { correlationId: error.diagnostics.correlationId }
      : {}),
    ...(error.diagnostics.domainService
      ? { domainService: error.diagnostics.domainService }
      : {}),
    ...(error.diagnostics.entityId ? { entityId: error.diagnostics.entityId } : {}),
    ...(detail ? { internalDetail: detail } : {}),
  };
}

/** Bridge evidence reason codes → domain error codes for unified tool handling. */
export function mapEvidenceReasonCodeToDomainErrorCode(
  reasonCode: AiEvidenceReasonCode,
): AiDomainErrorCode | null {
  switch (reasonCode) {
    case 'entity_not_found':
      return 'vehicle_not_found';
    case 'data_unavailable':
      return 'data_not_available';
    case 'stale_data':
      return 'data_too_old';
    case 'permission_denied':
      return 'permission_denied';
    case 'signal_not_supported':
      return 'signal_not_supported';
    case 'provider_outage':
      return 'integration_temporarily_unavailable';
    case 'pipeline_failure':
      return 'internal_processing_failed';
    case 'validation_failed':
    case 'invalid_tenant':
    case 'timestamp_inconsistent':
      return 'invalid_input';
    case 'sensitivity_redacted':
      return 'role_restricted';
    case 'partial_data':
      return null;
    case 'ok':
    default:
      return null;
  }
}

export function assertNoDiagnosticsInPublicView(
  view: AiDomainErrorPublicView | AiDomainErrorApiView,
): void {
  const serialized = JSON.stringify(view);
  if (serialized.includes('diagnostics') || serialized.includes('stack')) {
    throw new Error('Public error view leaked internal diagnostics');
  }
  if (BEARER_PATTERN.test(serialized) || API_KEY_PATTERN.test(serialized)) {
    throw new Error('Public error view leaked credential pattern');
  }
  if (MISTRAL_KEY_PATTERN.test(serialized) && serialized.length > 80) {
    // long opaque tokens unlikely in safe messages
    throw new Error('Public error view may contain secret material');
  }
}
