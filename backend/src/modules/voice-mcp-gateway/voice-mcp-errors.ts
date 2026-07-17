export type VoiceMcpErrorCode =
  | 'CustomerNotFound'
  | 'MultipleMatches'
  | 'PermissionDenied'
  | 'ToolNotAllowed'
  | 'TenantMismatch'
  | 'DataUnavailable'
  | 'Timeout'
  | 'RateLimited'
  | 'InvalidToken'
  | 'GatewayDisabled';

export class VoiceMcpError extends Error {
  readonly code: VoiceMcpErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: VoiceMcpErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'VoiceMcpError';
    this.code = code;
    this.details = details;
  }
}

export function isVoiceMcpError(error: unknown): error is VoiceMcpError {
  return error instanceof VoiceMcpError;
}

export function toMcpToolErrorPayload(error: unknown): {
  code: VoiceMcpErrorCode;
  message: string;
  details?: Record<string, unknown>;
} {
  if (isVoiceMcpError(error)) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    };
  }

  return {
    code: 'DataUnavailable',
    message: 'The requested data is temporarily unavailable.',
  };
}
