export enum ElevenLabsProviderErrorCode {
  UNAUTHORIZED = 'ELEVENLABS_UNAUTHORIZED',
  RATE_LIMITED = 'ELEVENLABS_RATE_LIMITED',
  INVALID_CONFIGURATION = 'ELEVENLABS_INVALID_CONFIGURATION',
  RESOURCE_NOT_FOUND = 'ELEVENLABS_RESOURCE_NOT_FOUND',
  PROVIDER_UNAVAILABLE = 'ELEVENLABS_PROVIDER_UNAVAILABLE',
  REGION_MISMATCH = 'ELEVENLABS_REGION_MISMATCH',
  UNSUPPORTED_FEATURE = 'ELEVENLABS_UNSUPPORTED_FEATURE',
  PROVIDER_CONFLICT = 'ELEVENLABS_PROVIDER_CONFLICT',
  TENANT_ISOLATION_VIOLATION = 'ELEVENLABS_TENANT_ISOLATION_VIOLATION',
}

export class ElevenLabsProviderError extends Error {
  readonly code: ElevenLabsProviderErrorCode;
  readonly cause?: unknown;

  constructor(code: ElevenLabsProviderErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'ElevenLabsProviderError';
    this.code = code;
    this.cause = cause;
  }
}

export class ElevenLabsUnauthorizedError extends ElevenLabsProviderError {
  constructor(message = 'ElevenLabs credentials rejected.') {
    super(ElevenLabsProviderErrorCode.UNAUTHORIZED, message);
    this.name = 'ElevenLabsUnauthorizedError';
  }
}

export class ElevenLabsRateLimitedError extends ElevenLabsProviderError {
  constructor(message = 'ElevenLabs rate limit exceeded.') {
    super(ElevenLabsProviderErrorCode.RATE_LIMITED, message);
    this.name = 'ElevenLabsRateLimitedError';
  }
}

export class ElevenLabsInvalidConfigurationError extends ElevenLabsProviderError {
  constructor(message = 'ElevenLabs provider configuration is invalid.') {
    super(ElevenLabsProviderErrorCode.INVALID_CONFIGURATION, message);
    this.name = 'ElevenLabsInvalidConfigurationError';
  }
}

export class ElevenLabsResourceNotFoundError extends ElevenLabsProviderError {
  constructor(message = 'ElevenLabs resource not found.') {
    super(ElevenLabsProviderErrorCode.RESOURCE_NOT_FOUND, message);
    this.name = 'ElevenLabsResourceNotFoundError';
  }
}

export class ElevenLabsProviderUnavailableError extends ElevenLabsProviderError {
  constructor(message = 'ElevenLabs provider is temporarily unavailable.') {
    super(ElevenLabsProviderErrorCode.PROVIDER_UNAVAILABLE, message);
    this.name = 'ElevenLabsProviderUnavailableError';
  }
}

export class ElevenLabsRegionMismatchError extends ElevenLabsProviderError {
  constructor(message = 'ElevenLabs region configuration mismatch.') {
    super(ElevenLabsProviderErrorCode.REGION_MISMATCH, message);
    this.name = 'ElevenLabsRegionMismatchError';
  }
}

export class ElevenLabsUnsupportedFeatureError extends ElevenLabsProviderError {
  constructor(message = 'ElevenLabs feature is not supported for this workspace.') {
    super(ElevenLabsProviderErrorCode.UNSUPPORTED_FEATURE, message);
    this.name = 'ElevenLabsUnsupportedFeatureError';
  }
}

export class ElevenLabsProviderConflictError extends ElevenLabsProviderError {
  constructor(message = 'ElevenLabs provider resource conflict.') {
    super(ElevenLabsProviderErrorCode.PROVIDER_CONFLICT, message);
    this.name = 'ElevenLabsProviderConflictError';
  }
}

export class ElevenLabsTenantIsolationViolationError extends ElevenLabsProviderError {
  constructor(message = 'ElevenLabs tenant isolation violation.') {
    super(ElevenLabsProviderErrorCode.TENANT_ISOLATION_VIOLATION, message);
    this.name = 'ElevenLabsTenantIsolationViolationError';
  }
}
