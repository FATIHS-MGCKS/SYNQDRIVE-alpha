import type { BatteryV2JobType } from './battery-v2-job.types';

/** Machine-readable Battery V2 job error codes (no PII, no tokens). */
export const BATTERY_V2_JOB_ERROR_CODES = {
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  PROVIDER_BAD_RESPONSE: 'PROVIDER_BAD_RESPONSE',
  PROVIDER_RATE_LIMITED: 'PROVIDER_RATE_LIMITED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  LOCK_CONTENTION: 'LOCK_CONTENTION',
  HANDLER_FAILED: 'HANDLER_FAILED',
  TRANSIENT_INFRA: 'TRANSIENT_INFRA',
  PERMANENT_CONFIG: 'PERMANENT_CONFIG',
  DEAD_LETTER: 'DEAD_LETTER',
  UNKNOWN: 'UNKNOWN',
} as const;

export type BatteryV2JobErrorCode =
  (typeof BATTERY_V2_JOB_ERROR_CODES)[keyof typeof BATTERY_V2_JOB_ERROR_CODES];

export class BatteryV2JobProcessingError extends Error {
  readonly code: BatteryV2JobErrorCode;
  readonly retryable: boolean;
  readonly jobType?: BatteryV2JobType;

  constructor(input: {
    code: BatteryV2JobErrorCode;
    message: string;
    retryable?: boolean;
    jobType?: BatteryV2JobType;
    cause?: unknown;
  }) {
    super(input.message);
    this.name = 'BatteryV2JobProcessingError';
    this.code = input.code;
    this.retryable = input.retryable ?? true;
    this.jobType = input.jobType;
  }
}

export class BatteryV2ProviderError extends BatteryV2JobProcessingError {
  constructor(message: string, input?: { retryable?: boolean; jobType?: BatteryV2JobType }) {
    super({
      code: BATTERY_V2_JOB_ERROR_CODES.PROVIDER_UNAVAILABLE,
      message,
      retryable: input?.retryable ?? true,
      jobType: input?.jobType,
    });
    this.name = 'BatteryV2ProviderError';
  }
}
