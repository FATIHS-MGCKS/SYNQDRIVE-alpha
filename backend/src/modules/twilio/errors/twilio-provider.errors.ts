export enum TwilioProviderErrorCode {
  UNAUTHORIZED = 'TWILIO_UNAUTHORIZED',
  REGION_MISMATCH = 'TWILIO_REGION_MISMATCH',
  RESOURCE_NOT_FOUND = 'TWILIO_RESOURCE_NOT_FOUND',
  RATE_LIMITED = 'TWILIO_RATE_LIMITED',
  PROVIDER_UNAVAILABLE = 'TWILIO_PROVIDER_UNAVAILABLE',
  INVALID_CONFIGURATION = 'TWILIO_INVALID_CONFIGURATION',
  TENANT_ISOLATION_VIOLATION = 'TWILIO_TENANT_ISOLATION_VIOLATION',
}

export class TwilioProviderError extends Error {
  readonly code: TwilioProviderErrorCode;
  readonly cause?: unknown;

  constructor(code: TwilioProviderErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'TwilioProviderError';
    this.code = code;
    this.cause = cause;
  }
}

export class TwilioUnauthorizedError extends TwilioProviderError {
  constructor(message = 'Twilio credentials rejected.') {
    super(TwilioProviderErrorCode.UNAUTHORIZED, message);
    this.name = 'TwilioUnauthorizedError';
  }
}

export class TwilioRegionMismatchError extends TwilioProviderError {
  constructor(message = 'Twilio account region/edge does not match required ie1/dublin routing.') {
    super(TwilioProviderErrorCode.REGION_MISMATCH, message);
    this.name = 'TwilioRegionMismatchError';
  }
}

export class TwilioResourceNotFoundError extends TwilioProviderError {
  constructor(message = 'Twilio resource not found for tenant scope.') {
    super(TwilioProviderErrorCode.RESOURCE_NOT_FOUND, message);
    this.name = 'TwilioResourceNotFoundError';
  }
}

export class TwilioRateLimitedError extends TwilioProviderError {
  constructor(message = 'Twilio rate limit exceeded.') {
    super(TwilioProviderErrorCode.RATE_LIMITED, message);
    this.name = 'TwilioRateLimitedError';
  }
}

export class TwilioProviderUnavailableError extends TwilioProviderError {
  constructor(message = 'Twilio provider is temporarily unavailable.') {
    super(TwilioProviderErrorCode.PROVIDER_UNAVAILABLE, message);
    this.name = 'TwilioProviderUnavailableError';
  }
}

export class TwilioInvalidConfigurationError extends TwilioProviderError {
  constructor(message = 'Twilio tenant configuration is invalid.') {
    super(TwilioProviderErrorCode.INVALID_CONFIGURATION, message);
    this.name = 'TwilioInvalidConfigurationError';
  }
}

export class TwilioTenantIsolationViolationError extends TwilioProviderError {
  constructor(message = 'Twilio tenant isolation violation.') {
    super(TwilioProviderErrorCode.TENANT_ISOLATION_VIOLATION, message);
    this.name = 'TwilioTenantIsolationViolationError';
  }
}
