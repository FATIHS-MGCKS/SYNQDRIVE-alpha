export class EuromasterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'EuromasterError';
  }
}

export class EuromasterIntegrationDisabledError extends EuromasterError {
  constructor(orgId?: string) {
    super(
      `Euromaster integration is disabled${orgId ? ` for org ${orgId}` : ''}`,
      'EUROMASTER_DISABLED',
      403,
    );
    this.name = 'EuromasterIntegrationDisabledError';
  }
}

export class EuromasterAuthorizationMissingError extends EuromasterError {
  constructor(
    public readonly missingScopes: string[],
    orgId?: string,
  ) {
    super(
      `Missing data authorization scopes for Euromaster: ${missingScopes.join(', ')}`,
      'EUROMASTER_AUTH_MISSING',
      403,
      { missingScopes, orgId },
    );
    this.name = 'EuromasterAuthorizationMissingError';
  }
}

export class EuromasterConfigError extends EuromasterError {
  constructor(detail: string) {
    super(
      `Euromaster configuration error: ${detail}`,
      'EUROMASTER_CONFIG_ERROR',
      500,
      { detail },
    );
    this.name = 'EuromasterConfigError';
  }
}

export class EuromasterAuthError extends EuromasterError {
  constructor(detail: string, httpStatus?: number) {
    super(
      `Euromaster authentication failed: ${detail}`,
      'EUROMASTER_AUTH_ERROR',
      httpStatus ?? 401,
      { detail },
    );
    this.name = 'EuromasterAuthError';
  }
}

export class EuromasterApiError extends EuromasterError {
  constructor(
    detail: string,
    httpStatus: number,
    public readonly upstreamCode?: string,
    upstreamDetails?: Record<string, unknown>,
  ) {
    super(
      `Euromaster API error (${httpStatus}): ${detail}`,
      'EUROMASTER_API_ERROR',
      httpStatus,
      { upstreamCode, ...upstreamDetails },
    );
    this.name = 'EuromasterApiError';
  }
}

export class EuromasterTimeoutError extends EuromasterError {
  constructor(operation: string, timeoutMs: number) {
    super(
      `Euromaster request timed out after ${timeoutMs}ms: ${operation}`,
      'EUROMASTER_TIMEOUT',
      504,
      { operation, timeoutMs },
    );
    this.name = 'EuromasterTimeoutError';
  }
}

export class EuromasterMappingError extends EuromasterError {
  constructor(detail: string) {
    super(
      `Euromaster data mapping error: ${detail}`,
      'EUROMASTER_MAPPING_ERROR',
      422,
      { detail },
    );
    this.name = 'EuromasterMappingError';
  }
}

export class EuromasterTenantNotAssignedError extends EuromasterError {
  constructor(orgId: string) {
    super(
      `Euromaster is not assigned or active for organization ${orgId}`,
      'EUROMASTER_TENANT_NOT_ASSIGNED',
      403,
      { orgId },
    );
    this.name = 'EuromasterTenantNotAssignedError';
  }
}
