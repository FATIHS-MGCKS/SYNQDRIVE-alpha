/**
 * Standardized error codes for AI domain tool/query outcomes.
 *
 * Distinct from {@link AiEvidenceReasonCode} — evidence reason codes describe
 * fact quality; domain error codes describe query/tool failures.
 */
export const AI_DOMAIN_ERROR_CODES = [
  /** Authorized lookup found no matching vehicle in tenant scope. */
  'vehicle_not_found',
  /** Multiple vehicles match plate/name/VIN fragment. */
  'vehicle_ambiguous',
  /** Domain service returned no data for a valid entity. */
  'data_not_available',
  /** Data exists but exceeds freshness policy for the query. */
  'data_too_old',
  /** Vehicle/provider integration is not linked. */
  'integration_not_connected',
  /** Upstream provider temporarily unreachable. */
  'integration_temporarily_unavailable',
  /** Requested signal/metric not supported for vehicle type. */
  'signal_not_supported',
  /** Caller lacks required permission (existence may be masked). */
  'permission_denied',
  /** Data exists but is withheld by role/policy. */
  'role_restricted',
  /** Derived domain state contradicts persisted source of truth. */
  'domain_status_inconsistent',
  /** Operation exceeded allowed latency. */
  'timeout',
  /** Caller/tool input failed validation. */
  'invalid_input',
  /** Unexpected failure inside SynqDrive processing. */
  'internal_processing_failed',
] as const;

export type AiDomainErrorCode = (typeof AI_DOMAIN_ERROR_CODES)[number];

export const AI_DOMAIN_ERROR_SEVERITY = [
  'informational',
  'warning',
  'error',
  'critical',
] as const;

export type AiDomainErrorSeverity = (typeof AI_DOMAIN_ERROR_SEVERITY)[number];

export const AI_DOMAIN_ERROR_RETRY_POLICY = [
  'retryable',
  'non_retryable',
] as const;

export type AiDomainErrorRetryPolicy =
  (typeof AI_DOMAIN_ERROR_RETRY_POLICY)[number];

/**
 * Audit event names for AI domain query failures — stable for log pipelines.
 */
export const AI_DOMAIN_AUDIT_EVENTS = [
  'ai.domain_query.error',
  'ai.domain_query.vehicle_not_found',
  'ai.domain_query.vehicle_ambiguous',
  'ai.domain_query.data_not_available',
  'ai.domain_query.data_too_old',
  'ai.domain_query.integration_not_connected',
  'ai.domain_query.integration_unavailable',
  'ai.domain_query.signal_not_supported',
  'ai.domain_query.permission_denied',
  'ai.domain_query.role_restricted',
  'ai.domain_query.domain_inconsistent',
  'ai.domain_query.timeout',
  'ai.domain_query.invalid_input',
  'ai.domain_query.internal_failed',
  'ai.domain_query.partial_result',
] as const;

export type AiDomainAuditEvent = (typeof AI_DOMAIN_AUDIT_EVENTS)[number];

/** Suggested HTTP status when surfacing through REST (not all paths use HTTP). */
export const AI_DOMAIN_HTTP_STATUS = {
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  REQUEST_TIMEOUT: 408,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

export type AiDomainHttpStatus =
  (typeof AI_DOMAIN_HTTP_STATUS)[keyof typeof AI_DOMAIN_HTTP_STATUS];
