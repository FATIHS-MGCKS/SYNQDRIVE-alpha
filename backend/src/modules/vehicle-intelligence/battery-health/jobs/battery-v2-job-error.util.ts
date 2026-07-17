import { BatteryV2JobValidationError } from './battery-v2-job.validation';
import { BatteryV2VehicleLockContendedError } from './battery-v2-vehicle-lock.service';
import {
  BATTERY_V2_JOB_ERROR_CODES,
  BatteryV2JobProcessingError,
  type BatteryV2JobErrorCode,
} from './battery-v2-job.errors';

const TOKEN_PATTERN =
  /\b(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|Bearer\s+\S+|api[_-]?key[=:]\S+)/gi;

export function sanitizeBatteryV2LogMessage(message: string): string {
  return message
    .replace(TOKEN_PATTERN, '[redacted-token]')
    .replace(/\S+@\S+\.\S+/g, '[redacted-email]')
    .slice(0, 500);
}

export function classifyBatteryV2JobError(err: unknown): {
  code: BatteryV2JobErrorCode;
  retryable: boolean;
  message: string;
} {
  if (err instanceof BatteryV2JobProcessingError) {
    return {
      code: err.code,
      retryable: err.retryable,
      message: sanitizeBatteryV2LogMessage(err.message),
    };
  }

  if (err instanceof BatteryV2JobValidationError) {
    return {
      code: BATTERY_V2_JOB_ERROR_CODES.VALIDATION_FAILED,
      retryable: false,
      message: sanitizeBatteryV2LogMessage(err.message),
    };
  }

  if (err instanceof BatteryV2VehicleLockContendedError) {
    return {
      code: BATTERY_V2_JOB_ERROR_CODES.LOCK_CONTENTION,
      retryable: true,
      message: sanitizeBatteryV2LogMessage(err.message),
    };
  }

  const message = sanitizeBatteryV2LogMessage(
    err instanceof Error ? err.message : String(err),
  );
  const lower = message.toLowerCase();

  if (
    lower.includes('econnrefused') ||
    lower.includes('etimedout') ||
    lower.includes('redis') ||
    lower.includes('timeout') ||
    lower.includes('temporarily unavailable')
  ) {
    return {
      code: BATTERY_V2_JOB_ERROR_CODES.TRANSIENT_INFRA,
      retryable: true,
      message,
    };
  }

  if (
    lower.includes('503') ||
    lower.includes('502') ||
    lower.includes('504') ||
    lower.includes('provider') ||
    lower.includes('dimo') ||
    lower.includes('graphql')
  ) {
    return {
      code: BATTERY_V2_JOB_ERROR_CODES.PROVIDER_UNAVAILABLE,
      retryable: true,
      message,
    };
  }

  if (lower.includes('429') || lower.includes('rate limit')) {
    return {
      code: BATTERY_V2_JOB_ERROR_CODES.PROVIDER_RATE_LIMITED,
      retryable: true,
      message,
    };
  }

  if (
    lower.includes('missing organizationid') ||
    lower.includes('missing dimotokenid') ||
    lower.includes('not configured')
  ) {
    return {
      code: BATTERY_V2_JOB_ERROR_CODES.PERMANENT_CONFIG,
      retryable: false,
      message,
    };
  }

  return {
    code: BATTERY_V2_JOB_ERROR_CODES.HANDLER_FAILED,
    retryable: true,
    message,
  };
}
